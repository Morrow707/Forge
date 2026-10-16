/** A tracked set's skeleton frames, kept as a FILE on the persistent disk beside its video.
 *
 * WHY. Read off the first database-size log line, 2026-10-16: `workout_set_entries` was 450 MB
 * of a 489 MB database -- 92% -- on a 1 GB disk, with no real users yet. The column was
 * `skeleton_frames`, a json blob of up to 3,600 frames x 33 landmarks that the build-620 console
 * measured at ~10 MB a tracked set. And it was being REWRITTEN: `submitWorkoutLog` deletes and
 * re-inserts every set of the day on every save, carrying each set's frames forward, so a day
 * with four filmed sets rewrote 40 MB of JSON every time a rep count was typed. The dead tuples
 * that leaves behind are the 134 MB between what Postgres said it held and what the disk said
 * was used.
 *
 * WHAT THIS IS. The same shape the phone already uses for the same object (client/src/lib/
 * pending-log-files.ts: a queued save's body in a file, the index entry in storage): the frames
 * go to `UPLOADS_ROOT/set-traces/<athleteId>/<file>.json`, the row carries the `/uploads/...`
 * path in `skeleton_frames_path`, and a save that omits the key carries the PATH forward --
 * a string, not ten megabytes. The service's disk is 10 GB with 9 free; the database's is 1 GB.
 *
 * WHAT IT IS NOT. Not a URL anyone fetches: `set-traces` is in GATED_UPLOAD_DIRS
 * (media-url-signing.ts), so the static route refuses it without a signature, and nothing ever
 * signs one -- the two readers (`getSetClipFramesForAthlete`, the replay export) read the file
 * on the server and answer with the frames as they always have. A path string never leaves
 * the server in a response body either; readers select it to find the file and hand up the
 * frames. Not a retention change: the sweep that purges a video keeps its metrics, and a
 * trace is a metric (CLAUDE.md, "Purging a video never touches its metrics"), so the file
 * lives as long as the row does. Account deletion removes the athlete's whole directory.
 *
 * Every helper here goes through uploaded-files.ts for the path containment check and the
 * ledger stamp a delete makes, so an admin reconciliation can tell a deliberate removal from a
 * file the disk lost.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { UPLOADS_ROOT, deleteUploadedFile, readUploadedFile, uploadedFileDiskPath } from "./uploaded-files";

export const SET_TRACES_DIR = "set-traces";

/** The row's `exerciseKey` (`pe:<id>` or `c:<id>`) made safe for a file name. */
function fileSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "_");
}

/** A fresh, never-reused path for one set's frames. The random suffix is what lets a retake
 * write beside the file it replaces and delete the old one after the save commits, instead of
 * overwriting a file a concurrent reader may be streaming. */
export function setTracePathFor(athleteId: number, logId: number, exerciseKey: string, setNumber: number): string {
  const name = `${logId}-${fileSafe(exerciseKey)}-${setNumber}-${randomBytes(4).toString("hex")}.json`;
  return `/uploads/${SET_TRACES_DIR}/${athleteId}/${name}`;
}

export function isSetTracePath(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(`/uploads/${SET_TRACES_DIR}/`);
}

export async function writeSetTraceFile(url: string, frames: unknown[]): Promise<void> {
  const disk = uploadedFileDiskPath(url);
  if (!disk || !isSetTracePath(url)) throw new Error(`Not a set-trace path: ${url}`);
  await fs.mkdir(path.dirname(disk), { recursive: true });
  await fs.writeFile(disk, JSON.stringify(frames));
}

/** The frames in a trace file, or null when there is no file (purged disk, a path from a lost
 * volume). Never throws: a missing trace is a set with no replay, which is how the readers have
 * always treated a null column. */
export async function readSetTraceFile(url: string | null | undefined): Promise<unknown[] | null> {
  if (!isSetTracePath(url)) return null;
  const buf = await readUploadedFile(url);
  if (!buf) return null;
  try {
    const parsed = JSON.parse(buf.toString("utf8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function deleteSetTraceFile(url: string | null | undefined): Promise<void> {
  if (!isSetTracePath(url)) return;
  await deleteUploadedFile(url);
}

/** Everything an athlete's sets ever traced, at account deletion. The directory rather than a
 * list of rows: a file whose row was lost to an earlier bug would otherwise outlive the person. */
export async function deleteAthleteTraceDir(athleteId: number): Promise<void> {
  const dir = path.join(UPLOADS_ROOT, SET_TRACES_DIR, String(athleteId));
  if (!dir.startsWith(path.join(UPLOADS_ROOT, SET_TRACES_DIR) + path.sep)) return;
  await fs.rm(dir, { recursive: true, force: true });
}
