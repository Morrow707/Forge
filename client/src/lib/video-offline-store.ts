import { isPermanentUploadRejection } from "@/lib/upload-rejection";
import { belongsToCurrentUser, getQueueOwner } from "@/lib/queue-owner";
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
  // The set's row id, when the day had been saved by the time the clip was filmed. The server
  // tries it first and falls back to the tuple when a resave has replaced the row -- see
  // attachVideoToSetSchema. Kept current by refreshQueuedVideoRowIds on every save.
  workoutSetEntryId?: number;
};

/** Why a clip is being attached out of band -- recorded on the set row so a coach or an
 * audit can tell a Wi-Fi-queued clip from one that met a 5xx from one linked by hand. */
export type VideoAttachReason =
  | "offline_flush"
  | "server_error_retry"
  | "manual"
  // A live upload that outlived the dialog that started it -- see
  // attachUploadedVideoInBackground. Distinct from offline_flush because nothing was ever
  // queued: the clip went straight up, the athlete just did not wait for it.
  | "background_upload";

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
  // What put the clip in the queue: no Wi-Fi, or a live upload the server refused with
  // something retryable. Becomes the attach reason when the flush finally lands it. Absent
  // on entries queued before this existed, which attach with no reason recorded.
  queuedBecause?: "offline" | "server_error";
  // Which account recorded this. See queue-owner.ts. Without it, a clip
  // queued by one athlete uploaded under the next athlete's session on a
  // shared device: the upload succeeded, the file was recorded as theirs,
  // only the attach failed (that one is scoped), and the first athlete's
  // video surfaced in the second athlete's Video Bank.
  ownerId?: number | null;
};

function readManifest(): PendingVideoUpload[] {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    return raw ? (JSON.parse(raw) as PendingVideoUpload[]) : [];
  } catch {
    return [];
  }
}

