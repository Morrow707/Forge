// Shared by every MediaRecorder-based capture flow (bar tracker, mechanics
// tracker, the standalone form-video recorder + its clip trimmer). A
// recorded Blob must be labeled with the container the browser actually
// produced -- not the container we hoped for -- since a mislabeled Blob
// still uploads "successfully" but is unplayable at review time: Safari/iOS
// has no WebM encoder, so requesting "video/webm" there gets silently
// downgraded to the browser's own default (commonly MP4/H.264), and a
// recorder created with no explicit mimeType option always negotiates its
// own choice regardless of platform. Read `recorder.mimeType` (a real,
// browser-populated property, accurate immediately after construction) as
// the source of truth for both the Blob's type and the upload filename's
// extension, rather than the pre-construction option the caller requested.
export function recordedVideoType(recorder: MediaRecorder, requested?: string): string {
  return recorder.mimeType || requested || "video/webm";
}

// Maps a Blob's (accurate, per above) MIME type to a filename extension the
// server's upload routes recognize (see VIDEO_EXTENSION_BY_MIME in
// server/routes.ts) -- strips any codec parameter suffix a browser may
// append (e.g. "video/mp4;codecs=avc1") before matching, since only the
// base type is meaningful for picking a container extension.
export function videoFilenameForBlob(blob: Blob, baseName: string): string {
  const baseType = (blob.type || "").split(";")[0].trim().toLowerCase();
  const ext = baseType === "video/mp4" ? "mp4" : baseType === "video/quicktime" ? "mov" : "webm";
  return `${baseName}.${ext}`;
}

// Duration-Infinity workaround for MediaRecorder-produced Blobs -- a
// well-documented Chromium/WebKit quirk: the recorder writes its container
// incrementally rather than finalizing a real duration field the way a
// normally-encoded file would, so <video>.duration reads back as Infinity
// (sometimes NaN) right after loadedmetadata, and stays that way until the
// browser actually scans the whole file to work the real value out for
// itself -- which it only does once something asks it to seek near the end.
// This is the actual root cause behind "0:00 / 0:00" durations on a
// just-recorded clip, and analyzeVideoPose's own duration<=0 guard (which
// exists for genuinely broken/empty files) was silently swallowing this
// same symptom and returning zero frames -- reading as "couldn't find a
// body" when the real problem was never body detection at all, detection
// never got the chance to run. Every caller here needs an accurate
// duration, so this runs the standard fix once right after loadedmetadata:
// seek far past the end to force that scan, read the corrected duration off
// the resulting durationchange, then seek back to where playback should
// actually start.
export function resolveVideoDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve(video.duration);
  }
  return new Promise((resolve) => {
    let settled = false;
    function finish(duration: number) {
      if (settled) return;
      settled = true;
      video.removeEventListener("durationchange", onDurationChange);
      video.currentTime = 0;
      resolve(duration);
    }
    function onDurationChange() {
      if (Number.isFinite(video.duration) && video.duration > 0) finish(video.duration);
    }
    video.addEventListener("durationchange", onDurationChange);
    // Safety net -- if the browser never fires a usable durationchange (an
    // edge case, not the common path here), fall back to whatever's already
    // on the element rather than hanging the caller forever.
    window.setTimeout(() => finish(video.duration), 2000);
    video.currentTime = 1e101;
  });
}
