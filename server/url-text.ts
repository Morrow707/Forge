// Fetches a URL an admin pastes into the movement-knowledge chat (see
// storage.updateMovementKnowledgeFromChat) and extracts rough plain text
// from it. There's no HTML-parsing library in this project, so this is a
// lightweight regex strip rather than a real DOM parse -- good enough for
// feeding an article or coaching-cue page into the AI prompt, not meant to
// handle JS-rendered pages (fetch never executes scripts) or produce
// publication-quality extraction.
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000; // well past any real article page
const MAX_EXTRACTED_CHARS = 20_000; // keeps the eventual AI prompt bounded

export type FetchUrlTextResult = { text: string } | { error: string };

export async function fetchUrlText(url: string): Promise<FetchUrlTextResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "That doesn't look like a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http/https URLs are supported." };
  }
  // This is admin-only already, but there's no reason a pasted URL should
  // be able to reach internal infrastructure at all -- block the obvious
  // SSRF targets (loopback, link-local, and the private ranges).
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    return { error: "That URL points to a private/internal address, which isn't allowed." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      // Manual, not "follow" -- a redirect could otherwise land on an
      // internal address after the hostname check above already passed.
      // Asking the admin to paste the direct URL is a small enough ask.
      redirect: "manual",
      headers: { "User-Agent": "ForgeMovementKnowledgeBot/1.0" },
    });
    if (res.status >= 300 && res.status < 400) {
      return { error: "That URL redirects -- paste the direct link instead." };
    }
    if (!res.ok) {
      return { error: `Couldn't fetch that URL (HTTP ${res.status}).` };
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return {
        error: `That URL returned ${contentType || "an unsupported content type"}, not a readable page.`,
      };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_RESPONSE_BYTES) {
      return { error: "That page is too large to read." };
    }
    const html = Buffer.from(buf).toString("utf-8");
    const text = extractReadableText(html).slice(0, MAX_EXTRACTED_CHARS);
    if (!text.trim()) {
      return { error: "Couldn't find any readable text on that page." };
    }
    return { text };
  } catch (err: any) {
    if (err?.name === "AbortError") return { error: "That URL took too long to respond." };
    return { error: "Couldn't reach that URL." };
  } finally {
    clearTimeout(timeout);
  }
}

function extractReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
