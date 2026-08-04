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
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load video"));
  });

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
