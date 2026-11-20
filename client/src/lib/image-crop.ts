/** CROP AN UPLOADED BRAND IMAGE BEFORE IT GOES UP (Scott, 2026-11-20: "it didn't have me crop it,
 *  it didn't show me a preview of what the actually uploaded image would look like").
 *
 *  The server stores a logo, wordmark or login background exactly as sent, so the crop happens
 *  here, in the browser, and what is uploaded is the cropped picture at a sensible size. The math
 *  is pure and separate from the canvas so it can be tested without a DOM. */

export type CropKind = "logo" | "wordmark" | "background";

const LOGO_SIZE = 512;
const WORDMARK_ASPECT = 4;
const WORDMARK_WIDTH = 1200;
const PHONE_WIDTH_PARTS = 9;
const PHONE_HEIGHT_PARTS = 16;
const BACKGROUND_WIDTH = 1080;
const MIDDLE = 0.5;
const HALF = 2;
const JPEG_QUALITY = 0.88;

/** The frame each image is cut to, and the size it is uploaded at. */
export const CROP_SHAPES: Record<CropKind, { aspect: number; outWidth: number; type: "image/png" | "image/jpeg"; label: string }> = {
  // Square: the logo sits in a square on the login screen, the header and the home-screen icon.
  logo: { aspect: 1, outWidth: LOGO_SIZE, type: "image/png", label: "Square" },
  // Wide: the header slot is about four times wider than it is tall.
  wordmark: { aspect: WORDMARK_ASPECT, outWidth: WORDMARK_WIDTH, type: "image/png", label: "Wide (4 to 1)" },
  // A phone screen held upright.
  background: { aspect: PHONE_WIDTH_PARTS / PHONE_HEIGHT_PARTS, outWidth: BACKGROUND_WIDTH, type: "image/jpeg", label: "Phone screen" },
};

/** Where the picture sits in the frame: how far it is zoomed and where its centre is, as a
 *  fraction of the image (0.5, 0.5 is the middle). */
export type CropView = { zoom: number; centerX: number; centerY: number; fitWhole: boolean };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const initialCropView = (): CropView => ({ zoom: 1, centerX: MIDDLE, centerY: MIDDLE, fitWhole: false });

/** The part of the source image that fills the frame at zoom 1: the largest box of the frame's
 *  shape that fits inside the image. */
function baseBox(imgW: number, imgH: number, aspect: number): { w: number; h: number } {
  return imgW / imgH > aspect ? { w: imgH * aspect, h: imgH } : { w: imgW, h: imgW / aspect };
}

/** The source rectangle a view crops out, kept inside the image. */
export function cropRect(imgW: number, imgH: number, aspect: number, view: CropView): { x: number; y: number; w: number; h: number } {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const base = baseBox(imgW, imgH, aspect);
  const w = base.w / zoom;
  const h = base.h / zoom;
  const x = Math.min(imgW - w, Math.max(0, view.centerX * imgW - w / HALF));
  const y = Math.min(imgH - h, Math.max(0, view.centerY * imgH - h / HALF));
  return { x, y, w, h };
}

/** The view after dragging the picture by (dx, dy) screen pixels inside a frame frameW wide. */
export function panView(imgW: number, imgH: number, aspect: number, view: CropView, dx: number, dy: number, frameW: number): CropView {
  const rect = cropRect(imgW, imgH, aspect, view);
  const sourcePerPixel = rect.w / frameW;
  const clamped = cropRect(imgW, imgH, aspect, {
    ...view,
    centerX: (rect.x + rect.w / HALF - dx * sourcePerPixel) / imgW,
    centerY: (rect.y + rect.h / HALF - dy * sourcePerPixel) / imgH,
  });
  return { ...view, centerX: (clamped.x + clamped.w / HALF) / imgW, centerY: (clamped.y + clamped.h / HALF) / imgH };
}

/** Where the whole image lands inside the output when "Fit whole image" is on: scaled to fit,
 *  centred, the rest left transparent (or dark, for a photo). */
export function fitRect(imgW: number, imgH: number, outW: number, outH: number): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(outW / imgW, outH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (outW - w) / HALF, y: (outH - h) / HALF, w, h };
}

/** Draws the cropped picture into a canvas of any size. The live preview and the uploaded file
 *  both come from here, so what the preview shows is exactly what is uploaded. */
export function drawCrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, kind: CropKind, view: CropView, outW: number, outH: number): void {
  const shape = CROP_SHAPES[kind];
  ctx.clearRect(0, 0, outW, outH);
  ctx.imageSmoothingQuality = "high";
  if (shape.type === "image/jpeg") {
    // A photo has no transparency: the space around a fitted photo is dark, like the login screen.
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, outW, outH);
  }
  if (view.fitWhole) {
    const r = fitRect(img.naturalWidth, img.naturalHeight, outW, outH);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    return;
  }
  const r = cropRect(img.naturalWidth, img.naturalHeight, shape.aspect, view);
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, outW, outH);
}

/** The cropped picture as a file ready to upload, at the size CROP_SHAPES names. */
export async function renderCrop(img: HTMLImageElement, kind: CropKind, view: CropView, fileName: string): Promise<File> {
  const shape = CROP_SHAPES[kind];
  const outW = shape.outWidth;
  const outH = Math.round(outW / shape.aspect);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't crop images.");
  drawCrop(ctx, img, kind, view, outW, outH);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, shape.type, JPEG_QUALITY));
  if (!blob) throw new Error("This browser can't crop images.");
  const ext = shape.type === "image/png" ? "png" : "jpg";
  // The file's extension, so it can be swapped for the cropped type: matches ".png" in "crest.png",
  // nothing in "crest". https://regex101.com/?regex=%5C.%5B%5E.%5D%2B%24&testString=crest.png%0Acrest
  const base = fileName.replace(/\.[^.]+$/, "") || kind;
  return new File([blob], `${base}-cropped.${ext}`, { type: shape.type });
}
