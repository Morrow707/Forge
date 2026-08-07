// Runs the shared pose-tracking model over an already-recorded video file
// (as opposed to a live camera stream) -- the skeleton-overlay half of the
// video-analysis tool (see video-analysis-dialog.tsx). Every other user of
// getPoseLandmarker() (bar-tracker-dialog, mechanics-tracker-dialog,
// sprint-tracker-dialog) feeds it a live <video> element frame-by-frame via
// requestAnimationFrame; this instead seeks a detached, offscreen <video>
// element through the whole clip once up front so the review screen can
// scrub freely afterward without re-running detection on every frame.
import { getPoseLandmarker, type PoseFrame } from "./pose-tracking";

// Detection is the expensive part, not seeking -- capping the sample count
// bounds worst-case analysis time for a longer clip (a full tracked set can
// run well past the ~10s form-check cap) at the cost of coarser scrubbing
// resolution, which review doesn't need much of anyway.
const MAX_SAMPLES = 180;
const MIN_INTERVAL_SEC = 1 / 15;

function waitForSeek(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    function onSeeked() {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    }
    video.addEventListener("seeked", onSeeked);
  });
}

// Resolves with every sampled frame that had a confident single-person
// detection (frames with nobody readable in them are simply skipped, same
// convention as the live trackers). `onProgress` gets a 0-1 fraction for a
// loading indicator during what can be a several-second pass.
export async function analyzeVideoPose(
  videoUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<PoseFrame[]> {
  const landmarker = await getPoseLandmarker();

  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Could not load this video for analysis.")), {
      once: true,
    });
  });

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const interval = Math.max(MIN_INTERVAL_SEC, duration / MAX_SAMPLES);
  // Seeded from performance.now() (not 0) so these timestamps always land
  // strictly after whatever the shared landmarker last saw from a live
  // tracker earlier in this same page session -- detectForVideo throws if
  // timestamps ever go backwards or repeat, and every live tracker feeds it
  // raw performance.now() values, not clip-relative ones.
  const baseTimestampMs = performance.now();

  const frames: PoseFrame[] = [];
  for (let t = 0; t <= duration; t += interval) {
    video.currentTime = Math.min(t, duration);
    await waitForSeek(video);
    const timestampMs = Math.round(baseTimestampMs + t * 1000);
    const detection = landmarker.detectForVideo(video, timestampMs);
    const landmarks = detection.landmarks[0];
    const worldLandmarks = detection.worldLandmarks[0];
    if (landmarks && worldLandmarks) frames.push({ t, landmarks, worldLandmarks });
    onProgress?.(Math.min(1, t / duration));
  }
  onProgress?.(1);
  return frames;
}
