import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

/* A SKELETON TRACE IS WRITTEN GZIPPED AND EITHER FORM READS BACK (2026-11-17, the cost audit).
 * Traces are kept as long as their set, so they are the one storage line that only grows. New files
 * are gzipped; files written before this are plain JSON and must still read, untouched. */

const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-traces-"));
process.env.STORAGE_PATH = root;

// A realistic frame: 33 normalized and 33 world landmarks of x, y, z, visibility.
const lm = () => ({ x: Math.random(), y: Math.random(), z: Math.random() - 0.5, visibility: Math.random() });
const frames = Array.from({ length: 300 }, (_, i) => ({ t: i / 30, landmarks: Array.from({ length: 33 }, lm), worldLandmarks: Array.from({ length: 33 }, lm) }));

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("set-trace files", () => {
  it("writes a gzip file that reads back to the same frames, and is much smaller than the JSON", async () => {
    const { setTracePathFor, writeSetTraceFile, readSetTraceFile } = await import("./set-trace-files");
    const { uploadedFileDiskPath } = await import("./uploaded-files");
    const url = setTracePathFor(7, 1, "pe:3", 1);
    await writeSetTraceFile(url, frames);
    const raw = fs.readFileSync(uploadedFileDiskPath(url)!);
    expect([raw[0], raw[1]]).toEqual([0x1f, 0x8b]);
    expect(JSON.parse(gunzipSync(raw).toString("utf8"))).toEqual(frames);
    expect(await readSetTraceFile(url)).toEqual(frames);
    const plain = Buffer.byteLength(JSON.stringify(frames));
    expect(raw.length).toBeLessThan(plain * 0.6);
  });

  it("still reads a trace written as plain JSON before compression", async () => {
    const { setTracePathFor, readSetTraceFile } = await import("./set-trace-files");
    const { uploadedFileDiskPath } = await import("./uploaded-files");
    const url = setTracePathFor(7, 2, "pe:3", 1);
    const disk = uploadedFileDiskPath(url)!;
    fs.mkdirSync(path.dirname(disk), { recursive: true });
    fs.writeFileSync(disk, JSON.stringify(frames));
    expect(await readSetTraceFile(url)).toEqual(frames);
  });
});
