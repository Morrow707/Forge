/** YouTube/Vimeo links play inline like an uploaded clip instead of bouncing to a new tab --
 * recognizes the handful of real-world URL shapes each site hands out (watch?v=, youtu.be,
 * /shorts/, an already-embed URL, a plain vimeo.com/<id>). Anything else (an uploaded file, or
 * a host this doesn't recognize, including a YouTube SEARCH page) returns null and the caller
 * falls back to its own behaviour -- a native <video> tag for an uploaded file, a click-out
 * link for anything unrecognized. Shared by the lesson reader and the drill day. */
import { clipWindowFromUrl } from "@shared/exercise-video-match";

/** `?start=` / `&end=` for a YouTube embed, read off the link's own `t=` and `end=`, so a demo
 * linked from 0:15 starts at 0:15 when it plays in place too (14 of the ExLib videos do). */
function youTubeClip(url: string): string {
  const clip = clipWindowFromUrl(url);
  const params = [clip.start != null ? `start=${clip.start}` : null, clip.end != null ? `end=${clip.end}` : null].filter(Boolean);
  return params.length ? `?${params.join("&")}` : "";
}

export function getEmbedUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url, window.location.origin);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtube.com") {
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}${youTubeClip(u.href)}`;
    const shorts = u.pathname.match(/^\/shorts\/([\w-]+)/);
    if (shorts) return `https://www.youtube.com/embed/${shorts[1]}${youTubeClip(u.href)}`;
    if (/^\/embed\//.test(u.pathname)) return url;
    return null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}${youTubeClip(u.href)}` : null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.match(/^\/(\d+)/);
    return id ? `https://player.vimeo.com/video/${id[1]}` : null;
  }
  return null;
}

/** An uploaded clip that plays in a native <video>. */
export function isUploadedVideo(url: string): boolean {
  return url.startsWith("/uploads/");
}
