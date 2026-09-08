// Shared disk cleanup for anything saved under server/uploads (see
// UPLOADS_DIR/SKILL_VIDEOS_DIR/ANNOTATIONS_DIR in routes.ts) -- deleting a
// video's DB reference (a "Remove" button, an admin delete, a retake
// replacing an old clip) doesn't itself free any disk space unless
// something also unlinks the file those bytes actually live in. Kept as
// its own module rather than living in routes.ts so storage.ts (which
// needs it for the delete-on-remove/retake fix in submitWorkoutLog, and
// for the admin video-management routes) can import it without reaching
// into the route-registration file.
import fs from "fs/promises";
import path from "path";

// STORAGE_PATH (render.yaml) points this at the persistent disk's mount point
// (outside the deployed source tree) in production; falls back to the old
// in-repo path for local dev, where there's no disk to mount at all. Exported
// so routes.ts derives every one of its own upload subdirectories (form
// videos, skill videos, annotations, lesson media, logos, ...) from this
// exact same value instead of each recomputing process.cwd() independently --
// two paths that are SUPPOSED to be identical but are computed separately are
// exactly the kind of thing that quietly drifts apart during a refactor.
export const UPLOADS_ROOT = process.env.STORAGE_PATH || path.join(process.cwd(), "server", "uploads");

// Whether that fallback is what is actually in use. In development it is the normal case; in
// production it means every uploaded file is being written into the deployed source tree, which
// the host replaces on each deploy -- so videos and books survive only until the next push.
//
// This is not hypothetical. It ran that way in production while a 10GB persistent disk sat
// mounted and empty: the disk existed, the mount path was right, STORAGE_PATH simply was not set
// on the service, and the fallback silently absorbed it. Nothing anywhere said so. The only
// visible symptom was athletes' clips and an ingested textbook disappearing hours later, which
// looks exactly like a bug in whatever code last touched them -- and cost most of a day being
// investigated as one.
//
// A default that quietly does the wrong thing in production has to announce itself. See
// warnIfUploadsAreEphemeral, called at startup.
export const UPLOADS_ROOT_IS_FALLBACK = !process.env.STORAGE_PATH;

export function warnIfUploadsAreEphemeral(): void {
  if (!UPLOADS_ROOT_IS_FALLBACK) {
    console.log(`Uploads root: ${UPLOADS_ROOT} (STORAGE_PATH)`);
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`Uploads root: ${UPLOADS_ROOT} (local fallback, no STORAGE_PATH set)`);
    return;
  }
  // Deliberately not fatal. Refusing to boot would take a working platform offline over a
  // misconfiguration that only affects new uploads, and an athlete who cannot open the app is
  // worse off than one whose video is at risk. Loud enough to be found, though: this is the
  // difference between files that persist and files that do not.
  console.error(
    "=".repeat(78) +
      `\nUPLOADS ARE EPHEMERAL: STORAGE_PATH is not set, so uploads are being written to\n` +
      `  ${UPLOADS_ROOT}\n` +
      "which is inside the deployed source tree and is REPLACED ON EVERY DEPLOY. Every\n" +
      "form-check video, skill clip, annotation and ingested document written here will be\n" +
      "lost the next time this service deploys.\n\n" +
      "Fix: set STORAGE_PATH on the service to the persistent disk's mount path (render.yaml\n" +
      "declares /var/data/forge-uploads). A disk being mounted is not enough on its own -- if\n" +
      "nothing sets this variable, the disk stays empty and the app never notices.\n" +
      "=".repeat(78),
  );
}

