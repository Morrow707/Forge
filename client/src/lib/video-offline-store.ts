import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Network } from "@capacitor/network";
import { App } from "@capacitor/app";
import { apiRequest, uploadWithProgress, ApiError } from "@/lib/queryClient";
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
// Also the single home for two related concerns that used to have nowhere
// to live: (1) queuing a clip up front rather than even attempting a live
// upload, when the device is on cellular rather than Wi-Fi -- burning an
// athlete's data plan on a multi-MB gym video is exactly the kind of thing
// this exists to avoid; (2) reattaching a clip to the exact workout set it
// was recorded for once a *deferred* upload finally completes, possibly
// long after the dialog (and the workout day) that recorded it closed --
// see attachVideoToSet below and shared/schema.ts's attachVideoToSetSchema
// for why a (day, exercise, set) tuple, not a database row id, is the only
// address that survives that gap.
//
// Web has no equivalent worth the complexity here (no native filesystem,
// and IndexedDB-for-blobs is a much bigger lift for a platform where "the
// tab gets killed mid-upload" is a far rarer failure mode than "iOS
// backgrounds/kills the app") -- every function below is a deliberate
// no-op off native, so an unfinished upload on web just keeps today's
// in-memory-retry-only behavior, and isOnWifi() always reports true there.

const MANIFEST_KEY = "forge:pending-video-uploads";
const VIDEO_DIR = Directory.Data;
const VIDEO_DIR_PATH = "pending-video-uploads";
// Shown once, the first time a clip actually gets queued for lack of
// Wi-Fi -- see hasWarnedAboutQueueing/markWarnedAboutQueueing below.
const WARNED_KEY = "forge-video-queue-warned";
// Small, disk-free fallback list for a clip that uploaded but couldn't be
// reattached (the set was edited/removed in the meantime, or already had a
// video) -- keeps it visible in the Video Bank instead of vanishing the
// moment its manifest entry is cleared. Capped short since this should be
// a rare edge case, not a growing archive.
const UNATTACHED_KEY = "forge-video-queue-unattached";
const MAX_UNATTACHED = 20;

// The stable address of the set a clip belongs to -- omitted for a
// recording context that isn't a workout set (a corrective, or any future
// caller with nothing to reattach to), in which case the clip still
// queues and uploads normally, it just stays a standalone Video Bank entry.
export type VideoReattachTarget = {
  assignmentId: number;
  programDayId: number;
  date: string;
  programExerciseId: number;
  setNumber: number;
};

// What a recording dialog needs to pass in -- everything queuing/upload
// needs beyond the blob itself.
export type VideoRecordContext = {
  label: string; // e.g. "Bench Press · Set 3", shown in the Video Bank
  reattach?: VideoReattachTarget;
};

export type UnattachedUpload = { url: string; label: string; uploadedAt: string };

