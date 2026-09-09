import { createHash } from "node:crypto";

/**
 * Turning an uploaded PDF into passages the knowledge base can hold.
 *
 * Page numbers are carried through everything here, and that is the point
 * rather than a nicety: a passage that cannot say "CSCS volume 4, page 412"
 * is a claim with no source, and the whole reason for ingesting a book
 * rather than pasting summaries of it is that a coach can check what the AI
 * leaned on.
 *
 * Nothing in this file reaches the network. Extraction is local, which is
 * what makes an uploaded book stay in house.
 */

export type ExtractedPage = { pageNumber: number; text: string };

export type ExtractedDocument = {
  pageCount: number;
  pages: ExtractedPage[];
  /** sha256 of the file bytes, for refusing the same upload twice. */
  fileHash: string;
  /**
   * True when the file yielded almost no text, which in practice means
   * scanned or photographed pages: the words are images, and a text
   * extractor sees nothing. Reported rather than silently ingesting 400
   * blank pages.
   */
  looksScanned: boolean;
  /** Characters of real text recovered, for the estimate shown to the admin. */
  characterCount: number;
};

// Below this many characters per page averaged across the document, there is
// nothing worth ingesting. A text PDF runs to thousands of characters a
// page; a scanned one yields a handful of stray marks, or zero.
const SCANNED_CHARS_PER_PAGE = 100;

export function hashBytes(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function extractPdf(bytes: Buffer): Promise<ExtractedDocument> {
  // Imported lazily and from the legacy build: pdfjs ships an ESM-first
  // modern build that assumes browser globals, and loading it at module
  // scope would drag the whole library into every process that imports this
  // file, including the unit suite.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const fileHash = hashBytes(bytes);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    // No network fetches for fonts or anything else -- an ingest that
    // reached out would defeat the point of keeping the source in house.
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const pages: ExtractedPage[] = [];
  let characterCount = 0;
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    // pdfjs emits one item per positioned run, so a sentence arrives in
    // pieces. hasEOL marks a real line break; everything else is joined
    // directly, because inserting spaces between runs would break words
    // that were only split for kerning.
    const text = reflowExtractedText(
      content.items
        .map((item: any) => (item.str ?? "") + (item.hasEOL ? "\n" : ""))
        .join("")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    );
    characterCount += text.length;
    pages.push({ pageNumber, text });
    // Frees the page's operator list; a 400-page book held entirely in
    // memory is otherwise a real cost on a 512MB instance.
    page.cleanup();
  }
  await doc.destroy();

  return {
    pageCount: doc.numPages,
    pages,
    fileHash,
    looksScanned: doc.numPages > 0 && characterCount / doc.numPages < SCANNED_CHARS_PER_PAGE,
    characterCount,
  };
}

export type Passage = {
  /** Where this passage starts, for the citation. */
  pageNumber: number;
  /** The last page it touches, when a passage spans a page break. */
  endPageNumber: number;
  text: string;
};

// Roughly 1200 characters, which is a few paragraphs: long enough to carry a
// complete idea, short enough that a retrieved passage is mostly relevant
// rather than mostly padding. The overlap exists because the boundary is
// arbitrary and an idea that straddles it would otherwise be split in half
// and matched by neither piece.
const TARGET_CHARS = 1200;
const OVERLAP_CHARS = 200;

/**
 * Splits extracted pages into overlapping passages, carrying page numbers.
 *
 * Deliberately splits on paragraph and sentence boundaries rather than at a
 * fixed offset. A passage cut mid-sentence reads as nonsense when it is
 * quoted back to an admin in a contradiction prompt, and the point of
 * verbatim retrieval is that the quoted text is readable.
 */
/**
 * Turns a page's typeset lines back into prose.
 *
 * A PDF stores where each line of type sits on the page, not sentences, so a book set in a
 * narrow column arrives with a line break every fifty characters and every word the typesetter
 * hyphenated is left broken across two of them. Kept as-is, "stimulation" is stored as
 * "stim-\nulation" and "potential" as "poten-\ntial". An admin reading the ingest sees what
 * looks like a page full of misspellings and reasonably concludes the book was never read
 * properly.
 *
 * It is worse than cosmetic. Those passages are what the assistants quote and what the search
 * index is built from, so a coach searching "potential" cannot match a page that contains the
 * word, and a passage handed to a model as evidence reads as broken text.
 *
 * Two joins, both conservative:
 *
 * A hyphen at the end of a line, with lowercase on both sides, is typesetting rather than
 * meaning -- "stim-" then "ulation" -- so the hyphen goes and the halves close up. A capital
 * after the break leaves it alone, since "cross-\nEducation" is a real compound that happened
 * to wrap, and so does a digit, which is far more likely a range or a formula than a broken word.
 *
 * A single newline between two lines of the same paragraph becomes a space. A blank line is a
 * real paragraph break and survives, as does a line ending in sentence punctuation, which keeps
 * headings, list items and table rows on their own lines instead of running them together.
 */
