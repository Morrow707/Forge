import { useState } from "react";
import { Play } from "lucide-react";
import { externalLinkClick } from "@/lib/open-external";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExerciseVideoPlayer } from "@/components/exercise-video-player";

export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1] || null;
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/shorts/")[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Compact pill that plays the exercise's demo video IN AN IN-APP SHEET.
 *
 * It used to be an <a target="_blank"> into Capacitor's external browser, which on a phone
 * means leaving Forge mid-set to look at a squat and finding your own way back. Now it opens a
 * dialog with an embedded player -- the video plays inside Forge.
 *
 * THE PILL STAYS A PILL. This was an inline thumbnail/player filling the card's width once
 * before, and it was removed for taking too large a chunk of the card for a demo clip. That
 * decision still holds: the fix for "it leaves the app" is not "put the player back in the
 * card", it is to keep the small control and open the player over it. The full-width inline
 * player lives on the exercise and skill DETAIL pages, which have the room for it.
 *
 * A URL with no video id in it -- which is every seeded one today, they are all
 * youtube.com/results search links -- keeps the old out-to-YouTube behaviour, because there is
 * nothing to embed and a dialog containing nothing helps no one.
 *
 * `accentColor`: a coach's Personal Page override (see shared/schema.ts's
 * ExercisePageTheme.watchDemoColor) -- an explicit hex, applied as an inline style so it wins
 * over the default muted-foreground/border classes without needing a new CSS custom property.
 * Omitted/null keeps the existing neutral look untouched. */
export function ExerciseVideoThumb({
  url,
  name,
  accentColor,
}: {
  url: string | null;
  name: string;
  accentColor?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  const pill =
    "inline-flex items-center gap-1.5 self-start rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary";
  const style = accentColor ? { borderColor: accentColor, color: accentColor } : undefined;

  // Nothing to embed -- see the comment above.
  if (!extractYouTubeId(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={externalLinkClick(url)}
        aria-label={`Find a ${name} demo video`}
        className={pill}
        style={style}
      >
        <Play className="h-3 w-3" />
        Find a demo
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Watch ${name} demo video`}
        className={pill}
        style={style}
      >
        <Play className="h-3 w-3" />
        Watch Demo
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
          </DialogHeader>
          <ExerciseVideoPlayer url={url} name={name} />
        </DialogContent>
      </Dialog>
    </>
  );
}
