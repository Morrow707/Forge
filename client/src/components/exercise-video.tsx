import { Youtube } from "lucide-react";

function extractYouTubeId(url: string): string | null {
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

export function ExerciseVideo({ url, name }: { url: string | null; name: string }) {
  if (!url) return null;
  const videoId = extractYouTubeId(url);

  if (videoId) {
    return (
      <div className="mb-3 aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}`}
          title={`${name} demo video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-3 flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-surface"
    >
      <Youtube className="h-4 w-4 shrink-0" />
      Watch "{name}" on YouTube
    </a>
  );
}
