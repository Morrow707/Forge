/**
 * THE QUEUED SAVE'S BODY LIVES IN A FILE, NOT IN localStorage.
 *
 * Scott, 2026-09-28: "Why am I running out of storage??" -- two tracked sets queued while the
 * server restarted, each 6MB of skeleton frames, against a web-view localStorage quota of
 * about 5MB that Apple does not let an app raise. The queue trimmed the replay off both to
 * fit. The offline VIDEO queue never had this problem because it writes to the app's data
 * directory through the Capacitor Filesystem, where the ceiling is the phone's free space.
 * The save queue was written when a day was a few kilobytes and simply never moved.
 *
 * Only the BODY moves. The index (which days are waiting, who queued them, when) stays in
 * localStorage where the synchronous callers can read it. On the web there is no Filesystem,
 * and the queue falls back to the inline-payload path it always had.
 */
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

const DIR_PATH = "pending-logs";

export function pendingLogFilesSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export function pendingLogFilePath(id: string): string {
  return `${DIR_PATH}/${id}.json`;
}

export async function writePendingLogFile(id: string, payload: unknown): Promise<string> {
  const path = pendingLogFilePath(id);
  await Filesystem.writeFile({
    path,
    data: JSON.stringify(payload),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  return path;
}

export async function readPendingLogFile(path: string): Promise<unknown | null> {
  try {
    const file = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
    return JSON.parse(file.data as string);
  } catch {
    return null;
  }
}

export async function deletePendingLogFile(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch {
    // Already gone, or never written. Nothing to keep.
  }
}
