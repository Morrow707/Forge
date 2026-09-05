// Runs the pose-tracking model over an already-recorded video file (as
// opposed to a live camera stream) -- the skeleton-overlay half of the
// video-analysis tool (see video-analysis-dialog.tsx). Every live tracker
// (bar-tracker-dialog, mechanics-tracker-dialog, sprint-tracker-dialog)
// feeds getPoseLandmarker() a live <video> element frame-by-frame via
// requestAnimationFrame; this instead seeks a detached, offscreen <video>
// element through the whole clip once up front so the review screen can
// scrub freely afterward without re-running detection on every frame. Uses
// its own dedicated instance (getOfflinePoseLandmarker), never the shared
// live one -- see that function's own comment for why: this pass has no
// cancellation tied to its calling dialog's lifecycle, so an abandoned
// analysis can keep running (and feeding whatever instance it holds) well
// after the dialog that started it has closed.
import { getOfflinePoseLandmarker, isPlausibleHumanFrame, type PoseFrame } from "./pose-tracking";
import { resolveApiUrl } from "./queryClient";
import { resolveVideoDuration } from "./video-recording";

// Detection is the expensive part, not seeking -- capping the sample count
// bounds worst-case analysis time for a longer clip (a full tracked set can
// run well past the ~10s form-check cap) at the cost of coarser scrubbing
// resolution, which review doesn't need much of anyway.
const MAX_SAMPLES = 180;
const MIN_INTERVAL_SEC = 1 / 15;

// The actual last timestamp fed to getOfflinePoseLandmarker()'s shared
// singleton, tracked across calls -- see analyzeVideoPose's own comment on
// why seeding purely from performance.now() isn't a real guarantee.
let lastOfflineTimestampMs = 0;

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
  const landmarker = await getOfflinePoseLandmarker();

  const video = document.createElement("video");
  // crossOrigin must be set before src -- landmarker.detectForVideo() feeds
  // this element into MediaPipe's WebGL pipeline as a texture, and WebKit
  // throws a SecurityError ("The operation is insecure") uploading a texture
  // from a cross-origin element that wasn't explicitly loaded with CORS. On
  // native this element's src IS cross-origin (capacitor://localhost's own
  // WebView loading a real https://forge-ebhd.onrender.com video, see
  // resolveApiUrl's own comment below) -- "anonymous" (no cookies) is enough
  // since /uploads is served unauthenticated, and the server's CORS
  // allowlist already covers capacitor://localhost (see server/index.ts).
  video.crossOrigin = "anonymous";
  // Callers pass the server-relative path as stored (formCheckVideoUrl,
  // etc.) -- on native that has to be resolved against the real backend
  // rather than the bundled capacitor://localhost origin the WebView
  // otherwise resolves it against, same as every fetch() call against this
  // app's own backend already does (see resolveApiUrl's own comment).
  video.src = resolveApiUrl(videoUrl);
  video.muted = true;
  video.playsInline = true;

  // Everything from here down runs inside a try/finally so the element is always released.
  //
  // video-frames.ts does this and says why: an abandoned media element keeps a live WebKit media
  // session, and on iOS that is what stops the athlete's music. This pass never had it, and it is
  // the heavier of the two -- it holds a remote https source and a WebGL texture path open for
  // the whole length of the clip, and a coach reviewing a session opens one after another.
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("Could not load this video for analysis.")), {
        once: true,
      });
    });

    return await analyseLoadedVideo(video, landmarker, onProgress);
  } finally {
    // Same teardown, same order, as video-frames.ts: pause first so the session stops, then
    // drop the source, then load() to make the element actually let go of it.
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

async function analyseLoadedVideo(
  video: HTMLVideoElement,
  landmarker: Awaited<ReturnType<typeof getOfflinePoseLandmarker>>,
  onProgress?: (fraction: number) => void,
): Promise<PoseFrame[]> {
  const duration = await resolveVideoDuration(video);
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const interval = Math.max(MIN_INTERVAL_SEC, duration / MAX_SAMPLES);
  // Floored against lastOfflineTimestampMs + 1, not just performance.now() --
  // this dedicated instance (see getOfflinePoseLandmarker's own comment --
  // deliberately not the shared live-tracker landmarker) is a lazy singleton
  // reused across every video a coach analyzes, not a fresh one per call, and
  // detectForVideo throws if a timestamp ever goes backwards or repeats.
  // performance.now() alone isn't a real guarantee of that: it only proves
  // this call started later in wall-clock time than the previous one did,
  // not that this call's *starting* timestamp is past whatever synthetic
  // offset (up to the PREVIOUS video's own duration * 1000) the previous
  // call last fed the instance -- seeking+inference on a short clip can
  // easily finish in less real time than the clip's own duration, so two
  // videos analyzed back-to-back could otherwise start the second call's
  // timestamps behind the first call's last one.
  const baseTimestampMs = Math.max(performance.now(), lastOfflineTimestampMs + 1);

  const frames: PoseFrame[] = [];
  for (let t = 0; t <= duration; t += interval) {
    video.currentTime = Math.min(t, duration);
    await waitForSeek(video);
    const timestampMs = Math.round(baseTimestampMs + t * 1000);
    const detection = landmarker.detectForVideo(video, timestampMs);
    lastOfflineTimestampMs = timestampMs;
    const landmarks = detection.landmarks[0];
    const worldLandmarks = detection.worldLandmarks[0];
    if (landmarks && worldLandmarks && isPlausibleHumanFrame(landmarks)) {
      frames.push({ t, landmarks, worldLandmarks });
    }
    onProgress?.(Math.min(1, t / duration));
  }
  onProgress?.(1);
  return frames;
}
