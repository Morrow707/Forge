import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPermanentUploadRejection } from "./upload-rejection";

/** uploadOrQueueVideo used to rethrow every ApiError while runVideoFlush, forty lines below
 * it, classified the same error as retryable -- so a 503 during the set itself lost the clip
 * and the identical 503 on the drive home kept it. Both paths must use the one classifier. */
const src = readFileSync(join(process.cwd(), "client/src/lib/video-offline-store.ts"), "utf8");

describe("an immediate upload that meets a server error is queued, not thrown away", () => {
  it("classifies with isPermanentUploadRejection before rethrowing", () => {
    const fn = src.slice(src.indexOf("export async function uploadOrQueueVideo"), src.indexOf("async function uploadPendingEntry"));
    expect(fn).toContain("isPermanentUploadRejection(status, code)");
    expect(fn).not.toMatch(/if \(err instanceof ApiError\) throw err;/);
  });
  it("treats 500, 502, 503, 429 and 401 as retryable and a plain 400 as permanent", () => {
    for (const s of [500, 502, 503, 429, 401, 408]) expect(isPermanentUploadRejection(s)).toBe(false);
    expect(isPermanentUploadRejection(400)).toBe(true);
    expect(isPermanentUploadRejection(413)).toBe(true);
  });
});
