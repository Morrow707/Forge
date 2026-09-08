import { askClaudeVision, fastModel } from "./ai";
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
    /** Inclusive 1-based page range. Ignored when pageNumbers is given. */
    fromPage?: number;
    toPage?: number;
    /**
     * Called with each completed batch of pages, so the caller can write
     * them and record how far it got.
     *
     * This is what makes a long run survivable. The first build returned
     * everything at the end, so a redeploy at page 390 of 400 lost the lot
     * and charged for it twice. Batched rather than per-page because
     * passages overlap across page boundaries and splitting one page at a
     * time would throw that overlap away at every page.
     */
    onBatch?: (batch: { pages: ExtractedPage[]; throughPage: number }) => Promise<void>;
    batchSize?: number;
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
      : (() => {
          // A range, so an admin can transcribe the four chapters they care
          // about rather than paying to read the index and the reference
          // list. On a real textbook that is often a quarter of the pages.
          const from = Math.max(1, options.fromPage ?? 1);
          const to = Math.min(doc.numPages, options.toPage ?? doc.numPages);
          const out: number[] = [];
          for (let n = from; n <= to; n++) out.push(n);
          return out;
        })();

  const pages: ExtractedPage[] = [];
  const batchSize = Math.max(1, options.batchSize ?? 10);
  let batch: ExtractedPage[] = [];
  let sinceFlush = 0;
  let failed = 0;
  let charactersRecovered = 0;

  const flush = async (throughPage: number) => {
    if (!options.onBatch) return;
    // Called even with no pages in hand: a run of unreadable pages still
    // has to move the checkpoint forward, or a resume would retry them
    // forever.
    await options.onBatch({ pages: batch, throughPage });
    batch = [];
  };

  let seen = 0;
  for (const pageNumber of wanted) {
    if (options.signal?.aborted) break;
    seen += 1;
    let page: any;
    try {
      page = await doc.getPage(pageNumber);
      const image = await extractPageImage(page, pageNumber);
      if (image) {
        const text = await askClaudeVision(
          SYSTEM,
          `Transcribe page ${pageNumber} of this document.`,
          [{ mediaType: image.mediaType, data: image.data }],
          {
            // Generous: a dense textbook page runs well past a thousand
            // tokens, and a transcription cut off mid-sentence is a passage
            // that ends in the middle of a claim.
            maxTokens: 4096,
            // The cheap model, deliberately. This is copying words off a
            // page, not reasoning about them -- the expensive model buys
            // nothing here and a 400-page book is 400 calls of it.
            model: fastModel,
            feature: "pdf-transcription",
          },
        );
        const cleaned = (text ?? "").trim();
        if (cleaned && cleaned !== NO_TEXT) {
          const page = { pageNumber, text: cleaned };
          pages.push(page);
          batch.push(page);
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
      // seen, not pages.length + failed: a page that legitimately held no
      // text counted as neither, so the progress line stalled while the run
      // was in fact advancing.
      pagesDone: seen,
      pageCount: wanted.length,
      charactersRecovered,
    });

    // Batched on PAGES SEEN, not pages that produced text. A run of blank or
    // unreadable pages produced nothing to append, so the old condition never
    // fired and the checkpoint never moved -- a crash after 40 unreadable
    // pages re-read and re-paid for all of them.
    sinceFlush += 1;
    if (sinceFlush >= batchSize) {
      await flush(pageNumber);
      sinceFlush = 0;
    }
  }

  // Only when there was something to finish. wanted[] is empty when a resume
  // starts past the last page, and flushing 0 there RESET the checkpoint to
  // zero -- so the next run re-read the entire book from page one and paid
  // for it again. That is the opposite of what checkpointing is for.
  if (wanted.length > 0) await flush(wanted[wanted.length - 1]);
  await doc.destroy();
  return { pages, attempted: wanted.length, failed };
}
