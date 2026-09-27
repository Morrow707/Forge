/** Pulls still frames out of a stored form-check clip, in the browser, for detector training.
 *
 * WHY FRAMES FROM REAL SETS RATHER THAN MORE PHOTOS OF A GYM.
 *
 * training-data/med-ball/ holds 266 photographs of an empty gym -- barbells on racks, plates
 * stacked on plate trees, nobody lifting. The detector's job is the opposite scene: a plate on a
 * LOADED bar, held by an athlete, mid-rep, at bench distance, from wherever the phone was put.
 * Training on plate trees teaches a model to find plate trees, which is exactly the false
 * positive already costing takes -- one bench set boxed something 3.4x the athlete's hand span
 * and called it a plate, and it was a rack upright.
 *
 * Every set an athlete films is already the right scene, already captured, at the right angle
 * and distance. This turns that into training data without anybody photographing anything.
 *
 * CLIENT-SIDE, AND NOTHING IS STORED. There is no ffmpeg on the server, so extraction happens
 * where the video can already be decoded -- the same play-into-a-canvas technique video-watermark.ts
 * uses. The frames go straight into a download and are never written anywhere: no new copy of
 * anybody's footage comes to rest in a new place, which is the right default for athlete video
 * whatever the purpose.
 *
 * EVENLY SPACED ACROSS THE CLIP, not the first N. A set is mostly the same picture; frames from
 * one second of it are near-duplicates and a model learns nothing from seeing the same image
 * forty times. Spreading them catches the bar at the chest, at lockout, and everywhere between.
 */

export type ExtractedFrame = { name: string; blob: Blob; atSeconds: number };

export async function extractFramesFromVideo(
  sourceUrl: string,
  count: number,
  namePrefix: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractedFrame[]> {
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.muted = true;
  video.playsInline = true;
  // Seeking frame by frame needs the whole file, and a stored clip is same-origin anyway.
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Could not load that clip.")), {
      once: true,
    });
  });

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("That clip reports no duration, so there is nothing to sample.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw video frames to a canvas.");

  const frames: ExtractedFrame[] = [];
  for (let i = 0; i < count; i++) {
    // Inset from both ends: the first and last frames of a recording are the athlete reaching
    // for the phone, which is a picture of a hand and not of a lift.
    const t = duration * ((i + 0.5) / count);
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener("seeked", onSeeked);
        reject(new Error("Could not seek that clip."));
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.currentTime = t;
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      // 0.92 rather than 1: a training image gains nothing from lossless JPEG and the download
      // is the thing somebody has to move around.
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (blob) {
      frames.push({
        // The timestamp travels in the filename so a frame can be found again in the clip it
        // came from -- which is what you need when a label turns out to be wrong.
        name: `${namePrefix}_t${Math.round(t * 1000)}.jpg`,
        blob,
        atSeconds: Math.round(t * 1000) / 1000,
      });
    }
    onProgress?.(i + 1, count);
  }

  video.removeAttribute("src");
  video.load();
  return frames;
}
