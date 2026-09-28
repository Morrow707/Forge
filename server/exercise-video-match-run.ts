/**
 * RUNNING THE SIGNATURE MATCHER OVER THE WHOLE LIBRARY AND THE WHOLE POOL.
 *
 * The pure matcher (shared/exercise-signature-match.ts) compares ONE exercise to ONE title. This
 * is the part that has to do it 413 x 15,000 times without taking a minute, and that decides
 * what the report says.
 *
 * TWO THINGS MAKE IT FAST, and both matter more than they look:
 *
 * 1. A TITLE IS PARSED ONCE, not once per exercise. Parsing is the expensive half, and the naive
 *    loop order repeats it 413 times per video for no reason.
 * 2. VIDEOS ARE INDEXED BY HEAD. The head must be equal for any match, so an exercise whose head
 *    is "curl" never looks at a squat video. That turns 6.2 million comparisons into roughly the
 *    sum of the per-head buckets -- a few tens of thousands.
 *
 * THE VOCABULARY IS BUILT FROM THE WHOLE LIBRARY, not from the exercises still needing a video.
 * "Barbell Wrist Curl" may already have a video, and it still has to be the reason Barbell Curl
 * cannot take a wrist curl title -- the grammar is a property of the library, not of the backlog.
 */
import { buildVocabulary, type LibraryExercise, type Vocabulary } from "@shared/exercise-vocabulary";
import {
  AUTO_APPLY_CHANNELS,
  compare,
  exerciseSignature,
  learnBoilerplate,
  prepareTitle,
  stripBoilerplate,
  tierFor,
  titleSignature,
  type RejectReason,
  type Signature,
  type Tier,
} from "@shared/exercise-signature-match";
import type { VideoCandidate } from "@shared/exercise-video-match";

export type SignatureMatch = {
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  tier: Tier;
  /** Two or more allowlisted channels agreeing. Changes nothing about the choice; it is the
   *  cheapest signal available for which matches are safest, so it is shown. */
  corroboration: "single" | "multi";
};

export type SignatureRejection = {
  reason: RejectReason;
  detail: string;
  title?: string;
  channel?: string;
  durationSeconds?: number;
};

export type SignatureRunResult = {
  chosen: Map<string, SignatureMatch>;
  /** The CLOSEST rejection per unmatched exercise, ranked by how far it got. */
  rejections: Map<string, SignatureRejection>;
  /** Unrecognised words seen in otherwise-matching titles, most frequent first. The raw material
   *  for deciding what the vocabulary is missing. */
  unknownWords: Array<{ word: string; count: number; examples: string[] }>;
  /** Two library names that parse identically -- a library problem, not a matching one. */
  duplicateSignatures: Array<[string, string]>;
};

/** How close each refusal got, so the report can show the most informative one. A title refused
 *  on its length was otherwise perfect; one refused on the head was never a candidate. */
const REASON_RANK: Record<RejectReason, number> = {
  duration: 6,
  "unknown-count": 5,
  "muscle-unexplained": 4,
  equipment: 3,
  modifier: 2,
  head: 1,
  "no-head": 0,
  "red-flag": 0,
};

