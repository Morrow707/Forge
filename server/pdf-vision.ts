import { askClaudeVision } from "./ai";
import { extractPageImage } from "./pdf-page-images";
import type { ExtractedPage } from "./pdf-extract";

/**
 * Reading a scanned book, one page at a time.
 *
 * Until now a PDF whose pages are images was refused: text extraction found
 * nothing, and the admin was told to run it through OCR themselves. This is
 * that path, done in house -- the Anthropic call is the one outbound request
 * the platform makes, and no page or its text goes anywhere else.
 *
 * ONE PAGE PER CALL, ON PURPOSE
 *
 * Several pages in one request would be cheaper. It would also make the page
 * numbers guesswork: the model would have to keep track of which image it
 * was on and say so, and when it miscounts, every passage from that point
 * carries a citation that points at the wrong page. A citation nobody can
 * follow is worse than no citation, because a coach checking it finds
 * something plausible on the wrong page rather than nothing at all. One page
 * per call means the page number comes from the loop, not from the model.
 *
 * WHAT THE MODEL IS ASKED TO DO, AND NOT DO
 *
 * Transcribe, not summarize, and not correct. A scanned table with a number
 * that looks wrong is transcribed as it appears -- this is the recorded text
 * of a published source, and quietly fixing it would put a claim in the
 * knowledge base that the book does not make. Every passage produced here is
 * flagged fromVision, and the prompt renderer marks those for the reader
 * with "verify numbers", because a transcribed digit is exactly the kind of
 * thing that is wrong in a way nothing downstream can detect.
 */

const SYSTEM = [
  "You transcribe a single scanned page of a book or manual into plain text.",
  "",
  "Rules:",
  "- Transcribe what is on the page. Do not summarize, rephrase, translate, or explain.",
  "- Do not correct anything. If a number, unit or word looks wrong, transcribe it as printed.",
  "- Keep the reading order: headings, then body, then anything in the margin.",
  "- Render a table row by row, cells separated by ' | '. Keep the header row.",
  "- Describe a figure or photograph in one short line in square brackets, e.g.",
  "  [Figure 8.3: force-velocity curve]. Transcribe its caption normally.",
  "- Include the running header and page number if they are printed on the page.",
  "- If the page is blank, or is a photograph with no text at all, reply with",
  "  exactly NO_TEXT and nothing else.",
  "",
  "Return only the transcribed text. No preamble, no commentary about the image quality.",
].join("\n");

const NO_TEXT = "NO_TEXT";

export type TranscribeProgress = {
  pagesDone: number;
  pageCount: number;
  charactersRecovered: number;
};

/**
 * Transcribes the pages of a scanned PDF.
 *
 * `pageNumbers` restricts the pass to specific pages; omitted, it does the
 * whole document. Returns pages in document order, skipping the ones that
 * produced nothing -- a blank page between chapters should not become an
 * empty passage that matches every query weakly.
 *
 * A page that fails is skipped rather than aborting the run. A 400-page book
 * with three unreadable pages is still worth having, and the alternative is
 * an admin who waits half an hour and gets nothing.
 */
export async function transcribeScannedPdf(
  bytes: Buffer,
  options: {
    pageNumbers?: number[];
    onProgress?: (progress: TranscribeProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<{ pages: ExtractedPage[]; attempted: number; failed: number }> {
  // Same lazy legacy-build import as extractPdf, for the same reason: pdfjs
  // must not be loaded by every process that imports this file.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const wanted =
    options.pageNumbers && options.pageNumbers.length > 0
      ? options.pageNumbers.filter((n) => n >= 1 && n <= doc.numPages).sort((a, b) => a - b)
      : Array.from({ length: doc.numPages }, (_, i) => i + 1);

  const pages: ExtractedPage[] = [];
  let failed = 0;
  let charactersRecovered = 0;

  for (const pageNumber of wanted) {
    if (options.signal?.aborted) break;
    let page: any;
    try {
      page = await doc.getPage(pageNumber);
      const image = await extractPageImage(page, pageNumber);
      if (image) {
        const text = await askClaudeVision(
          SYSTEM,
          `Transcribe page ${pageNumber} of this document.`,
          [{ mediaType: image.mediaType, data: image.data }],
          // Generous: a dense textbook page runs well past a thousand
          // tokens, and a transcription cut off mid-sentence is a passage
          // that ends in the middle of a claim.
          { maxTokens: 4096 },
        );
        const cleaned = (text ?? "").trim();
        if (cleaned && cleaned !== NO_TEXT) {
          pages.push({ pageNumber, text: cleaned });
          charactersRecovered += cleaned.length;
        }
      } else {
        // No image object on the page and no text either. Nothing to work
        // with -- counted as a failure so the admin sees the number.
        failed += 1;
      }
    } catch {
      failed += 1;
    } finally {
      page?.cleanup?.();
    }
    options.onProgress?.({
      pagesDone: pages.length + failed,
      pageCount: wanted.length,
      charactersRecovered,
    });
  }

  await doc.destroy();
  return { pages, attempted: wanted.length, failed };
}