export function reflowExtractedText(text: string): string {
  return text
    .replace(/([a-z])-\n([a-z])/g, "$1$2")
    .replace(/([^\n.!?:;])\n(?!\n)([^\n])/g, "$1 $2");
}

export function splitIntoPassages(pages: ExtractedPage[]): Passage[] {
  const passages: Passage[] = [];

  // Pages are concatenated first, with a marker of where each begins, so a
  // paragraph running across a page break stays one passage instead of being
  // torn at the boundary.
  let combined = "";
  const pageStarts: { offset: number; pageNumber: number }[] = [];
  for (const page of pages) {
    if (!page.text) continue;
    pageStarts.push({ offset: combined.length, pageNumber: page.pageNumber });
    combined += (combined ? "\n\n" : "") + page.text;
  }
  if (!combined) return [];

  const pageAt = (offset: number): number => {
    let current = pageStarts[0]?.pageNumber ?? 1;
    for (const start of pageStarts) {
      if (start.offset <= offset) current = start.pageNumber;
      else break;
    }
    return current;
  };

  let cursor = 0;
  while (cursor < combined.length) {
    let end = Math.min(cursor + TARGET_CHARS, combined.length);
    if (end < combined.length) {
      // Prefer a paragraph break, then a sentence end, then a space, in a
      // window near the target rather than anywhere in the passage -- a
      // "clean" break 400 characters early produces uselessly short chunks.
      const window = combined.slice(cursor, end);
      const searchFrom = Math.floor(TARGET_CHARS * 0.6);
      const paragraph = window.lastIndexOf("\n\n");
      const sentence = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf(".\n"),
        window.lastIndexOf("? "),
        window.lastIndexOf("! "),
      );
      const space = window.lastIndexOf(" ");
      const chosen =
        paragraph >= searchFrom
          ? paragraph + 2
          : sentence >= searchFrom
            ? sentence + 1
            : space >= searchFrom
              ? space
              : window.length;
      end = cursor + chosen;
    }

    const text = combined.slice(cursor, end).trim();
    if (text) {
      passages.push({
        pageNumber: pageAt(cursor),
        endPageNumber: pageAt(Math.max(cursor, end - 1)),
        text,
      });
    }

    if (end >= combined.length) break;

    // The overlap has to start on a word too.
    //
    // Where a passage ENDS was chosen carefully above -- a paragraph break, a sentence end, a
    // space. Where the next one BEGINS was not: it stepped back a flat 200 characters and started
    // there, wherever that landed. In a real book that is almost always the middle of a word, so
    // the overlapping copy of a passage opened with "ich a repetition is executed", "stance
    // Training--methods", "itness Center in Champaign" and "es at the end of its axon".
    //
    // Which is not just ugly. That fragment is what an assistant quotes back as evidence and what
    // the search index holds, so half the stored text began with a word that does not exist.
    //
    // The step back is now the FLOOR, not the answer: from there, forward to the first clean
    // start -- a paragraph, then a sentence, then a word. Forward rather than back so the overlap
    // can only ever shrink, never grow past what was intended, and the loop cannot stall.
    const floor = Math.max(end - OVERLAP_CHARS, cursor + 1);
    const tail = combined.slice(floor, end);
    const paragraphStart = tail.indexOf("\n\n");
    const sentenceStart = Math.min(
      ...[tail.indexOf(". "), tail.indexOf(".\n"), tail.indexOf("? "), tail.indexOf("! ")]
        .filter((i) => i >= 0)
        .concat([Infinity]),
    );
    const wordStart = tail.indexOf(" ");
    const snapped =
      paragraphStart >= 0
        ? floor + paragraphStart + 2
        : Number.isFinite(sentenceStart)
          ? floor + sentenceStart + 2
          : wordStart >= 0
            ? floor + wordStart + 1
            : floor;
    cursor = Math.min(Math.max(snapped, cursor + 1), end);
  }

  return passages;
}
