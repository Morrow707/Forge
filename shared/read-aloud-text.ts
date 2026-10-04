/** What a lesson page sounds like when read aloud (2026-10-04). The reader's markup is for
 * the eye: **bold**, "- " bullets, "> " pull-quotes and the "Key points:" heading. A voice
 * reads the words and not the marks, so both halves of read-aloud, the server's narration
 * and the browser's own voice, run the text through this first and agree on what was said. */
export function speakableText(body: string): string {
  return body
    .replace(/\*\*(.+?)\*\*/g, "$1")
    // Line starts match [ \t]* and never \s*, which would eat the blank line before a paragraph.
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*-[ \t]+/gm, "")
    .replace(/^[ \t]*Key points:[ \t]*$/gim, "Key points.")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A provider reads a bounded request; a page is split at paragraph breaks into pieces no
 * longer than `max` characters, a long paragraph at sentence ends. */
export function splitForNarration(text: string, max = 3800): string[] {
  const out: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };
  for (const para of text.split(/\n\n+/)) {
    const pieces = para.length <= max ? [para] : para.split(/(?<=[.!?])\s+/);
    for (const piece of pieces) {
      if (!piece) continue;
      if ((current + "\n\n" + piece).length > max) push();
      if (piece.length > max) {
        for (let i = 0; i < piece.length; i += max) out.push(piece.slice(i, i + max));
        continue;
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  push();
  return out;
}
