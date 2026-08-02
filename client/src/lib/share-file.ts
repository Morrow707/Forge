/** Fetches a same-origin URL (auth cookie goes along automatically) and
 * either hands it to the native share sheet (phones/tablets that support
 * the Web Share API with files) or falls back to a plain browser download.
 * No public link is ever created -- the file only ever exists as a blob in
 * the requester's own browser. */
export async function shareOrDownloadFile(url: string, filename: string, shareTitle?: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Couldn't generate that file");
  const blob = await res.blob();
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