export function runSignatureMatch(
  library: LibraryExercise[],
  pool: VideoCandidate[],
  maxDurationSeconds: number,
  allowlist: readonly string[] = AUTO_APPLY_CHANNELS,
): SignatureRunResult & { vocabulary: Vocabulary; boilerplateByChannel: Record<string, string[]> } {
  const vocabulary = buildVocabulary(library);

  const byChannel = new Map<string, VideoCandidate[]>();
  for (const video of pool) {
    const list = byChannel.get(video.channel) ?? [];
    list.push(video);
    byChannel.set(video.channel, list);
  }
  const boilerplateByChannel: Record<string, string[]> = {};
  for (const [channel, videos] of byChannel) {
    boilerplateByChannel[channel] = learnBoilerplate(videos.map((v) => v.title), vocabulary);
  }

  // Parse every title once. See the header.
  type ParsedVideo = {
    video: VideoCandidate;
    prepared: ReturnType<typeof prepareTitle>;
    signature: Signature;
  };
  const byHead = new Map<string, ParsedVideo[]>();
  for (const video of pool) {
    if (!video.embeddable || !(video.durationSeconds > 0)) continue;
    const prepared = prepareTitle(video.title, vocabulary);
    prepared.firstSegment = stripBoilerplate(
      prepared.firstSegment,
      boilerplateByChannel[video.channel] ?? [],
    );
    const signature = titleSignature(prepared, vocabulary);
    if (!signature.head) continue;
    const list = byHead.get(signature.head) ?? [];
    list.push({ video, prepared, signature });
    byHead.set(signature.head, list);
  }

  const chosen = new Map<string, SignatureMatch>();
  const rejections = new Map<string, SignatureRejection>();
  const unknownCounts = new Map<string, { count: number; examples: Set<string> }>();
  const signatureKeys = new Map<string, string>();
  const duplicateSignatures: Array<[string, string]> = [];

  for (const exercise of library) {
    if (exercise.kind !== "exercise") continue;
    const exSig = exerciseSignature(exercise, vocabulary);

    const key = [
      exSig.head,
      [...exSig.equipmentSet].sort().join("+"),
      [...exSig.modifiers].sort().join("+"),
      [...exSig.muscles].sort().join("+"),
    ].join("|");
    const twin = signatureKeys.get(key);
    if (twin) duplicateSignatures.push([twin, exercise.name]);
    else signatureKeys.set(key, exercise.name);

    if (!exSig.head) {
      rejections.set(exercise.name, {
        reason: "no-head",
        detail: "this exercise's own name has no movement word the library recognises",
      });
      continue;
    }

    const accepted: SignatureMatch[] = [];
    let closest: SignatureRejection | null = null;
    for (const candidate of byHead.get(exSig.head) ?? []) {
      const verdict = compare(
        exercise,
        exSig,
        candidate.prepared,
        candidate.signature,
        vocabulary,
        candidate.video.durationSeconds,
        maxDurationSeconds,
      );
      if (!verdict.ok) {
        if (verdict.reason === "unknown-count") {
          for (const word of candidate.signature.unknown) {
            const entry = unknownCounts.get(word) ?? { count: 0, examples: new Set<string>() };
            entry.count += 1;
            if (entry.examples.size < 3) entry.examples.add(candidate.video.title);
            unknownCounts.set(word, entry);
          }
        }
        if (!closest || REASON_RANK[verdict.reason] > REASON_RANK[closest.reason]) {
          closest = {
            reason: verdict.reason,
            detail: verdict.detail,
            title: candidate.video.title,
            channel: candidate.video.channel,
            durationSeconds: candidate.video.durationSeconds,
          };
        }
        continue;
      }
      accepted.push({
        videoId: candidate.video.videoId,
        title: candidate.video.title,
        channel: candidate.video.channel,
        durationSeconds: candidate.video.durationSeconds,
        tier: tierFor(verdict, candidate.video.durationSeconds, candidate.video.channel, allowlist),
        corroboration: "single",
      });
    }

    if (accepted.length === 0) {
      if (closest) rejections.set(exercise.name, closest);
      else {
        rejections.set(exercise.name, {
          reason: "head",
          detail: "no video in the pool is even of this movement",
        });
      }
      continue;
    }

    // Tier A before B, then shortest -- a 30-second demo beats a 2-minute one of the same lift.
    accepted.sort(
      (a, b) =>
        (a.tier === b.tier ? 0 : a.tier === "A" ? -1 : 1) ||
        a.durationSeconds - b.durationSeconds ||
        a.title.localeCompare(b.title),
    );
    const winner = accepted[0];
    const agreeing = new Set(
      accepted.filter((m) => m.tier === "A").map((m) => m.channel.toLowerCase()),
    );
    chosen.set(exercise.name, { ...winner, corroboration: agreeing.size > 1 ? "multi" : "single" });
  }

  const unknownWords = [...unknownCounts.entries()]
    .map(([word, entry]) => ({ word, count: entry.count, examples: [...entry.examples] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);

  return { chosen, rejections, unknownWords, duplicateSignatures, vocabulary, boilerplateByChannel };
}
