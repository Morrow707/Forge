/** Pulls a handful of still frames out of a recorded video for the AI form
 * check -- Claude's vision input is images, not video, so this is the
 * client-side bridge: load the clip into an offscreen <video>, seek to a
 * few evenly-spaced points, and grab each as a downscaled JPEG. Runs
 * entirely in the browser; nothing here touches the network beyond
 * re-fetching the already-uploaded clip at `url`. */
export async function extractVideoFrames(
  url: string,
  count = 3,
): Promise<{ mediaType: "image/jpeg"; data: string }[]> {
  const video = document.createElement("video");
  // Every attribute is set BEFORE src, deliberately. Assigning src queues WebKit's
  // resource-selection algorithm, and attributes it reads there (muted above all) have to
  // already be in place -- setting muted afterwards can leave the element classified as
  // audible for the load, which on iOS is the difference between joining the audio session
  // and taking it. Same ordering and reasoning as video-pose-analysis.ts.
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // Never hand this off to an external display; it is an offscreen frame-grab, and an AirPlay
  // route change is another way to disturb audio routing for no benefit here.
  video.disableRemotePlayback = true;
  video.src = url;

  try {
    // Inside the try, not before it. A failed load is the likeliest outcome of the two bugs
    // this function sat between (an unresolved server-relative url reaching it on iOS), and
    // that is exactly the path where an untorn-down element matters most: a media session
    // created and abandoned on an error is a more disruptive audio event than a clean one.
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not load video"));
    });
    return await grabFrames(video, count);
  } finally {
    // Explicit teardown. Without it this element is simply dropped on the floor and its
    // WebKit media session lives until garbage collection -- a non-deterministic moment, and
    // this function runs at exactly the instant a set finishes analysing and starts saving,
    // which is precisely when the athlete's music was reported to stop. Releasing the source
    // here makes the media session end at a point this code chooses.
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

async function grabFrames(
  video: HTMLVideoElement,
  count: number,
): Promise<{ mediaType: "image/jpeg"; data: string }[]> {
  const duration = video.duration;
  if (!duration || !Number.isFinite(duration)) {
    throw new Error("Video has no readable duration");
  }

  const maxWidth = 480;
  const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((video.videoWidth || maxWidth) * scale);
  canvas.height = Math.round((video.videoHeight || maxWidth) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const frames: { mediaType: "image/jpeg"; data: string }[] = [];
  // Evenly spaced through the middle of the clip, avoiding the very start
  // (often still getting into position) and very end (often racking the
  // weight) where possible.
  const fractions = Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));

  for (const fraction of fractions) {
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Could not seek video"));
      video.currentTime = duration * fraction;
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    frames.push({ mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
  }

  return frames;
}
