import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { uploadWithProgress } from "@/lib/queryClient";

// On-device fallback for a form-check/tracker clip recorded with no Wi-Fi --
// rather than either burning the athlete's cellular data on a multi-MB
// video or losing the clip outright (the old behavior: upload throws, the
// dialog falls back to saving the set's numbers with no video at all), the
// blob is kept locally in IndexedDB until Wi-Fi is available. Every call
// site that uploads a tracker/form-check clip should go through
// uploadOrQueueVideo below instead of POSTing to /api/athlete/form-video
// directly, so this behavior is consistent everywhere a video gets saved.
const DB_NAME = "forge-video-queue";
const STORE_NAME = "pending-videos";
const DB_VERSION = 1;
// Shown once, the first time a clip actually gets queued -- see
// hasWarnedAboutQueueing/markWarnedAboutQueueing below.
const WARNED_KEY = "forge-video-queue-warned";

export type QueuedVideoMeta = {
  // Human-readable context for the Video Bank list -- e.g. "Bench Press ·
  // Set 3". Not a foreign key: a clip queued mid-workout can easily outlive
  // the in-memory session it came from, so it's kept as a label for the
  // athlete's own reference rather than an attempt to silently re-attach
  // itself to that exact set once uploaded.
  label: string;
  recordedAt: string; // ISO
};

export type QueuedVideo = QueuedVideoMeta & {
  id: string;
  blob: Blob;
  filename: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const req = run(tx.objectStore(STORE_NAME));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function enqueueVideo(blob: Blob, filename: string, meta: QueuedVideoMeta): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await withStore("readwrite", (store) => store.put({ id, blob, filename, ...meta }));
}

export async function listQueuedVideos(): Promise<QueuedVideo[]> {
  const rows = await withStore<QueuedVideo[]>("readonly", (store) => store.getAll());
  return rows.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export async function removeQueuedVideo(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function queuedVideoCount(): Promise<number> {
  return (await listQueuedVideos()).length;
}

// Wi-Fi gating only matters natively -- the problem this solves is an
// athlete's phone plan at the gym, not a laptop browser tab, and
// @capacitor/network's web fallback is a best-effort guess anyway (the
// underlying Network Information API isn't universally supported). Web
// keeps uploading immediately, exactly like before this existed.
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

async function uploadNow(
  blob: Blob,
  filename: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const formData = new FormData();
  formData.append("video", blob, filename);
  const { url } = await uploadWithProgress("/api/athlete/form-video", formData, onProgress);
  return url;
}

/** Uploads immediately on Wi-Fi (or web); on a native device with no Wi-Fi,
 * queues the clip on-device and returns { status: "queued" } instead of
 * throwing -- callers should treat that the same as a successful save (the
 * clip is safe, just not uploaded yet) and show the one-time queued notice
 * rather than a failure toast. A genuine upload failure while actually on
 * Wi-Fi still throws, unchanged from before this wrapper existed -- only
 * the "no Wi-Fi" precondition is newly handled here. */
export async function uploadOrQueueVideo(
  blob: Blob,
  filename: string,
  meta: QueuedVideoMeta,
  onProgress?: (fraction: number) => void,
): Promise<{ status: "uploaded"; url: string } | { status: "queued" }> {
  if (!(await isOnWifi())) {
    await enqueueVideo(blob, filename, meta);
    return { status: "queued" };
  }
  const url = await uploadNow(blob, filename, onProgress);
  return { status: "uploaded", url };
}

/** Uploads one already-queued clip and removes it from the queue on
 * success -- used by both the Video Bank's manual "Upload Now" button
 * (which works over cellular too, as the deliberate escape hatch for an
 * athlete who trains somewhere with no Wi-Fi at all) and flushQueuedVideos
 * below. Left in the queue on failure so it's retried, not lost. */
export async function uploadQueuedVideo(
  item: QueuedVideo,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const url = await uploadNow(item.blob, item.filename, onProgress);
  await removeQueuedVideo(item.id);
  return url;
}

/** Silent background flush -- call on Wi-Fi reconnect and app resume. Only
 * attempts anything when actually on Wi-Fi (never spends cellular data on
 * its own); a per-item failure just leaves that clip queued for next time
 * rather than aborting the rest of the batch. Returns how many uploaded. */
export async function flushQueuedVideos(): Promise<number> {
  if (!(await isOnWifi())) return 0;
  const items = await listQueuedVideos();
  let uploaded = 0;
  for (const item of items) {
    try {
      await uploadQueuedVideo(item);
      uploaded++;
    } catch {
      // Left in the queue -- will retry on the next flush.
    }
  }
  return uploaded;
}
