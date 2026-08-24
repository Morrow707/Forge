import fs from "fs/promises";
import path from "path";

const UPLOADS_ROOT = path.join(process.cwd(), "server", "uploads");

// Every URL this is called with is one this server generated itself
// (crypto.randomUUID()-named, returned from a logo upload route and
// round-tripped back through a save), so there's no untrusted path to
// sanitize the way a public file-deletion endpoint would need to. The
// containment check below is a defense-in-depth backstop, not the primary
// guard. Silently no-ops for null/undefined, any URL that isn't a local
// /uploads path, and a file that's already gone -- freeing disk space on a
// logo replace/removal is a best-effort side effect, never something that
// should fail the request it's attached to.
export async function deleteUploadedFile(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith("/uploads/")) return;
  const resolved = path.join(UPLOADS_ROOT, url.slice("/uploads/".length));
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return;
  try {
    await fs.unlink(resolved);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      console.error(`Failed to delete uploaded file at ${url}:`, err);
    }
  }
}
