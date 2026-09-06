import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_ROOT, deleteUploadedFile } from "./uploaded-files";

// The contract that three deletion paths now depend on: this function's
// return value answers "are the bytes gone", which is a different question
// from "did this throw" (it never throws). It used to return nothing, so a
// disk error was indistinguishable from success and every caller cleared
// the database reference anyway -- orphaning the file beyond the reach of
// the job that would have retried it.

const written: string[] = [];

async function write(name: string): Promise<string> {
  const dir = path.join(UPLOADS_ROOT, "form-videos");
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, name);
  await fs.writeFile(full, "x");
  written.push(full);
  return `/uploads/form-videos/${name}`;
}

afterEach(async () => {
  await Promise.all(written.splice(0).map((f) => fs.rm(f, { force: true })));
});

describe("deleteUploadedFile reports whether the bytes are gone", () => {
  it("returns true and removes an existing file", async () => {
    const url = await write(`present-${Date.now()}.mp4`);
    expect(await deleteUploadedFile(url)).toBe(true);
    await expect(fs.stat(path.join(UPLOADS_ROOT, url.slice("/uploads/".length)))).rejects.toThrow();
  });

  it("returns true for a file that is already missing", async () => {
    expect(await deleteUploadedFile("/uploads/form-videos/never-existed.mp4")).toBe(true);
  });

  it("returns true for nothing to delete", async () => {
    expect(await deleteUploadedFile(null)).toBe(true);
    expect(await deleteUploadedFile(undefined)).toBe(true);
  });

  it("returns true for a URL that is not on this disk", async () => {
    expect(await deleteUploadedFile("https://example.test/video.mp4")).toBe(true);
  });

  it("returns true and deletes nothing for a path escaping the uploads root", async () => {
    expect(await deleteUploadedFile("/uploads/../../etc/passwd")).toBe(true);
  });

  it("returns false when the file cannot be removed", async () => {
    // A directory in place of a file is the portable way to make unlink
    // fail with something that is not ENOENT, without depending on running
    // as a user who cannot chmod its way past a permission bit.
    const dir = path.join(UPLOADS_ROOT, "form-videos", `blocked-${Date.now()}`);
    await fs.mkdir(dir, { recursive: true });
    try {
      expect(await deleteUploadedFile(`/uploads/form-videos/${path.basename(dir)}`)).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
