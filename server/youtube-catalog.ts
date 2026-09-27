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
  const item = data.items?.[0];
  if (!item) return null;
  const uploads = item.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return null;
  return { channelId: item.id, title: item.snippet?.title ?? raw, uploadsPlaylistId: uploads };
}

/**
 * Every video on a channel, with duration and embeddability, newest first.
 *
 * `maxVideos` is a floor under the quota, not a quality filter: a channel with 4,000 uploads
 * would cost 160 units to walk twice and most of those videos are years of content nobody is
 * matching against. Default 1,000 -- 40 units of listing, 40 of detail.
 */
export async function channelCatalogue(
  handleOrId: string,
  ledger: QuotaLedger,
  maxVideos = 1000,
): Promise<{ channel: string; videos: VideoCandidate[] } | null> {
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
  return { channel: channel.title, videos };
}

export function newQuotaLedger(): QuotaLedger {
  return { units: 0, calls: 0 };
}

export function youTubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim());
}
