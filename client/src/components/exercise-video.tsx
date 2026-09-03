import { Play } from "lucide-react";
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

/** Compact pill that opens the exercise's demo video externally (Capacitor's
 * in-app browser sheet natively, a new tab on web -- see externalLinkClick).
 * Used at the top of the exercise logging card. Previously an inline
 * YouTube thumbnail/player filling the card's width -- too large a chunk of
 * the card for a demo clip, so it's a labeled button now instead. */
export function ExerciseVideoThumb({ url, name }: { url: string | null; name: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={externalLinkClick(url)}
      aria-label={`Watch ${name} demo video`}
      className="inline-flex items-center gap-1.5 self-start rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Play className="h-3 w-3" />
      Watch Demo
    </a>
  );
}
