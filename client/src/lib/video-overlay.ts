// Bakes the bar/ankle path trail and per-rep velocity/height badges into a
// just-recorded tracking clip, using the same play-into-a-canvas-and-record
// technique video-watermark.ts already uses for the Forge mark -- this is
// deliberately a SEPARATE pass from that one rather than an extension of
// it: watermarking runs later, at download/share time, against an
// already-saved server video with no frame/rep data available; this runs
// once, right after a tracked set stops, while framesRef/result are still
// in memory. A downloaded clip ends up with both layers baked in (trail +
// badges from here, the Forge mark from watermarking), with neither pass
// needing to know about the other.
import { POSE_LANDMARKS, type PoseFrame } from "./pose-tracking";
import { recordedVideoType } from "./video-recording";

const TRAIL_COLOR = "#f97316";
const MIN_VISIBILITY = 0.5;
const WRIST_INDICES = [POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.RIGHT_WRIST];
const ANKLE_INDICES = [POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.RIGHT_ANKLE];

export type OverlayRepMarker = {
  // Same clock as PoseFrame.t / TrackedPoint.t (ms since tracking started).
  // Only startMs is actually used for lookup (see drawFrame below) -- the
  // badge for a rep holds on screen until the NEXT rep's startMs is
  // reached, which needs no endMs and naturally covers the gap between reps
  // without the badge flickering off during a rest/reset moment.
  startMs: number;
  label: string;
};

function pixelPointForFrame(
  frame: PoseFrame,
  indices: number[],
  width: number,
  height: number,
): { x: number; y: number } | null {
  const points = indices
    .map((i) => frame.landmarks[i])
    .filter((lm): lm is NonNullable<typeof lm> => !!lm && lm.visibility >= MIN_VISIBILITY);
  if (points.length === 0) return null;
  const x = points.reduce((a, p) => a + p.x, 0) / points.length;
  const y = points.reduce((a, p) => a + p.y, 0) / points.length;
  return { x: x * width, y: y * height };
}

// sourceBlob is the raw, just-recorded clip (an in-memory Blob, not yet
// uploaded) -- frames is framesRef.current from that same tracking session
// (full, uncapped per-frame 2D landmarks, unlike the live trail's capped
// display buffer), and repMarkers comes from the caller's own already-
// computed rep breakdown (lift mode's RepBreakdown.startT/peakVelocityMps,
// jump mode's JumpRep.takeoffT/jumpHeightCm) -- this module has no opinion
// on how a label is worded, only where to show it.
export async function burnTrackingOverlay(
  sourceBlob: Blob,
  frames: PoseFrame[],
  mode: "bar_path" | "full" | "jump",
  repMarkers: OverlayRepMarker[],
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const trailIndices = mode === "jump" ? ANKLE_INDICES : WRIST_INDICES;
  const sourceUrl = URL.createObjectURL(sourceBlob);

  return new Promise((resolve, reject) => {
    const cleanupAndReject = (message: string) => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error(message));
    };

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
          cleanupAndReject("This browser can't add tracking overlays.");
          return;
        }

        const captureCanvas = (canvas as any).captureStream ?? (canvas as any).mozCaptureStream;
        if (!captureCanvas) {
          cleanupAndReject("This browser can't add tracking overlays.");
          return;
        }
        const canvasStream: MediaStream = captureCanvas.call(canvas, 30);

        // Carry the source clip's own audio track through untouched --
        // captureStream on the canvas only ever has what's drawn to it.
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
        recorder.onstop = () => {
          URL.revokeObjectURL(sourceUrl);
          resolve(new Blob(chunks, { type: recordedVideoType(recorder, mimeType) }));
        };
        recorder.onerror = () => cleanupAndReject("Could not add tracking overlays.");

        // Advances forward through `frames` as playback progresses instead
        // of re-filtering the whole array on every drawn tick -- both the
        // frame history and video playback move forward in time
        // monotonically, so a single running index is all a growing trail
        // needs.
        let frameCursor = 0;
        const trailPoints: { x: number; y: number }[] = [];
        const sortedMarkers = [...repMarkers].sort((a, b) => a.startMs - b.startMs);

        let rafId = 0;
        function drawFrame() {
          ctx!.drawImage(src, 0, 0, canvas.width, canvas.height);

          const currentMs = src.currentTime * 1000;
          while (frameCursor < frames.length && frames[frameCursor].t <= currentMs) {
            const p = pixelPointForFrame(frames[frameCursor], trailIndices, canvas.width, canvas.height);
            if (p) trailPoints.push(p);
            frameCursor++;
          }
          if (trailPoints.length >= 2) {
            ctx!.strokeStyle = TRAIL_COLOR;
            ctx!.lineWidth = Math.max(2, Math.round(canvas.width * 0.004));
            ctx!.beginPath();
            ctx!.moveTo(trailPoints[0].x, trailPoints[0].y);
            for (const p of trailPoints.slice(1)) ctx!.lineTo(p.x, p.y);
            ctx!.stroke();
          }

          // Last marker whose window has started by now -- see
          // OverlayRepMarker's own comment for why no endMs is needed.
          let activeLabel: string | null = null;
          for (const marker of sortedMarkers) {
            if (marker.startMs > currentMs) break;
            activeLabel = marker.label;
          }
          if (activeLabel) {
            const fontSize = Math.round(canvas.width * 0.045);
            const padding = Math.round(canvas.width * 0.03);
            ctx!.font = `700 ${fontSize}px system-ui, sans-serif`;
            ctx!.textBaseline = "top";
            const textWidth = ctx!.measureText(activeLabel).width;
            ctx!.fillStyle = "rgba(0,0,0,0.55)";
            ctx!.fillRect(padding - 8, padding - 6, textWidth + 16, fontSize + 12);
            ctx!.fillStyle = "#ffffff";
            ctx!.fillText(activeLabel, padding, padding);
          }

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
          .catch(() => cleanupAndReject("Could not play the recorded clip to add tracking overlays."));
        src.addEventListener("ended", finish, { once: true });
      },
      { once: true },
    );
    src.addEventListener("error", () => cleanupAndReject("Could not load the recorded clip."), { once: true });
  });
}
