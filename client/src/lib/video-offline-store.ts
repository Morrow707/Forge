import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { uploadWithProgress, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";

// Persists a recorded video to native disk the moment an athlete taps Save,
// before the upload even starts. Until now the blob only ever lived in
// React state: form-video-recorder-dialog.tsx's own retry loop covered a
// live connection blip, but the app backgrounding/getting killed by iOS
// mid-upload, or a whole-session outage, lost the recording outright with
// no way back. This is offline-queue.ts's same "never lose it, retry until
// it lands" shape, just for a binary blob too large for localStorage
// instead of a small JSON payload -- the file itself lives on native disk,
// a small JSON manifest (in localStorage, same as offline-queue.ts) tracks
// which files are still pending and where they're headed.
//
// Web has no equivalent worth the complexity here (no native filesystem,
// and IndexedDB-for-blobs is a much bigger lift for a platform where "the
// tab gets killed mid-upload" is a far rarer failure mode than "iOS
// backgrounds/kills the app") -- every function below is a deliberate
// no-op off native, so an unfinished upload on web just keeps today's
// in-memory-retry-only behavior.

const MANIFEST_KEY = "forge:pending-video-uploads";
const VIDEO_DIR = Directory.Data;
const VIDEO_DIR_PATH = "pending-video-uploads";

type PendingVideoUpload = {
  id: string;
  path: string; // Filesystem path, relative to VIDEO_DIR
  url: string; // upload endpoint
  fieldName: string; // FormData field name the endpoint expects
  filename: string; // filename to send as
  mimeType: string;
  queuedAt: string;
};

function readManifest(): PendingVideoUpload[] {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    return raw ? (JSON.parse(raw) as PendingVideoUpload[]) : [];
  } catch {
    return [];
  }
}

function writeManifest(entries: PendingVideoUpload[]) {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort, matches offline-queue.ts's own writeQueue.
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function base64ToBlob(base64: string, mimeType: string): Promise<Blob> {
  const res = await fetch(`data:${mimeType};base64,${base64}`);
  return res.blob();
}

export function isVideoOfflinePersistenceSupported() {
  return Capacitor.isNativePlatform();
}

/** Writes the blob to disk and records it in the pending-upload manifest
 * BEFORE the first upload attempt, so even if the app is killed mid-upload,
 * startOfflineVideoSync() picks it back up on next launch. Returns null
 * (and does nothing) on web -- see this module's own comment for why. */
export async function persistVideoForUpload(
  blob: Blob,
  url: string,
  fieldName: string,
  filename: string,
): Promise<string | null> {
  if (!isVideoOfflinePersistenceSupported()) return null;
  const id = crypto.randomUUID();
  const path = `${VIDEO_DIR_PATH}/${id}`;
  await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: VIDEO_DIR,
    recursive: true,
  });
  const entry: PendingVideoUpload = {
    id,
    path,
    url,
    fieldName,
    filename,
    mimeType: blob.type,
    queuedAt: new Date().toISOString(),
  };
  writeManifest([...readManifest(), entry]);
  return id;
}

/** Call once the upload for a persisted video actually succeeds, so it
 * stops being retried and the disk copy is freed. Safe to call with null/an
 * unknown id (e.g. persistVideoForUpload was never reached, or this is web) --
 * a no-op in that case. */
export async function clearPersistedVideo(id: string | null) {
  if (!id) return;
  const entry = readManifest().find((e) => e.id === id);
  writeManifest(readManifest().filter((e) => e.id !== id));
  if (!entry) return;
  try {
    await Filesystem.deleteFile({ path: entry.path, directory: VIDEO_DIR });
  } catch {
    // Already gone, or never actually finished writing -- either way,
    // nothing left to clean up.
  }
}

/** Retries every video still on disk from a previous session -- same shape
 * as offline-queue.ts's flushPendingLogs. An ApiError means the server
 * actually answered and rejected it (expired session, bad format); no
 * amount of retrying changes that, so the entry is dropped and the athlete
 * is told directly -- a video that silently vanishes with no explanation is
 * worse than one that fails loudly enough to ask them to re-record it.
 * Anything else (still offline, request never reached the server) leaves
 * the entry queued for the next flush. */
export async function flushPendingVideos() {
  if (!isVideoOfflinePersistenceSupported()) return;
  for (const entry of readManifest()) {
    try {
      const file = await Filesystem.readFile({ path: entry.path, directory: VIDEO_DIR });
      const blob = await base64ToBlob(file.data as string, entry.mimeType);
      const formData = new FormData();
      formData.append(entry.fieldName, blob, entry.filename);
      await uploadWithProgress(entry.url, formData);
      await clearPersistedVideo(entry.id);
      toast.success("A video saved while you were offline just finished uploading.");
    } catch (err) {
      if (err instanceof ApiError) {
        await clearPersistedVideo(entry.id);
        toast.error(
          "A video saved while offline couldn't be uploaded and was not saved -- you'll need to re-record it.",
          { duration: 15000 },
        );
      }
      // Still offline, or the file read itself failed transiently -- leave
      // it queued and try again on the next flush.
    }
  }
}

/** Call once at native app startup, alongside startOfflineLogSync(). */
export function startOfflineVideoSync() {
  if (!isVideoOfflinePersistenceSupported()) return;
  flushPendingVideos();
  window.addEventListener("online", flushPendingVideos);
}
