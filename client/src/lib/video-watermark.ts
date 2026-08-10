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
// canvas-drawable Image, not JSX, and duplicating a ~700-byte path string
// is simpler and more robust than parsing ForgeMark's SVG output at
// runtime. Keep this in sync with forge-mark.tsx if the mark changes.
const FORGE_MARK_SVG = `<svg viewBox="161 55 190 400" xmlns="http://www.w3.org/2000/svg"><g fill="#f97316"><g transform="translate(102.4,269) scale(0.6)"><rect x="196" y="110" width="120" height="26" rx="6"/><rect x="188" y="142" width="136" height="28" rx="6"/><rect x="180" y="176" width="152" height="30" rx="6"/><rect x="170" y="212" width="172" height="32" rx="7"/><rect x="158" y="250" width="196" height="34" rx="7"/></g><g transform="translate(83,83.2) scale(0.73)"><path d="M180,208 C180,200 184,194 192,194 L332,194 C340,194 346,200 346,208 L346,244 C346,252 340,258 332,258 L232,258 C204,258 178,244 140,238 C130,236 128,228 134,222 C160,214 172,210 180,208 Z"/><path d="M212,258 C212,258 220,300 236,320 C244,330 244,340 236,346 L226,352 C270,352 286,352 296,346 L286,340 C278,330 278,320 286,310 C298,296 300,270 300,258 Z"/></g><g transform="translate(3,30)"><path d="M256,40 C280,70 298,90 302,110 C305,135 296,158 286,175 C276,192 266,204 256,208 C246,204 218,196 208,175 C200,158 208,140 232,132 C224,110 222,88 238,66 C244,56 250,46 256,40 Z"/></g></g></svg>`;

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
