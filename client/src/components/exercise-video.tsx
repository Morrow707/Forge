import { useState } from "react";
import { Play } from "lucide-react";
import { isUploadedVideo } from "@/lib/video-embed";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DemoVideo } from "@/components/demo-video";

import { useT } from "@/i18n";
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
 * A URL with no video in it (a seeded youtube.com/results search page) draws nothing: Forge
 * plays or replays a demo and never sends anybody off to search for one.
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
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!url) return null;

  const pill =
    "inline-flex items-center gap-1.5 self-start rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary";
  const style = accentColor ? { borderColor: accentColor, color: accentColor } : undefined;

  // Nothing to play (a search page, an unknown host): no button at all. Forge only ever plays
  // or replays a demo, never sends anybody to search for one (Scott, 2026-11-23).
  if (!extractYouTubeId(url) && !isUploadedVideo(url)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Watch {name} demo video", { name })}
        className={pill}
        style={style}
      >
        <Play className="h-3 w-3" />
        {t("Watch Demo")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
          </DialogHeader>
          <DemoVideo url={url} name={name} />
        </DialogContent>
      </Dialog>
    </>
  );
}
