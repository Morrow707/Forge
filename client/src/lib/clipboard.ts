// navigator.clipboard.writeText silently rejects (or is entirely absent) in
// some mobile browser/PWA contexts -- notably older iOS Safari homescreen
// apps and some Android WebViews -- so a copy button that only calls it
// directly can fail with zero feedback. This falls back to the classic
// hidden-textarea + execCommand("copy") approach, and only reports success
// when a copy actually happened, so callers can show an accurate result
// instead of a toast that lies about what just happened.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the execCommand fallback below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}
