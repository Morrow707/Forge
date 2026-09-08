import { deflateSync } from "node:zlib";

/**
 * Getting a picture of a scanned page out of a PDF, without a native
 * image library.
 *
 * WHY NOT RENDER THE PAGE
 *
 * The obvious approach is to rasterize each page the way a viewer does,
 * which needs a canvas implementation. Every option is a native module
 * (node-canvas, @napi-rs/canvas, sharp), which means a build toolchain on
 * the deploy host and a binary that has to match the runtime. That is a
 * large, permanent cost to pay for a path that only runs when an admin
 * uploads a scanned book.
 *
 * A scanned page does not need rendering. It IS an image -- one full-page
 * bitmap that a scanner or phone camera produced and a PDF writer wrapped.
 * pdfjs will hand that bitmap over directly, and for a JPEG-compressed one
 * it hands over the original JPEG bytes, which is exactly what needs to go
 * to the model anyway.
 *
 * So: pull the largest image object on the page. For raw bitmaps, wrap the
 * pixels in a PNG here -- PNG is a length-prefixed container around zlib
 * data, and zlib is in the standard library, so the encoder below is short
 * and has no dependency. For JPEG-encoded ones, pass the bytes straight
 * through.
 *
 * A page with no image object at all yields nothing, and the caller treats
 * that as a page it cannot transcribe rather than an error. A PDF full of
 * vector diagrams and no text is real, and it is not something this path
 * can rescue.
 */

export type PageImage = {
  pageNumber: number;
  mediaType: "image/jpeg" | "image/png";
  /** base64, ready for the vision call. */
  data: string;
};

// Claude accepts images up to 8000px on a side, and downsamples anything
// larger than roughly 1568px on its long edge before reading it. A 600dpi
// scan of a textbook page is around 5100px tall, so it is sent smaller:
// the transcription is no better at full size and the request is several
// times the size it needs to be.
const MAX_EDGE = 2000;

// Above this, an image is almost certainly the page scan rather than a logo
// or a rule. Guards against transcribing a letterhead.
const MIN_PIXELS = 200_000;

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Encodes 8-bit RGB pixels as a PNG.
 *
 * Only the filter-type-0 ("none") path, one byte per scanline: filters buy
 * compression on synthetic images with flat runs, and a page scan is noisy
 * enough that they buy very little. Not worth the code here.
 */
export function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Nearest-neighbour downscale by an integer factor.
 *
 * Nearest neighbour rather than an averaging filter, which would be better
 * for a photograph. Text is the opposite case: averaging thins strokes and
 * fills counters, and a model reading small print does better with hard
 * edges than with a smooth blur of them.
 */
function shrink(
  width: number,
  height: number,
  rgb: Buffer,
  factor: number,
): { width: number; height: number; rgb: Buffer } {
  if (factor <= 1) return { width, height, rgb };
  const w = Math.max(1, Math.floor(width / factor));
  const h = Math.max(1, Math.floor(height / factor));
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, y * factor);
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, x * factor);
      const si = (sy * width + sx) * 3;
      const di = (y * w + x) * 3;
      out[di] = rgb[si];
      out[di + 1] = rgb[si + 1];
      out[di + 2] = rgb[si + 2];
    }
  }
  return { width: w, height: h, rgb: out };
}

/** Whatever pdfjs gives back, normalized to 8-bit RGB. */
function toRgb(img: {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}): Buffer | null {
  const pixels = img.width * img.height;
  const channels = img.data.length / pixels;
  const out = Buffer.alloc(pixels * 3);
  if (channels === 3) return Buffer.from(img.data);
  if (channels === 4) {
    // RGBA. The alpha channel is dropped rather than composited: a scan is
    // opaque, and anything with real transparency is not the page.
    for (let i = 0; i < pixels; i++) {
      out[i * 3] = img.data[i * 4];
      out[i * 3 + 1] = img.data[i * 4 + 1];
      out[i * 3 + 2] = img.data[i * 4 + 2];
    }
    return out;
  }
  if (channels === 1) {
    // Greyscale, which most black-and-white scans are.
    for (let i = 0; i < pixels; i++) {
      out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = img.data[i];
    }
    return out;
  }
  return null;
}

/**
 * The page's main image, if it has one.
 *
 * `page` is a pdfjs PDFPageProxy. Typed loosely because pdfjs is imported
 * lazily from its legacy build and carries no usable types through that
 * path -- same reason extractPdf types it as any.
 */
export async function extractPageImage(page: any, pageNumber: number): Promise<PageImage | null> {
  let ops: any;
  try {
    ops = await page.getOperatorList();
  } catch {
    return null;
  }

  // Every image the page paints, largest first. A scan is one big one; a
  // text page with a figure on it may have several small ones.
  const names: string[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    // 85 is OPS.paintImageXObject. The numeric constant rather than the
    // import, because pulling OPS in would mean loading pdfjs at module
    // scope, which extractPdf deliberately avoids.
    if (ops.fnArray[i] === 85 && typeof ops.argsArray[i]?.[0] === "string") {
      names.push(ops.argsArray[i][0]);
    }
  }
  if (names.length === 0) return null;

  let best: { width: number; height: number; data: any; kind: string } | null = null;
  for (const name of names) {
    let obj: any;
    try {
      obj = page.objs.get(name);
    } catch {
      continue;
    }
    if (!obj?.width || !obj?.height) continue;
    if (obj.width * obj.height < MIN_PIXELS) continue;
    if (!best || obj.width * obj.height > best.width * best.height) {
      best = { width: obj.width, height: obj.height, data: obj.data, kind: obj.kind };
    }
  }
  if (!best) return null;

  // A JPEG-backed image arrives as its original bytes and goes on unchanged.
  // Re-encoding it would cost quality for nothing.
  if (best.data instanceof Uint8Array && best.kind === undefined) {
    return {
      pageNumber,
      mediaType: "image/jpeg",
      data: Buffer.from(best.data).toString("base64"),
    };
  }

  const rgb = toRgb(best as { width: number; height: number; data: Uint8Array });
  if (!rgb) return null;

  const factor = Math.ceil(Math.max(best.width, best.height) / MAX_EDGE);
  const scaled = shrink(best.width, best.height, rgb, factor);
  return {
    pageNumber,
    mediaType: "image/png",
    data: encodePng(scaled.width, scaled.height, scaled.rgb).toString("base64"),
  };
}

/**
 * One page of a stored PDF as image bytes, for the page picker.
 *
 * Reuses extractPageImage rather than adding a renderer, which means it
 * shows exactly what the transcription pass will be reading -- if the
 * preview is blank, the transcription would have found nothing on that page
 * either. A preview drawn a different way could look fine while the real
 * pass saw nothing, which is worse than no preview.
 *
 * Returns null for a page with no embedded image, which for a scanned book
 * means a page the pass cannot read.
 */
export async function renderPageForPreview(
  bytes: Buffer,
  pageNumber: number,
): Promise<{ mediaType: string; data: Buffer } | null> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  try {
    if (pageNumber < 1 || pageNumber > doc.numPages) return null;
    const page = await doc.getPage(pageNumber);
    try {
      const image = await extractPageImage(page, pageNumber);
      if (!image) return null;
      return { mediaType: image.mediaType, data: Buffer.from(image.data, "base64") };
    } finally {
      page.cleanup?.();
    }
  } finally {
    await doc.destroy();
  }
}
