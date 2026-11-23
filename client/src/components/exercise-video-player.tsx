import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { extractYouTubeId } from "@/components/exercise-video";
import { clipWindowFromUrl } from "@shared/exercise-video-match";
import { youTubePlayerState } from "@/lib/youtube-player-state";

import { msg, useT } from "@/i18n";
/**
 * THE DEMO VIDEO PLAYS INSIDE FORGE, AND THAT IS ALL IT DOES.
 *
 * Scott, 2026-11-23: "I don't want a way for them to search either only to play or replay our
 * video, nothing else." So:
 * - A link with no video in it (a seeded youtube.com/results search page, an unknown host) draws
 *   NOTHING. There is no "Find a demo" and no way to search from Forge.
 * - A YouTube video plays in YouTube's own player (we stream it, we never store it: the video is
 *   the uploader's, shown in their player with their attribution), with its own controls OFF and
 *   a Forge layer over the whole frame. YouTube's title, logo, "more videos" strip and end screen
 *   are all links out to YouTube; the layer takes every tap, so none of them can be reached. Our
 *   layer has exactly three things: play, pause, and replay at the end.
 * - A video whose owner refused embedding says so in one sentence, with no link out.
 *
 * nocookie, and click-to-load: an athlete who never presses play never touches Google, which
 * matters on a platform with thirteen-year-olds on it. playsinline keeps iOS from throwing it
 * into the system fullscreen player.
 *
 * Driven through YouTube's documented iframe postMessage commands (enablejsapi=1), so no script
 * from YouTube is loaded into Forge's page.
 */
type PlayerState = "playing" | "paused" | "ended" | "error" | "loading";

/** What the layer over the frame says in each state; `word` null draws no label. */
const LAYER: Record<Exclude<PlayerState, "error">, { label: string; word: string | null }> = {
  loading: { label: msg("Play {name} demo video"), word: msg("Play") },
  playing: { label: msg("Pause {name} demo video"), word: null },
  paused: { label: msg("Play {name} demo video"), word: msg("Play") },
  ended: { label: msg("Replay {name} demo video"), word: msg("Replay") },
};

export function ExerciseVideoPlayer({
  url,
  name,
  className,
}: {
  url: string | null | undefined;
  name: string;
  className?: string;
}) {
  const t = useT();
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<PlayerState>("loading");
  const frame = useRef<HTMLIFrameElement>(null);
  const videoId = url ? extractYouTubeId(url) : null;

  useEffect(() => {
    if (!started) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const next = youTubePlayerState(e.data);
      if (next) setState(next);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [started]);

  if (!url || !videoId) return null;

  // A demo cut from a chapter of a routine plays only its own chapter (see parseChapters).
  const clip = clipWindowFromUrl(url);
  const clipParams = `${clip.start != null ? `&start=${clip.start}` : ""}${clip.end != null ? `&end=${clip.end}` : ""}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const send = (func: string, args: unknown[] = []) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  // Ask the player to report its state changes to this page.
  const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: videoId }), "*");

  const onLayerTap = () => {
    if (state === "playing") send("pauseVideo");
    else if (state === "ended") {
      send("seekTo", [clip.start ?? 0, true]);
      send("playVideo");
    } else send("playVideo");
  };

  return (
    <div className={className}>
      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
        {started ? (
          <>
            <iframe
              ref={frame}
              onLoad={listen}
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(origin)}${clipParams}`}
              title={t("{name} demo video", { name })}
              className="pointer-events-none h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
            />
            {state === "error" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black p-4 text-center text-sm text-white/80">
                {t("This video can't play in Forge.")}
              </div>
            ) : (
              // Covers the whole frame, so nothing of YouTube's can be tapped.
              <button
                type="button"
                onClick={onLayerTap}
                aria-label={t(LAYER[state].label, { name })}
                className={`absolute inset-0 flex items-center justify-center transition-colors ${state === "playing" ? "bg-transparent" : "bg-black/60"}`}
              >
                {LAYER[state].word && (
                  <span className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white">
                    {state === "ended" ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white" />}
                    {t(LAYER[state].word!)}
                  </span>
                )}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setStarted(true)}
            aria-label={t("Play {name} demo video", { name })}
            className="group relative h-full w-full"
          >
            <img
              src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
              alt=""
              // Decorative: the button's aria-label already names the video.
              aria-hidden="true"
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/40">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70">
                <Play className="h-6 w-6 fill-white text-white" />
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