// Every URL this is ever called with is one this server generated itself
// (crypto.randomUUID()-named, returned from an /api/*/form-video or
// /api/*/skill-video upload route and round-tripped back through a save --
// never free text a user typed), so there's no untrusted path to sanitize
// in the way a public file-deletion endpoint would need to. The
// containment check below is a defense-in-depth backstop, not the primary
// guard. Silently no-ops for null/undefined, any URL that isn't a local
// /uploads path (nothing else lives on this disk), and a file that's
// already gone -- freeing disk space is a best-effort side effect of
// clearing a video reference, never something that should fail the
// request it's attached to.
//
// Returns whether the bytes are actually gone, which is NOT the same
// question as whether this threw. It never throws, and it used to return
// nothing at all: an EACCES or EIO on the mounted disk was logged and then
// indistinguishable from success, so every caller went on to null the URL
// column anyway. That turned a failed delete into a file with no row
// pointing at it, unreachable by the retention job that would otherwise
// have retried it tomorrow -- the exact opposite of what a compliance
// purge of a minor's footage is supposed to guarantee. A missing file
// still counts as gone (true): there is nothing left to delete, so
// clearing the reference is correct.
export async function deleteUploadedFile(url: string | null | undefined): Promise<boolean> {
  if (!url || !url.startsWith("/uploads/")) return true;
  const resolved = path.join(UPLOADS_ROOT, url.slice("/uploads/".length));
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return true;
  try {
    await fs.unlink(resolved);
    return true;
  } catch (err: any) {
    if (err?.code === "ENOENT") return true;
    console.error(`Failed to delete uploaded file at ${url}:`, err);
    return false;
  }
}

// Best-effort file size for the admin storage-management view -- null for
// anything not on local disk or already missing, same non-throwing
// contract as deleteUploadedFile above.
export async function statUploadedFile(url: string | null | undefined): Promise<number | null> {
  if (!url || !url.startsWith("/uploads/")) return null;
  const resolved = path.join(UPLOADS_ROOT, url.slice("/uploads/".length));
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return null;
  try {
    const stat = await fs.stat(resolved);
    return stat.size;
  } catch {
    return null;
  }
}

// Real free space on the volume server/uploads lives on (see render.yaml's
// forge-uploads disk, a fixed 10GB mount) -- shared by the upload-time
// requireDiskSpace guard in routes.ts and the admin storage-summary route,
// so both read the exact same number instead of two statfs calls drifting
// apart. Returns null (never throws) if the check itself fails, e.g. statfs
// isn't supported on the host filesystem -- callers decide how to treat
// "unknown" themselves (routes.ts fails open; the admin summary just omits
// the figure).
export async function getUploadsDiskFreeBytes(): Promise<number | null> {
  try {
    const stats = await fs.statfs(UPLOADS_ROOT);
    return stats.bavail * stats.bsize;
  } catch (err) {
    console.error("Disk space check failed", err);
    return null;
  }
}

// Free AND total, for the admin dashboard's storage badge. Kept separate
// from the function above rather than widening it, because every existing
// caller of that one wants a single number and none of them should have to
// destructure to get it.
//
// The disk holds every form-check and skill video anyone has ever
// uploaded, on a fixed 10GB Render volume (render.yaml). When it fills,
// uploads fail -- and before this badge existed, the first anyone would
// hear of it was an athlete reporting that saving a lift did nothing.
export async function getUploadsDiskUsage(): Promise<{
  freeBytes: number;
  totalBytes: number;
  usedFraction: number;
} | null> {
  try {
    const stats = await fs.statfs(UPLOADS_ROOT);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    if (totalBytes <= 0) return null;
    return { freeBytes, totalBytes, usedFraction: 1 - freeBytes / totalBytes };
  } catch (err) {
    console.error("Disk usage check failed", err);
    return null;
  }
}

// Same null-safe, non-throwing contract as the two above -- reads an
// uploaded file's bytes for embedding elsewhere (e.g. a coach's brand logo
// into a PDF export), rather than serving it back over HTTP.
export async function readUploadedFile(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !url.startsWith("/uploads/")) return null;
  const resolved = path.join(UPLOADS_ROOT, url.slice("/uploads/".length));
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return null;
  try {
    return await fs.readFile(resolved);
  } catch {
    return null;
  }
}
