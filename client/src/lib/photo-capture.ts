// Downscaled-JPEG helpers for the two ways a photo can get into the
// browser -- a live camera frame or a file picked from the gallery. Same
// "load into a canvas, draw, export a smaller JPEG" approach as
// video-frames.ts uses for form-check clips, just for a still image instead
// of a handful of video seek points.
//
// Two resolution presets: identifying food on a plate tolerates a lot more
// downscaling than reading text off a photographed sheet does, so a
// document (a testing sheet, a roster, a printed program) gets a
// meaningfully wider ceiling -- Claude's OCR accuracy on small print drops
// fast below a few hundred pixels per line of text, in a way plate-of-food
// identification never runs into.
const MAX_WIDTH_PHOTO = 900;
const MAX_WIDTH_DOCUMENT = 1800;
const JPEG_QUALITY = 0.82;

export type CapturedPhoto = { mediaType: "image/jpeg"; data: string };

function canvasToPhoto(canvas: HTMLCanvasElement): CapturedPhoto {
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

function drawScaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
): HTMLCanvasElement {
  const scale = Math.min(1, maxWidth / (sourceWidth || maxWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((sourceWidth || maxWidth) * scale);
  canvas.height = Math.round((sourceHeight || maxWidth) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Grabs whatever's currently showing in a live <video> element (a camera
 * preview) as a downscaled JPEG still. */
export function capturePhotoFromVideo(video: HTMLVideoElement): CapturedPhoto {
  const canvas = drawScaled(video, video.videoWidth, video.videoHeight, MAX_WIDTH_PHOTO);
  return canvasToPhoto(canvas);
}

/** Loads a picked file (gallery upload) into an offscreen <img> and
 * re-exports it as a downscaled JPEG, same size/quality target as the
 * camera-capture path above so either route into the dialog behaves the
 * same from the server's perspective. Pass `document: true` for a
 * photographed sheet of text (testing results, a roster, a printed
 * program) instead of a photo of food -- see MAX_WIDTH_DOCUMENT above. */
export function downscalePhotoFile(file: File, options?: { document?: boolean }): Promise<CapturedPhoto> {
  const maxWidth = options?.document ? MAX_WIDTH_DOCUMENT : MAX_WIDTH_PHOTO;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = drawScaled(img, img.naturalWidth, img.naturalHeight, maxWidth);
        resolve(canvasToPhoto(canvas));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load that image"));
    };
    img.src = url;
  });
}
