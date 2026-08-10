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
