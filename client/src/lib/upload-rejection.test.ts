import { describe, it, expect } from "vitest";
import { isPermanentUploadRejection } from "./upload-rejection";

describe("isPermanentUploadRejection", () => {
  // The bug this exists to prevent: the video queue treated every non-2xx as permanent and
  // deleted the athlete's recording from disk. A server cold-start on the drive home erased a
  // whole session's footage, unrecoverably.
  it.each([500, 502, 503, 504])("keeps a %i queued for another try", (status) => {
    expect(isPermanentUploadRejection(status)).toBe(false);
  });

  it.each([
    [401, "the session expired and a re-login fixes it"],
    [408, "the server gave up waiting and the next attempt gets a fresh timeout"],
    [429, "rate limiting is a request to come back, not a refusal"],
  ])("keeps a %i queued, because %s", (status) => {
    expect(isPermanentUploadRejection(status)).toBe(false);
  });

  it("never treats a total absence of response as permanent", () => {
    expect(isPermanentUploadRejection(null)).toBe(false);
    expect(isPermanentUploadRejection(undefined)).toBe(false);
  });

  it.each([400, 403, 404, 413, 422])("drops a %i, which will fail the same way forever", (status) => {
    expect(isPermanentUploadRejection(status)).toBe(true);
  });

  it("does not treat a success as a rejection", () => {
    for (const status of [200, 201, 204, 302]) {
      expect(isPermanentUploadRejection(status), String(status)).toBe(false);
    }
  });
});
