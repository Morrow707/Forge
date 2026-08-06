// Downscaled-JPEG helpers for the two ways a meal photo can get into the
// browser -- a live camera frame or a file picked from the gallery. Same
// "load into a canvas, draw, export a smaller JPEG" approach as
// video-frames.ts uses for form-check clips, just for a still image instead
// of a handful of video seek points. Claude's vision input doesn't need a
// full-resolution phone photo to identify food on a plate, and a smaller
// payload means a faster round trip either way.
const MAX_WIDTH = 900;
const JPEG_QUALITY = 0.82;

export type CapturedPhoto = { mediaType: "image/jpeg"; data: string };

function canvasToPhoto(canvas: HTMLCanvasElement): CapturedPhoto {
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

function drawScaled(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_WIDTH / (sourceWidth || MAX_WIDTH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((sourceWidth || MAX_WIDTH) * scale);
  canvas.height = Math.round((sourceHeight || MAX_WIDTH) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Grabs whatever's currently showing in a live <video> element (a camera
 * preview) as a downscaled JPEG still. */
export function capturePhotoFromVideo(video: HTMLVideoElement): CapturedPhoto {
  const canvas = drawScaled(video, video.videoWidth, video.videoHeight);
  return canvasToPhoto(canvas);
}

/** Loads a picked file (gallery upload) into an offscreen <img> and
 * re-exports it as a downscaled JPEG, same size/quality target as the
 * camera-capture path above so either route into the dialog behaves the
 * same from the server's perspective. */
export function downscalePhotoFile(file: File): Promise<CapturedPhoto> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = drawScaled(img, img.naturalWidth, img.naturalHeight);
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
