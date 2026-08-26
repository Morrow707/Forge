import { useState } from "react";
import { Youtube, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { externalLinkClick } from "@/lib/open-external";

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

/** Clickable thumbnail that expands to an inline player. `size="sm"` is a
 * compact corner thumbnail; `size="lg"` fills the width of its container --
 * used at the top of the exercise logging card so the demo is the first
 * thing an athlete sees, above the exercise name. */
export function ExerciseVideoThumb({
  url,
  name,
  size = "sm",
}: {
  url: string | null;
  name: string;
  size?: "sm" | "lg";
}) {
  const [expanded, setExpanded] = useState(false);
  if (!url) return null;
  const videoId = extractYouTubeId(url);
  const isLg = size === "lg";
  // Capped and centered, not a full-bleed hero -- tapping it already gets an
  // athlete to a fullscreen player (the iframe's own allowFullScreen below),
  // so the inline thumbnail doesn't need to dominate the card just to be a
  // legible tap target.
  const frameClass = isLg
    ? "aspect-video w-full max-w-xs sm:max-w-sm mx-auto rounded-lg"
    : "h-20 w-28 shrink-0 rounded-md";

  if (expanded && videoId) {
    return (
      <div className={cn(frameClass, "overflow-hidden border border-border bg-black")}>
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title={`${name} demo video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (videoId) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(frameClass, "relative overflow-hidden border border-border bg-black")}
        aria-label={`Play ${name} demo video`}
      >
        <img
          src={`https://img.youtube.com/vi/${videoId}/${isLg ? "hqdefault" : "mqdefault"}.jpg`}
          alt=""
          className="h-full w-full object-cover opacity-80"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-black/60",
              isLg ? "h-14 w-14" : "h-8 w-8",
            )}
          >
            <Play className={cn("fill-white text-white", isLg ? "h-6 w-6" : "h-4 w-4")} />
          </span>
        </span>
      </button>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={externalLinkClick(url)}
      className={cn(
        frameClass,
        "flex flex-col items-center justify-center gap-1 border border-dashed border-border text-center text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary",
      )}
    >
      <Youtube className={isLg ? "h-8 w-8" : "h-5 w-5"} />
      <span className={cn("font-semibold", isLg ? "text-xs" : "text-[10px]")}>Watch</span>
    </a>
  );
}
