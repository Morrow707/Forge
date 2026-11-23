/**
 * Reads one message from a YouTube iframe (enablejsapi=1) and says what the player is doing, or
 * null when the message is not about that. YouTube's player states: -1 unstarted, 0 ended,
 * 1 playing, 2 paused, 3 buffering, 5 cued. "onError" means the video cannot play here (most
 * often its owner turned embedding off).
 */
export type YouTubeState = "playing" | "paused" | "ended" | "error";

const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const BY_CODE: Record<number, YouTubeState> = { [YT_ENDED]: "ended", [YT_PLAYING]: "playing", [YT_PAUSED]: "paused" };

export function youTubePlayerState(data: unknown): YouTubeState | null {
  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const m = parsed as { event?: string; info?: unknown };
  if (m.event === "onError") return "error";
  if (m.event === "onStateChange" && typeof m.info === "number") return BY_CODE[m.info] ?? null;
  if (m.event === "infoDelivery" && m.info && typeof m.info === "object") {
    const code = (m.info as { playerState?: unknown }).playerState;
    return typeof code === "number" ? (BY_CODE[code] ?? null) : null;
  }
  return null;
}
