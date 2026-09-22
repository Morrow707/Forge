import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// "Why am I still getting that weird screen after I hit stop, we got rid of that weeks ago, the
// camera should instantly close and go back to the workout screen." -- Scott, 2026-09-22.
//
// It HAD been fixed, and then the upload speed-up put it back. Turning a recording into an
// uploadable Blob means a 720p re-encode of a 28-second 120fps movie plus reading the bytes
// across the bridge -- tens of seconds -- and that ran inside stopAvRecording, before the
// callback the dialogs closed on. So the close moved from "when the recorder stops" to "when the
// transcode finishes" without anyone touching a dialog.
//
// These assertions are about ORDER, which is the only thing that was ever wrong here.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the camera closes the instant the recorder stops", () => {
  it("stops to a path, and does the slow blob work separately", () => {
    const src = read("client/src/lib/native-av-preview.ts");
    expect(src).toContain("export async function stopAvRecordingToPath()");
    expect(src).toContain("export async function readAvRecordingForUpload(");
    // The fast one must not transcode. compressForUpload belongs to the reader.
    const toPath = src.slice(
      src.indexOf("export async function stopAvRecordingToPath()"),
      src.indexOf("export async function readAvRecordingForUpload("),
    );
    expect(toPath).not.toContain("compressForUpload");
    expect(toPath).not.toContain("convertFileSrc");
  });

  it("tells the caller the recording stopped before reading the blob", () => {
    const src = read("client/src/lib/use-av-body-tracking.ts");
    const stopped = src.indexOf("options?.onRecordingStopped?.()");
    const read_ = src.indexOf("readAvRecordingForUpload(path)");
    expect(stopped).toBeGreaterThan(-1);
    expect(read_).toBeGreaterThan(-1);
    expect(stopped).toBeLessThan(read_);
    // And the blob read is not awaited there, or the analysis would queue behind the transcode.
    expect(src).toContain("const blobPromise = readAvRecordingForUpload(path)");
  });

  it("closes both set-card dialogs from onRecordingStopped, not onBlobReady", () => {
    for (const file of [
      "client/src/components/av-bar-tracker-dialog.tsx",
      "client/src/components/av-jump-tracker-dialog.tsx",
    ]) {
      const src = read(file);
      const handler = src.slice(
        src.indexOf("onRecordingStopped: () => {"),
        src.indexOf("onBlobReady:", src.indexOf("onRecordingStopped: () => {")),
      );
      expect(handler, file).toContain("onAnalysisStarted(forSetNumber)");
      expect(handler, file).toContain("onOpenChange(false)");
    }
  });

  it("does not re-encode a recording it is about to throw away", () => {
    const src = read("client/src/lib/use-av-body-tracking.ts");
    const cancel = src.slice(
      src.indexOf("async function cancelRecording()"),
      src.indexOf("async function stopRecordingAndAnalyze("),
    );
    expect(cancel).toContain("stopAvRecordingToPath()");
    expect(cancel).not.toContain("readAvRecordingForUpload");
  });
});
