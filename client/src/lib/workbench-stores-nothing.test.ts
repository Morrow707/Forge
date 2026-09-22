import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const plugin = readFileSync(
  join(process.cwd(), "ios", "App", "App", "AvSessionRecorderPlugin.swift"),
  "utf8",
);
const bridge = readFileSync(join(__dirname, "session-recorder.ts"), "utf8");
const controls = readFileSync(
  join(__dirname, "..", "components", "session-recorder-controls.tsx"),
  "utf8",
);
const compare = readFileSync(join(__dirname, "..", "components", "video-compare.tsx"), "utf8");
const registration = readFileSync(
  join(process.cwd(), "ios", "App", "App", "ForgeBridgeViewController.swift"),
  "utf8",
);

/**
 * THE WORKBENCH KEEPS NOTHING. Scott, 2026-09-22: "we won't be hosting it anyways, for them to
 * save it they will have to export it to their phone, so we don't store anything."
 *
 * Which makes the recording the only artifact, and makes "tell them before they start" a
 * correctness requirement rather than copy polish.
 */
describe("the session recorder", () => {
  it("is registered, or none of it exists at runtime", () => {
    expect(registration).toContain("registerPluginInstance(AvSessionRecorderPlugin())");
  });

  it("writes to a temp file and never uploads it", () => {
    expect(plugin).toContain("FileManager.default.temporaryDirectory");
    // No upload anywhere in the recorder: the file goes to Photos or it is discarded.
    expect(plugin).not.toMatch(/URLSession|multipart|upload/i);
    expect(bridge).not.toMatch(/apiRequest|fetch\(/);
  });

  it("never turns on the camera", () => {
    // This records the workbench. A front-camera inset would put the athlete's face into a file
    // the app then hands to Photos.
    expect(plugin).toContain("recorder.isCameraEnabled = false");
  });

  it("records the microphone, because the voice-over is the point", () => {
    expect(plugin).toContain("recorder.isMicrophoneEnabled");
  });

  it("cleans up a take the athlete did not keep", () => {
    // Nothing in Forge holds a reference to it, so without this it sits in tmp on the phone of
    // somebody who was just told their session is not stored anywhere.
    expect(plugin).toContain("@objc func discard");
    expect(plugin).toContain("FileManager.default.removeItem(at: url)");
  });

  it("only clears the take once it is actually saved", () => {
    // A failed save that dropped the file would lose the session outright, which is the one
    // outcome this control exists to prevent.
    const save = controls.slice(controls.indexOf("async function save()"));
    expect(save.indexOf("setTake(null)")).toBeGreaterThan(save.indexOf("await saveSessionRecordingToPhotos"));
  });

  it("says it stores nothing BEFORE the session, not after", () => {
    expect(controls).toContain("Nothing here is saved to Forge. Record the session to keep it.");
    expect(controls).toContain("Save it to your phone or it");
  });

  it("degrades to no button rather than a button that rejects", () => {
    // The workbench works on the web -- comparing, drawing and skeletons are all web. Only the
    // recording needs the native layer.
    expect(bridge).toContain("Capacitor.isNativePlatform()");
    expect(controls).toContain("if (!support) return null;");
    expect(controls).toContain("if (!support.supported)");
  });

  it("hangs off the compare dialog as a slot, not baked into it", () => {
    // The same dialog is the coach's compare tool, which has a server behind it and needs no
    // recorder at all.
    expect(compare).toContain("footer?: ReactNode;");
    expect(compare).toContain("{footer && <div");
  });
});
