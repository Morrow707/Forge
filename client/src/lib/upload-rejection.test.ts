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

// The guardian gate and the offline queues were built on the same day and
// interact badly without this. The gate refuses every athlete route with a
// 403 while a minor has no guardian linked; a 403 is otherwise the textbook
// permanent rejection, so the queues would delete the athlete's workout and
// their video off disk -- for a refusal that stops the moment their parent
// opens the invite email.
describe("the guardian gate's 403 is a 'not yet', not a refusal", () => {
  it("does not treat it as permanent", () => {
    expect(isPermanentUploadRejection(403, "guardian_link_required")).toBe(false);
  });

  it("still treats a plain 403 as permanent", () => {
    // A real authorization failure has not changed meaning.
    expect(isPermanentUploadRejection(403)).toBe(true);
    expect(isPermanentUploadRejection(403, "some_other_code")).toBe(true);
  });

  it("does not let the code override a status that is already retryable", () => {
    expect(isPermanentUploadRejection(503, "guardian_link_required")).toBe(false);
    expect(isPermanentUploadRejection(null, "guardian_link_required")).toBe(false);
  });
});

describe("the code survives the trip from the server", () => {
  it("is captured off the response body onto ApiError", async () => {
    // The classifier is useless if the queues never see a code. queryClient
    // used to read `message` off the body and drop everything else.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./queryClient.ts", import.meta.url), "utf8"),
    );
    expect(src).toContain('typeof data?.code === "string"');
    expect(src).toContain("new ApiError(res.status, message, code)");
  });

  it("is passed into the classifier by both queues", async () => {
    const fs = await import("node:fs");
    for (const f of ["offline-queue.ts", "video-offline-store.ts"]) {
      const src = fs.readFileSync(new URL("./" + f, import.meta.url), "utf8");
      expect(src, f).toContain("err instanceof ApiError ? err.code : undefined");
      expect(src, f).toMatch(/isPermanentUploadRejection\(status, code\)/);
    }
  });
});
