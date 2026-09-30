/**
 * PULLING A CHANNEL'S CATALOGUE, AS CHEAPLY AS THE API ALLOWS.
 *
 * The YouTube Data API charges QUOTA UNITS, not money -- 10,000 a day on the free tier, and
 * there is no billing to exceed. What matters is that the units are spent on the cheap calls:
 *
 *   search.list       100 units a call, up to 50 results
 *   channels.list       1 unit
 *   playlistItems.list  1 unit, up to 50 items
 *   videos.list         1 unit, up to 50 ids
 *
 * So searching per exercise is 100 x 400 = 40,000 units, four days of quota for one backfill.
 * Pulling ten channels' entire upload history and matching LOCALLY (shared/exercise-video-match.ts)
 * is roughly 1 unit per 50 videos: a channel with 1,200 uploads costs 24 units to list and 24
 * more to read durations. Ten channels is about 500 units -- one twentieth of a day.
 *
 * That is why this module only ever lists. It never searches.
 *
 * WHY DURATION NEEDS A SECOND CALL. playlistItems gives ids and titles and nothing else useful;
 * length and embeddability live on videos.list's contentDetails and status. Both are required
 * before a video can be a candidate -- Scott's rule is shorts, not eighteen-minute talking, and
 * a non-embeddable video plays nowhere inside Forge.
 *
 * THE KEY IS READ FROM THE ENVIRONMENT AND NEVER LOGGED. It is a Render env var
 * (YOUTUBE_API_KEY); nothing in this module puts it in a message, an error or a response body.
 */
import { parseIsoDuration, type VideoCandidate } from "@shared/exercise-video-match";

const API = "https://www.googleapis.com/youtube/v3";

export type QuotaLedger = { units: number; calls: number };

export class YouTubeNotConfigured extends Error {
  constructor() {
    super("YOUTUBE_API_KEY is not set on this server.");
    this.name = "YouTubeNotConfigured";
  }
}

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new YouTubeNotConfigured();
  return key;
}

async function get(
  path: string,
  params: Record<string, string>,
  ledger: QuotaLedger,
  cost: number,
): Promise<any> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey());
  const res = await fetch(url);
  ledger.units += cost;
  ledger.calls += 1;
  if (!res.ok) {
    // The body can echo back the request URL, key included, so it is never surfaced verbatim.
    const detail = await res.text().catch(() => "");
    const reason = /"reason":\s*"([a-zA-Z]+)"/.exec(detail)?.[1] ?? "";
    throw new Error(`YouTube ${path} failed: ${res.status}${reason ? ` (${reason})` : ""}`);
  }
  return res.json();
}

/** A channel, by @handle or by UC... id. Returns its uploads playlist and display title. */
export async function resolveChannel(
  handleOrId: string,
  ledger: QuotaLedger,
): Promise<{ channelId: string; title: string; uploadsPlaylistId: string } | null> {
  const raw = handleOrId.trim().replace(/^@/, "");
  const params: Record<string, string> = { part: "snippet,contentDetails" };
  // A UC-prefixed 24-character string is an id; anything else is a handle. Guessing wrong costs
  // one unit and returns nothing, so the cheap test is worth more than a lookup table.
  if (/^UC[A-Za-z0-9_-]{22}$/.test(raw)) params.id = raw;
  else params.forHandle = raw;
  const data = await get("channels", params, ledger, 1);
  let item = data.items?.[0];

  /* A HANDLE THAT DOES NOT RESOLVE FALLS BACK TO ONE SEARCH.
   *
   * The first real run lost three channels to this: westsidebarbell and musclestrengthcom came
   * back with nothing, and "onnit" resolved to some unrelated five-video channel. A handle is a
   * string somebody typed from memory, and YouTube handles do not always match the name -- so a
   * wrong guess silently removed a whole channel's catalogue from the pool and the only sign was
   * a 0 in the report.
   *
   * search.list costs 100 units against the 1-unit calls this module is built around, which is
   * exactly why it is a FALLBACK and never the main path: it fires only for a handle that
   * already failed, so the worst case is a few hundred units on a run that otherwise spends
   * ~250. Cheaper than a channel missing. */
  if (!item && !params.id) {
    const found: any = await get(
      "search",
      { part: "snippet", type: "channel", q: raw, maxResults: "1" },
      ledger,
      100,
    );
    const channelId = found.items?.[0]?.id?.channelId;
    if (channelId) {
      const again = await get(
        "channels",
        { part: "snippet,contentDetails", id: channelId },
        ledger,
        1,
      );
      item = again.items?.[0];
    }
  }
  if (!item) return null;
  const uploads = item.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return null;
  return { channelId: item.id, title: item.snippet?.title ?? raw, uploadsPlaylistId: uploads };
}

/**
 * Every video on a channel, with duration and embeddability, newest first.
 *
 * `maxVideos` is a ceiling under the quota, not a quality filter.
 *
 * It was 1,000, and the first real run showed that binding on FIVE channels at once -- every one
 * of them reported a catalogue of exactly 1000, which is the cap talking, not the channel. That
 * matters more than it sounds: playlistItems returns NEWEST FIRST, so a 1,000 cap on Catalyst
 * Athletics was reading this year's uploads and truncating the exercise library itself, which is
 * older content and the single best source of short demos in the pool.
 *
 * Then 4,000 bound the same way on the 2026-09-28 run: Bodybuilding.com, Functional
 * Bodybuilding and Garage Strength all read exactly 4000, and Bodybuilding.com's exercise
 * database -- the reason it is on the list -- is its OLDEST content, so a newest-first read
 * that stops at 4,000 never reached it and the channel won nine. Scott's question ("in 23k
 * videos we can't find 700?") is what surfaced it: 23,620 was partly the cap talking.
 *
 * 20,000 costs 400 listing calls and 400 detail calls for a channel that size -- 800 units
 * against 10,000 a day, and no channel on the list is anywhere near it. The result also says
 * whether the ceiling was hit, so a capped channel can never again read as a counted one.
 */
