import { useState } from "react";
import { Youtube, Play } from "lucide-react";

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

/** Compact clickable thumbnail that expands to an inline player -- matches
 * a TrainHeroic-style exercise row (thumbnail on the left, info to the
 * right) rather than a full-width always-on video. */
export function ExerciseVideoThumb({ url, name }: { url: string | null; name: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!url) return null;
  const videoId = extractYouTubeId(url);

  if (expanded && videoId) {
    return (
      <div className="aspect-video w-full shrink-0 overflow-hidden rounded-md border border-border bg-black sm:w-40">
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
        className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-black"
        aria-label={`Play ${name} demo video`}
      >
        <img
          src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
          alt=""
          className="h-full w-full object-cover opacity-80"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60">
            <Play className="h-4 w-4 fill-white text-white" />
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
      className="flex h-20 w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-center text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Youtube className="h-5 w-5" />
      <span className="text-[10px] font-semibold">Watch</span>
    </a>
  );
}
