import { useState } from "react";
import { Play } from "lucide-react";
import { extractYouTubeId } from "@/components/exercise-video";
import { externalLinkClick } from "@/lib/open-external";

/**
 * THE DEMO VIDEO PLAYS INSIDE FORGE, NOT IN SOMEBODY ELSE'S APP.
 *
 * "Watch Demo" was an <a target="_blank"> that handed the athlete to Capacitor's external
 * browser sheet, which on a phone means leaving Forge mid-set to look at a squat and finding
 * their own way back. The parts to do better were already here -- extractYouTubeId sits in
 * exercise-video.tsx and class-lesson-reader-dialog.tsx has been building youtube.com/embed
 * iframes for lesson videos the whole time. The exercise card was the one surface that never
 * got it.
 *
 * WHY AN EMBED AND NOT A COPY OF THE FILE. Forge sells the exercises, not the videos -- the
 * demo is somebody else's work shown alongside our programming, and it stays that way. An
 * official YouTube iframe serves the video from YouTube under the uploader's own terms, with
 * their ads and their attribution intact, which is what makes showing it legitimate. Pulling
 * the stream down and re-hosting it would be a copy, whatever the intent. So the iframe is not
 * a shortcut here, it is the correct shape: their content, their player, our page.
 *
 * NOCOOKIE, BECAUSE THIRTEEN-YEAR-OLDS USE THIS. youtube-nocookie.com does not set tracking
 * cookies until somebody actually presses play, and combined with the click-to-load below it
 * means an athlete who never opens a demo never touches Google at all. That is worth one CSP
 * line on a platform with children on it.
 *
 * CLICK TO LOAD, NOT AUTOLOAD. An exercise page can list a dozen movements; a dozen iframes on
 * mount is a dozen third-party connections and a visibly slower page for a video most athletes
 * will not open. The thumbnail is a plain image (img.youtube.com, already allowed by the CSP)
 * and the player is created on the first tap.
 *
 * AND IT FALLS BACK RATHER THAN FAILING. Every seeded URL today is a youtube.com/results
 * SEARCH link with no video id in it, so there is nothing to embed -- those keep the old
 * out-to-YouTube link, unchanged, until real ids are backfilled. A video whose owner disabled
 * embedding shows YouTube's own refusal inside the frame, so the external link stays offered
 * underneath: an athlete is never left looking at a dead black box.
 */
export function ExerciseVideoPlayer({
  url,
  name,
  className,
}: {
  url: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  if (!url) return null;

  const videoId = extractYouTubeId(url);

  // No id means a search link (every seeded URL today) or a non-YouTube host. Nothing to embed,
  // so this behaves exactly as it did before -- see the file comment.
  if (!videoId) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={externalLinkClick(url)}
        aria-label={`Find a ${name} demo video`}
        className="inline-flex items-center gap-1.5 self-start rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <Play className="h-3 w-3" />
        Find a demo
      </a>
    );
  }

  return (
    <div className={className}>
      <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
        {playing ? (
          <iframe
            // nocookie, and playsinline so iOS plays it in the card rather than throwing it
            // into the system fullscreen player, which is the same "don't leave our app"
            // problem in a different costume.
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`}
            title={`${name} demo video`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${name} demo video`}
            className="group relative h-full w-full"
          >
            <img
              src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
              alt=""
              // Decorative: the button's aria-label already names the video, and a second
              // announcement of the same thing is noise to a screen reader.
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
      {/* Kept underneath on purpose. A video whose owner disabled embedding shows YouTube's own
          refusal inside the frame, and without this the athlete would be looking at a dead box
          with no way through to the video that does exist. */}
      <a
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={externalLinkClick(`https://www.youtube.com/watch?v=${videoId}`)}
        className="mt-1 inline-block text-[11px] text-muted-foreground hover:text-primary hover:underline"
      >
        Open on YouTube
      </a>
    </div>
  );
}