export const CATALOGUE_CEILING = 20_000;

export async function channelCatalogue(
  handleOrId: string,
  ledger: QuotaLedger,
  maxVideos = CATALOGUE_CEILING,
): Promise<{ channel: string; videos: VideoCandidate[]; truncated: boolean } | null> {
  const channel = await resolveChannel(handleOrId, ledger);
  if (!channel) return null;

  const ids: string[] = [];
  const titles = new Map<string, string>();
  let pageToken: string | undefined;
  while (ids.length < maxVideos) {
    const page: any = await get(
      "playlistItems",
      {
        part: "contentDetails,snippet",
        playlistId: channel.uploadsPlaylistId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      },
      ledger,
      1,
    );
    for (const item of page.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (!id) continue;
      ids.push(id);
      titles.set(id, item.snippet?.title ?? "");
    }
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  const truncated = ids.length >= maxVideos && Boolean(pageToken);

  const videos: VideoCandidate[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const page: any = await get(
      "videos",
      { part: "contentDetails,status", id: batch.join(",") },
      ledger,
      1,
    );
    for (const item of page.items ?? []) {
      videos.push({
        videoId: item.id,
        title: titles.get(item.id) ?? "",
        channel: channel.title,
        durationSeconds: parseIsoDuration(item.contentDetails?.duration ?? ""),
        // status.embeddable is the only authority on this. A video the owner has disabled
        // embedding on plays nowhere inside Forge, whatever its title says.
        embeddable: item.status?.embeddable !== false,
      });
    }
  }
  return { channel: channel.title, videos, truncated };
}

export function newQuotaLedger(): QuotaLedger {
  return { units: 0, calls: 0 };
}

export function youTubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim());
}

/**
 * THE ONE PLACE search.list EARNS ITS 100 UNITS.
 *
 * Everything above is built to avoid search: a channel catalogue is ~1 unit per 50 videos, and
 * searching per exercise would have cost 40,000 units for the library. That reasoning holds for
 * the movements a strength channel actually films.
 *
 * It does NOT hold for the long tail. Lizard Stretch, Doorway Chest Stretch, Wrist Flexor
 * Stretch, Foam Roll Quads -- these were never refused for quality. No channel in the pool has
 * a video of them AT ALL, so no amount of catalogue pulling or threshold tuning reaches them.
 * Scott, 2026-09-30: "we need to expand for those random videos ... find the most popular or
 * most liked videos for those random ones ... We need every exercise to have one."
 *
 * So: searched ONLY for an exercise the channel pass left empty, one search per exercise, and
 * the caller caps how many run so a pass cannot exceed the day's quota. 100 units buys up to 25
 * candidates; the statistics call that ranks them is 1 unit per 50 and is shared across them.
 *
 * POPULARITY IS A TIE-BREAK, NOT A GATE. It ranks what has already passed every quality rule --
 * the duration cap, embeddability, the red flags and the full signature match. A video does not
 * become a demonstration of the right movement by being popular.
 */
export type SearchedVideo = VideoCandidate & { viewCount: number; likeCount: number };

/** What one searched exercise costs: the search itself plus its share of the details call. */
export const SEARCH_UNITS_PER_EXERCISE = 101;

export async function searchVideosFor(
  query: string,
  ledger: QuotaLedger,
  maxResults = 25,
): Promise<SearchedVideo[]> {
  const found: any = await get(
    "search",
    {
      part: "snippet",
      type: "video",
      q: query,
      maxResults: String(Math.min(50, maxResults)),
      // Embeddable and syndicated at the SEARCH stage, so the 100 units are not spent
      // returning videos that could never play inside Forge. status.embeddable is still
      // checked below -- this narrows, it does not decide.
      videoEmbeddable: "true",
      videoSyndicated: "true",
      // Relevance, not viewCount: ordering by views at this stage returns the most-watched
      // videos that merely MENTION the words, which for "Couch Stretch" is a sofa review.
      // Popularity ranks the matches afterwards, once the signature test has thinned them.
      order: "relevance",
    },
    ledger,
    100,
  );

  const ids: string[] = [];
  const titles = new Map<string, string>();
  const channels = new Map<string, string>();
  for (const item of found.items ?? []) {
    const id = item.id?.videoId;
    if (!id) continue;
    ids.push(id);
    titles.set(id, item.snippet?.title ?? "");
    channels.set(id, item.snippet?.channelTitle ?? "YouTube");
  }
  if (ids.length === 0) return [];

  const details: any = await get(
    "videos",
    { part: "contentDetails,status,statistics", id: ids.join(",") },
    ledger,
    1,
  );

  const out: SearchedVideo[] = [];
  for (const item of details.items ?? []) {
    out.push({
      videoId: item.id,
      title: titles.get(item.id) ?? "",
      channel: channels.get(item.id) ?? "YouTube",
      durationSeconds: parseIsoDuration(item.contentDetails?.duration ?? ""),
      embeddable: item.status?.embeddable !== false,
      // Absent on a video whose owner hides counts -- treated as zero rather than dropped,
      // so a hidden count costs a video its ranking and not its candidacy.
      viewCount: Number(item.statistics?.viewCount ?? 0),
      likeCount: Number(item.statistics?.likeCount ?? 0),
    });
  }
  return out;
}