// Reports whether the write actually landed. It used to swallow the failure
// silently, which is fine for a queue that only loses a retry -- but this
// manifest is the ONLY record that a video file exists on disk. A failed
// write (quota is the realistic cause, and this manifest grows) left the
// recording written to the filesystem and referenced by nothing: never
// uploaded, never listed in the Video Bank, never deleted. See
// persistVideoForUpload, which now cleans up rather than leaking it.
function writeManifest(entries: PendingVideoUpload[]): boolean {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** Read-only view of what's still queued -- for the Video Bank page. */
export function listPendingVideos(): PendingVideoUpload[] {
  // The Video Bank shows what is still waiting to upload. Another athlete's
  // queued clip is not this athlete's business, and offering them an
  // "Upload now" button for it is how it ended up in their account.
  return readManifest().filter((e) => belongsToCurrentUser(e.ownerId));
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
//
// Treats "unknown" the same as "wifi", not the same as "cellular" --
// @capacitor/network's ConnectionType is 'wifi' | 'cellular' | 'none' |
// 'unknown', and "unknown" is iOS's own honest "couldn't classify this"
// signal (NWPathMonitor genuinely returns it, especially with a weak/
// marginal Wi-Fi signal keeping cellular active alongside it -- a real gym
// scenario, not a rare edge case), not proof the connection is actually
// cellular. Treating it as "not wifi" was queuing a clip on a device that
// was demonstrably on Wi-Fi (full Wi-Fi bars in the status bar) the moment
// this got checked. Same "fail open, never block an upload over a check
// this app can't fully trust" reasoning as the catch below already uses.
export async function isOnWifi(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const status = await Network.getStatus();
    return status.connectionType !== "cellular" && status.connectionType !== "none";
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

// Both writes are guarded, for a reason that is not tidiness: this runs inside
// uploadPendingEntry, AFTER the upload landed and AFTER clearPersistedVideo has already taken
// the clip off disk and out of the manifest. A throw here (localStorage full -- which is the
// realistic case, since the log queue shares this store) escaped into runVideoFlush's catch,
// where it looks like a failed upload and is "left queued" -- except there is no queue entry
// left to leave. The clip was uploaded, unlinked from every set, recorded nowhere, and the
// athlete was told nothing. A lost bookkeeping row costs one Video Bank listing; a throw here
// costs the whole clip.
function recordUnattachedUpload(entry: UnattachedUpload) {
  const next = [entry, ...listUnattachedUploads()].slice(0, MAX_UNATTACHED);
  try {
    localStorage.setItem(UNATTACHED_KEY, JSON.stringify(next));
  } catch {
    // Nothing to do -- see above. The upload itself already succeeded.
  }
}

export function dismissUnattachedUpload(url: string) {
  const next = listUnattachedUploads().filter((u) => u.url !== url);
  try {
    localStorage.setItem(UNATTACHED_KEY, JSON.stringify(next));
  } catch {
    // The entry stays listed; the athlete can dismiss it again later.
  }
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
  queuedBecause: "offline" | "server_error" = "offline",
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
    queuedBecause,
    ownerId: getQueueOwner(),
  };
  if (!writeManifest([...readManifest(), entry])) {
    // The bytes are already on disk and nothing now points at them, so take
    // them back off rather than leaving an unreachable file behind, and tell
    // the caller the video was not queued instead of letting it promise the
    // athlete an upload that can never happen.
    try {
      await Filesystem.deleteFile({ path, directory: VIDEO_DIR });
    } catch {
      // Nothing more to try; the throw below is still the honest answer.
    }
    throw new Error("Couldn't save this video on your device -- storage may be full.");
  }
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

/** POSTs the reattach address (row id when known, tuple always) + the just-uploaded URL to
 * the server. "declined" is an expected, non-error outcome (the day/exercise/set changed
 * underneath it) and the SERVER has recorded the clip as unattached; "unreached" means the
 * request itself never got an answer, so nothing server-side knows the link failed and the
 * local list below is the only record. */
async function attachVideoToSet(
  target: VideoReattachTarget,
  videoUrl: string,
  reason: VideoAttachReason | undefined,
  label: string,
): Promise<"attached" | "declined" | "unreached"> {
  try {
    const res = await apiRequest("POST", "/api/athlete/log/attach-video", { ...target, videoUrl, reason, label });
    const { attached } = await res.json();
    return attached ? "attached" : "declined";
  } catch {
    return "unreached";
  }
}

/** Called by the workout page after every synced save with the row ids the server just
 * produced, so a clip still waiting in the queue names the CURRENT row of its set rather than
 * one a resave has since replaced. Keyed by the tuple the clip already carries. Best-effort:
 * a manifest that cannot be written keeps its old ids, and the tuple fallback still lands it. */
/**
 * ATTACH A CLIP THAT FINISHED UPLOADING AFTER THE DIALOG CLOSED.
 *
 * The tracker dialogs used to AWAIT the upload before handing the set up and closing, so the
 * athlete stood watching a progress bar for a video that has nothing to do with their numbers --
 * measured at about 22 seconds on a 1080p/120fps take, 2026-09-22: "22 seconds is far too long."
 * The metrics are finished the moment the on-device analysis ends; the upload is a separate
 * concern and belongs in the background.
 *
 * This is the same path a queued clip takes when Wi-Fi comes back (flushPendingVideos below),
 * for the same reason: the set row may have been resaved since, so the server is asked to attach
 * by row id with a tuple fallback, and the event tells an OPEN workout page to patch its own
 * in-memory copy -- otherwise the next autosave overwrites the whole day and takes the fresh
 * attachment with it. That race is why this cannot simply POST and hope.
 *
 * ONE RETRY, because this races the set's own first save. onCapture and this upload start at the
 * same moment; if the row has not landed yet the server declines, and declining is permanent
 * from the caller's point of view. A single retry a few seconds later covers the ordinary case
 * without turning a failed attach into a loop.
 *
 * Every failure ends in the unattached list, which the Video Bank already surfaces, so a clip is
 * never lost -- it is at worst one tap from the set it belongs to.
 */
export async function attachUploadedVideoInBackground(
  context: VideoRecordContext,
  videoUrl: string,
): Promise<void> {
  const target = context.reattach;
  if (!target) {
    recordUnattachedUpload({ url: videoUrl, label: context.label, uploadedAt: new Date().toISOString() });
    return;
  }
  let outcome = await attachVideoToSet(target, videoUrl, "background_upload", context.label);
  if (outcome !== "attached") {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    outcome = await attachVideoToSet(target, videoUrl, "background_upload", context.label);
  }
  if (outcome === "attached") {
    announceReattached(target, videoUrl);
    return;
  }
  recordUnattachedUpload({ url: videoUrl, label: context.label, uploadedAt: new Date().toISOString() });
}

export function refreshQueuedVideoRowIds(
  day: { assignmentId: number; programDayId: number; date: string },
  rows: { programExerciseId: number | null; setNumber: number; id: number }[],
): void {
  if (!isVideoOfflinePersistenceSupported()) return;
  const byKey = new Map<string, number>();
  for (const r of rows) if (r.programExerciseId != null) byKey.set(`${r.programExerciseId}:${r.setNumber}`, r.id);
  let changed = false;
  const next = readManifest().map((e) => {
    const t = e.reattach;
    if (!t || t.assignmentId !== day.assignmentId || t.programDayId !== day.programDayId || t.date !== day.date) return e;
    const id = byKey.get(`${t.programExerciseId}:${t.setNumber}`);
    if (id == null || id === t.workoutSetEntryId) return e;
    changed = true;
    return { ...e, reattach: { ...t, workoutSetEntryId: id } };
  });
  if (changed) writeManifest(next);
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
    // Same classification runVideoFlush uses below, for the same reason: an ApiError is not
    // a permanent rejection. This used to rethrow EVERY ApiError -- 500, 502, 503, 429 and
    // 401 included -- so a server cold start or a deploy in the seconds after a set was
    // filmed threw the clip away at the dialog instead of queueing it, while the very same
    // error forty lines down was (correctly) left on disk for the next flush. Only a 4xx the
    // server will keep rejecting is worth throwing; everything else is queued.
    const status = err instanceof ApiError ? err.status : null;
    const code = err instanceof ApiError ? err.code : undefined;
    if (err instanceof ApiError && isPermanentUploadRejection(status, code)) throw err;
    await persistVideoForUpload(
      blob,
      "/api/athlete/form-video",
      "video",
      filename,
      context,
      err instanceof ApiError ? "server_error" : "offline",
    );
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

  if (!entry.reattach) {
    // Nothing to attach to (a corrective, or a caller with no set): the clip is a standalone
    // Video Bank entry, and the local list is how it is shown.
    recordUnattachedUpload({ url, label: entry.label, uploadedAt: new Date().toISOString() });
    return;
  }
  const reason: VideoAttachReason | undefined =
    entry.queuedBecause === "server_error" ? "server_error_retry" : entry.queuedBecause === "offline" ? "offline_flush" : undefined;
  const outcome = await attachVideoToSet(entry.reattach, url, reason, entry.label);
  if (outcome === "attached") {
    announceReattached(entry.reattach, url);
  } else if (outcome === "unreached") {
    // Declined attaches are recorded server-side (the athlete's Video Bank and the coach's page
    // both read that list); only an attach the server never answered needs the local record.
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
  // Not this account's clip -- the Video Bank never lists it (see
  // listPendingVideos), so reaching here means a stale view.
  if (!belongsToCurrentUser(entry.ownerId)) return;
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
// Three triggers fire this, and a Wi-Fi reconnect trips at least two of
// them ("online" and networkStatusChange) within milliseconds. Each run read
// the manifest, found the same clip, and uploaded it -- the entry is only
// cleared after the upload returns -- so a single reconnect could upload the
// same video twice, against a storage cap the athlete pays for.
let videoFlushInFlight = false;

export async function flushPendingVideos() {
  if (videoFlushInFlight) return;
  videoFlushInFlight = true;
  try {
    await runVideoFlush();
  } finally {
    videoFlushInFlight = false;
  }
}

async function runVideoFlush() {
  if (!isVideoOfflinePersistenceSupported() || !(await isOnWifi())) return;
  for (const entry of readManifest()) {
    // Recorded by a different account on this device. Waits for them.
    if (!belongsToCurrentUser(entry.ownerId)) continue;
    try {
      await uploadPendingEntry(entry);
      toast.success(
        entry.reattach
          ? `${entry.label} finished uploading.`
          : "A queued video just finished uploading -- check the Video Bank.",
      );
    } catch (err) {
      // An ApiError is NOT the same as a permanent rejection, and treating it as one deleted
      // the athlete's recording. uploadWithProgress rejects with ApiError for every non-2xx --
      // 500, 502, 503, 429 and 401 included -- so a server cold-start or a deploy while the
      // phone reconnected on the drive home erased every clip filmed that session, from disk,
      // unrecoverably, with a message telling the athlete to re-record.
      //
      // Same classification offline-queue.ts's flushPendingLogs already uses: only a 4xx the
      // server will keep rejecting is permanent, and 401 (expired session), 408 and 429 are
      // explicitly not, because all three succeed on a later attempt.
      const status = err instanceof ApiError ? err.status : null;
      const code = err instanceof ApiError ? err.code : undefined;
      if (isPermanentUploadRejection(status, code)) {
        await clearPersistedVideo(entry.id);
        toast.error(
          `${entry.label}: couldn't be uploaded and was not saved -- you'll need to re-record it.`,
          { duration: 15000 },
        );
      }
      // Still offline, the server is having a moment, or the file read itself failed
      // transiently -- leave it queued and try again on the next flush.
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
    // Same "unknown" tolerance as isOnWifi() -- flushPendingVideos() below
    // re-checks isOnWifi() itself before actually uploading anything, so
    // this is just the trigger to re-attempt; requiring an exact "wifi"
    // match here on top of that meant a reconnect that iOS reports as
    // "unknown" (marginal signal, both radios up) never even prompted a
    // retry, and had to wait for the next app resume/foreground instead.
    if (status.connectionType !== "cellular" && status.connectionType !== "none") flushPendingVideos();
  });
  App.addListener("resume", flushPendingVideos);
}
