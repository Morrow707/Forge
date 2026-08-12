// Overlays a small Forge mark in the upper-left corner of a video before
// it's downloaded/shared -- so a form-check clip an athlete or coach
// posts to social media carries the app it came from, same marketing
// logic as any other app's exported-content watermark. Runs entirely
// client-side: plays the source video into a canvas frame by frame
// (drawing the watermark on top of each one) and re-encodes the
// composite via MediaRecorder -- the same play-into-a-canvas-and-record
// technique form-video-recorder-dialog.tsx's trimClip already uses for
// re-encoding a trimmed clip, just drawing an extra layer per frame.
import { recordedVideoType } from "./video-recording";

// Inlined rather than imported as a component -- this needs to become a
// canvas-drawable Image, not JSX, and duplicating this small a path string
// is simpler and more robust than parsing lucide-react's Flame icon output
// at runtime. Reproduces the brand mark exactly: a rounded #F65B23 (the
// app's --primary) square with lucide-react's own Flame glyph -- see its
// stroke path in node_modules/lucide-react/dist/esm/icons/flame.js -- in
// white (--primary-foreground), same as the badge everywhere else in the
// app (login/signup/app-shell headers). Keep this in sync if that badge
// ever changes.
const FORGE_MARK_SVG = `<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg"><rect width="56" height="56" rx="12" fill="#F65B23"/><g transform="translate(12,12) scale(1.3333)" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></g></svg>`;

let markImagePromise: Promise<HTMLImageElement> | null = null;
function loadMarkImage(): Promise<HTMLImageElement> {
  if (!markImagePromise) {
    markImagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load the watermark image"));
      img.src = `data:image/svg+xml;base64,${btoa(FORGE_MARK_SVG)}`;
    });
  }
  return markImagePromise;
}

// Re-encodes the video at sourceUrl with a Forge watermark burned into the
// upper-left corner of every frame, preserving the original audio track.
// onProgress (0-1) is optional, purely for a progress indicator during
// what can be a several-second re-encode for a longer clip. Rejects if
// the browser can't produce a MediaRecorder stream from a canvas (very
// old browsers only) or the source video fails to load.
export async function watermarkVideo(
  sourceUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const markImage = await loadMarkImage();

  return new Promise((resolve, reject) => {
    const src = document.createElement("video");
    src.src = sourceUrl;
    src.muted = false;
    src.playsInline = true;

    src.addEventListener(
      "loadedmetadata",
      () => {
        const canvas = document.createElement("canvas");
        canvas.width = src.videoWidth;
        canvas.height = src.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("This browser can't add a watermark -- try downloading without one."));
          return;
        }

        const captureCanvas = (canvas as any).captureStream ?? (canvas as any).mozCaptureStream;
        if (!captureCanvas) {
          reject(new Error("This browser can't add a watermark -- try downloading without one."));
          return;
        }
        const canvasStream: MediaStream = captureCanvas.call(canvas, 30);

        // Route the source video's own audio into the recorded output
        // alongside the drawn frames -- captureStream on the canvas only
        // ever carries what's drawn to it (visual only), and a form-check
        // clip sometimes has coaching commentary or rep callouts worth
        // keeping rather than silently dropping.
        const captureSrc = (src as any).captureStream ?? (src as any).mozCaptureStream;
        if (captureSrc) {
          const audioTracks: MediaStreamTrack[] = captureSrc.call(src).getAudioTracks();
          for (const track of audioTracks) canvasStream.addTrack(track);
        }

        const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : undefined;
        const recorder = new MediaRecorder(canvasStream, mimeType ? { mimeType } : undefined);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => resolve(new Blob(chunks, { type: recordedVideoType(recorder, mimeType) }));
        recorder.onerror = () => reject(new Error("Could not add the watermark -- try again."));

        // Sized relative to the frame -- readable on a phone-sized clip
        // without covering meaningful content in the corner.
        const markSize = Math.round(canvas.width * 0.09);
        const padding = Math.round(canvas.width * 0.03);

        let rafId = 0;
        function drawFrame() {
          ctx!.drawImage(src, 0, 0, canvas.width, canvas.height);
          ctx!.globalAlpha = 0.85;
          ctx!.drawImage(markImage, padding, padding, markSize, markSize);
          ctx!.globalAlpha = 1;
          ctx!.font = `700 ${Math.round(markSize * 0.55)}px system-ui, sans-serif`;
          ctx!.fillStyle = "rgba(255,255,255,0.92)";
          ctx!.textBaseline = "middle";
          ctx!.shadowColor = "rgba(0,0,0,0.65)";
          ctx!.shadowBlur = 4;
          ctx!.fillText("FORGE", padding + markSize + padding * 0.5, padding + markSize / 2);
          ctx!.shadowBlur = 0;
          onProgress?.(src.duration > 0 ? src.currentTime / src.duration : 0);
          if (!src.paused && !src.ended) rafId = requestAnimationFrame(drawFrame);
        }

        function finish() {
          cancelAnimationFrame(rafId);
          if (recorder.state === "recording") recorder.stop();
        }

        recorder.start();
        src
          .play()
          .then(() => {
            rafId = requestAnimationFrame(drawFrame);
          })
          .catch(() => reject(new Error("Could not play that video to add a watermark.")));
        src.addEventListener("ended", finish, { once: true });
      },
      { once: true },
    );
    src.addEventListener("error", () => reject(new Error("Could not load that video.")), { once: true });
  });
}
