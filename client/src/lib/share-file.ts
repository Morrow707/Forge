import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Media } from "@capacitor-community/media";
import { resolveApiUrl, getNativeToken } from "@/lib/queryClient";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Hands a blob to the native share sheet (phones/tablets that support the
 * Web Share API with files) or falls back to a plain browser download. No
 * public link is ever created -- the file only ever exists in the
 * requester's own browser. Shared by shareOrDownloadFile below (which
 * fetches its blob from a URL) and by anything that renders a file
 * client-side, like the canvas-drawn share cards.
 *
 * Inside the native app, neither the Web Share API nor the <a download>
 * fallback below actually works -- WKWebView doesn't have a download
 * manager, and navigator.share is generally unavailable there. The file
 * has to be written to disk first (via @capacitor/filesystem). From there,
 * a photo or video goes straight into the camera roll (via
 * @capacitor-community/media) -- the whole point of tapping "download" on a
 * form-check clip or a PR card, and exactly what NSPhotoLibraryAddUsageDescription
 * in Info.plist already promises ("save form-check videos and shareable PR
 * cards to your Photos library when you choose to download them"). A share
 * sheet that then asks the athlete to pick "Save to Files" or "Send" is a
 * confusing extra step for what should be a one-tap save. Anything else (a
 * CSV/PDF/ICS export) has no business in Photos, so those -- and any
 * photo/video save that fails (permission denied, or Android without an
 * album identifier configured) -- keep going through the native share sheet
 * instead (via @capacitor/share), same as before this existed. */
export async function shareOrDownloadBlob(blob: Blob, filename: string, shareTitle?: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      const written = await Filesystem.writeFile({
        path: filename,
        data: await blobToBase64(blob),
        directory: Directory.Cache,
      });
      const isPhoto = blob.type.startsWith("image/");
      const isVideo = blob.type.startsWith("video/");
      if (isPhoto || isVideo) {
        try {
          if (isPhoto) await Media.savePhoto({ path: written.uri });
          else await Media.saveVideo({ path: written.uri });
          return;
        } catch (err) {
          console.warn("Could not save directly to Photos, falling back to the share sheet", err);
        }
      }
      await Share.share({ title: shareTitle, files: [written.uri] });
    } catch (err) {
      // A cancelled/dismissed share sheet rejects too on some platforms --
      // there's no meaningful fallback to a "download" on native, so this
      // is just swallowed the same way the web path below ignores AbortError.
      console.warn("Native share failed", err);
    }
    return;
  }

  const file = new File([blob], filename, { type: blob.type });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // Fall through to download if sharing failed for any other reason.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Fetches a same-origin URL (auth cookie goes along automatically, plus the
 * native bearer token on native -- see queryClient.ts) and shares/downloads
 * the resulting blob -- see shareOrDownloadBlob above. */
export async function shareOrDownloadFile(url: string, filename: string, shareTitle?: string) {
  const token = getNativeToken();
  const res = await fetch(resolveApiUrl(url), {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Couldn't generate that file");
  const blob = await res.blob();
  await shareOrDownloadBlob(blob, filename, shareTitle);
}
