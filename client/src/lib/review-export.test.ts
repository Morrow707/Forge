import { describe, it, expect, vi, afterEach } from "vitest";
import { pickExportMimeType, exportFileName, MAX_EXPORT_SECONDS } from "./review-export";

/**
 * THE EXPORT'S FILE TYPE, WHICH IS NOT A DETAIL.
 *
 * iOS Safari records mp4 and refuses webm; Chrome is the other way round. Asking for the wrong
 * one does not throw -- MediaRecorder falls back to its own default -- so the failure is a file
 * whose extension lies about its contents, uploaded, shared, and unplayable on somebody else's
 * phone. That is the kind of bug that only ever appears in a bug report.
 */
const original = globalThis.MediaRecorder;
afterEach(() => {
  globalThis.MediaRecorder = original;
});

function withSupport(supported: string[]) {
  globalThis.MediaRecorder = {
    isTypeSupported: (t: string) => supported.includes(t),
  } as unknown as typeof MediaRecorder;
}

describe("choosing the recording format", () => {
  it("prefers mp4 where the platform gives it", () => {
    withSupport(["video/mp4", "video/webm"]);
    expect(pickExportMimeType()).toMatch(/^video\/mp4/);
  });

  it("falls back to webm where mp4 is refused", () => {
    withSupport(["video/webm;codecs=vp9,opus", "video/webm"]);
    expect(pickExportMimeType()).toBe("video/webm;codecs=vp9,opus");
  });

  it("says no rather than guessing when nothing is supported", () => {
    // The caller refuses the export with a sentence. Starting a MediaRecorder anyway would
    // produce a file in whatever the browser felt like, named after what we asked for.
    withSupport([]);
    expect(pickExportMimeType()).toBeNull();
    // @ts-expect-error -- deliberately absent, as it is in a jsdom/older-WebView environment
    globalThis.MediaRecorder = undefined;
    expect(pickExportMimeType()).toBeNull();
  });
});

describe("the file it is offered as", () => {
  it("names the extension after what was actually recorded, never what was asked for", () => {
    expect(exportFileName("Squat check", "video/mp4;codecs=avc1")).toBe("squat-check.mp4");
    expect(exportFileName("Squat check", "video/webm;codecs=vp9")).toBe("squat-check.webm");
  });

  it("survives a title that is all punctuation", () => {
    expect(exportFileName("!!!", "video/mp4")).toBe("review.mp4");
    expect(exportFileName("  ", "video/webm")).toBe("review.webm");
  });
});

describe("the length cap", () => {
  it("is a wait limit, and a real one", () => {
    // The render runs in real time, so this number is how long somebody can be asked to sit
    // and watch their own review play through. Three minutes.
    expect(MAX_EXPORT_SECONDS).toBe(180);
  });
});