type PendingVideoUpload = {
  id: string;
  path: string; // Filesystem path, relative to VIDEO_DIR
  url: string; // upload endpoint
  fieldName: string; // FormData field name the endpoint expects
  filename: string; // filename to send as
  mimeType: string;
  queuedAt: string;
  label: string;
  reattach?: VideoReattachTarget;
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

/** Read-only view of what's still queued -- for the Video Bank page. */
export function listPendingVideos(): PendingVideoUpload[] {
  return readManifest();
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

// Wi-Fi gating only matters natively -- the problem this solves is an
// athlete's phone plan at the gym, not a laptop browser tab, and
// @capacitor/network's web fallback is a best-effort guess anyway (the
// underlying Network Information API isn't universally supported).
export async function isOnWifi(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const status = await Network.getStatus();
    return status.connectionType === "wifi";
  } catch {
    return true; // fail open -- never block an upload because the check itself broke
  }
}

export function hasWarnedAboutQueueing(): boolean {
  return localStorage.getItem(WARNED_KEY) === "1";
}

export function markWarnedAboutQueueing(): void {
  localStorage.setItem(WARNED_KEY, "1");
}

export function listUnattachedUploads(): UnattachedUpload[] {
  try {
    const raw = localStorage.getItem(UNATTACHED_KEY);
    return raw ? (JSON.parse(raw) as UnattachedUpload[]) : [];
  } catch {
    return [];
  }
}

function recordUnattachedUpload(entry: UnattachedUpload) {
  const next = [entry, ...listUnattachedUploads()].slice(0, MAX_UNATTACHED);
  localStorage.setItem(UNATTACHED_KEY, JSON.stringify(next));
}

export function dismissUnattachedUpload(url: string) {
  const next = listUnattachedUploads().filter((u) => u.url !== url);
  localStorage.setItem(UNATTACHED_KEY, JSON.stringify(next));
}

/** Writes the blob to disk and records it in the pending-upload manifest
 * BEFORE the first upload attempt, so even if the app is killed mid-upload,
 * flushPendingVideos() picks it back up on next launch/reconnect. Returns
 * null (and does nothing) on web -- see this module's own comment for why. */
export async function persistVideoForUpload(
  blob: Blob,
  url: string,
  fieldName: string,
  filename: string,
  context: VideoRecordContext,
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
    label: context.label,
    reattach: context.reattach,
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

// A workout day currently open in workout.tsx holds its own in-memory copy
// of every set, and every autosave from that page overwrites the *entire*
// day server-side with whatever that copy currently says (see
// storage.submitWorkoutLog). If a video gets attached to a set server-side
// while that same day happens to still be open, the next keystroke's
// autosave would silently blow the attachment away again -- its local
// state never heard about it. Dispatching this event lets workout.tsx
// patch its own in-memory set the instant an attach succeeds, closing that
// race within the same JS runtime rather than relying on a refetch that a
// mounted page won't pick up on its own.
export const VIDEO_REATTACHED_EVENT = "forge:video-reattached";
export type VideoReattachedDetail = VideoReattachTarget & { videoUrl: string };

function announceReattached(target: VideoReattachTarget, videoUrl: string) {
  window.dispatchEvent(
    new CustomEvent<VideoReattachedDetail>(VIDEO_REATTACHED_EVENT, { detail: { ...target, videoUrl } }),
  );
}

/** POSTs the reattach tuple + the just-uploaded URL to the server; returns
 * whether it actually landed on a set. False is an expected, non-error
 * outcome (the day/exercise/set changed underneath it), not a failure --
 * see the route's own comment in routes.ts. */
async function attachVideoToSet(target: VideoReattachTarget, videoUrl: string): Promise<boolean> {
  try {
    const res = await apiRequest("POST", "/api/athlete/log/attach-video", { ...target, videoUrl });
    const { attached } = await res.json();
    return !!attached;
  } catch {
    return false;
  }
}

/** Uploads immediately on Wi-Fi (or web); on a native device with no
 * Wi-Fi, persists the clip to disk and returns { status: "queued" }
 * instead of attempting the request at all. A genuine network-level
 * failure while actually on Wi-Fi (not a server rejection -- see the
 * ApiError check) also falls back to persisting rather than losing the
 * clip; only a real ApiError (bad file, expired session) still throws,
 * since retrying that changes nothing. This is what every recording
 * dialog should call instead of POSTing to the upload endpoint directly. */
export async function uploadOrQueueVideo(
  blob: Blob,
  filename: string,
  context: VideoRecordContext,
  onProgress?: (fraction: number) => void,
): Promise<{ status: "uploaded"; url: string } | { status: "queued" }> {
  if (!(await isOnWifi())) {
    await persistVideoForUpload(blob, "/api/athlete/form-video", "video", filename, context);
    return { status: "queued" };
  }
  try {
    const formData = new FormData();
    formData.append("video", blob, filename);
    const { url } = await uploadWithProgress("/api/athlete/form-video", formData, onProgress);
    return { status: "uploaded", url };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    await persistVideoForUpload(blob, "/api/athlete/form-video", "video", filename, context);
    return { status: "queued" };
  }
}

async function uploadPendingEntry(entry: PendingVideoUpload): Promise<void> {
  const file = await Filesystem.readFile({ path: entry.path, directory: VIDEO_DIR });
  const blob = await base64ToBlob(file.data as string, entry.mimeType);
  const formData = new FormData();
  formData.append(entry.fieldName, blob, entry.filename);
  const { url } = await uploadWithProgress(entry.url, formData);
  await clearPersistedVideo(entry.id);

  let attached = false;
  if (entry.reattach) {
    attached = await attachVideoToSet(entry.reattach, url);
    if (attached) announceReattached(entry.reattach, url);
  }
  if (!attached) {
    recordUnattachedUpload({ url, label: entry.label, uploadedAt: new Date().toISOString() });
  }
}

/** Manual per-item retry for the Video Bank's "Upload Now" button --
 * deliberately does not check isOnWifi() first, since tapping that button
 * is the explicit cellular-data escape hatch for an athlete who trains
 * somewhere with no Wi-Fi at all. Rethrows on failure so the button can
 * show its own error state; the entry stays queued either way. */
export async function uploadPendingVideoNow(id: string): Promise<void> {
  const entry = readManifest().find((e) => e.id === id);
  if (!entry) return;
  await uploadPendingEntry(entry);
}

/** Retries every video still queued from a previous session -- called on
 * Wi-Fi reconnect and app resume/startup (see startOfflineVideoSync). Only
 * attempts anything when actually on Wi-Fi (never spends cellular data on
 * its own -- see uploadPendingVideoNow for the deliberate manual override).
 * An ApiError means the server actually answered and rejected it (expired
 * session, bad format); no amount of retrying changes that, so the entry
 * is dropped and the athlete is told directly -- a video that silently
 * vanishes with no explanation is worse than one that fails loudly enough
 * to ask them to re-record it. Anything else (still offline, transient
 * failure) leaves the entry queued for the next flush. */
export async function flushPendingVideos() {
  if (!isVideoOfflinePersistenceSupported() || !(await isOnWifi())) return;
  for (const entry of readManifest()) {
    try {
      await uploadPendingEntry(entry);
      toast.success(
        entry.reattach
          ? `${entry.label} finished uploading.`
          : "A queued video just finished uploading -- check the Video Bank.",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        await clearPersistedVideo(entry.id);
        toast.error(
          `${entry.label}: couldn't be uploaded and was not saved -- you'll need to re-record it.`,
          { duration: 15000 },
        );
      }
      // Still offline, or the file read itself failed transiently -- leave
      // it queued and try again on the next flush.
    }
  }
}

/** Call once at native app startup, alongside startOfflineLogSync(). Covers
 * three distinct moments a queued clip can become uploadable: a generic
 * "online" transition, specifically reconnecting to Wi-Fi, and the app
 * coming back to the foreground -- the last one matters because a Wi-Fi
 * reconnect that happened while the app was backgrounded may not have had
 * a listener actually running to catch it. */
export function startOfflineVideoSync() {
  if (!isVideoOfflinePersistenceSupported()) return;
  flushPendingVideos();
  window.addEventListener("online", flushPendingVideos);
  Network.addListener("networkStatusChange", (status) => {
    if (status.connectionType === "wifi") flushPendingVideos();
  });
  App.addListener("resume", flushPendingVideos);
}
