// A SAVE THAT CAME BACK OFF THE QUEUE STILL KNOWS WHAT IT CARRIED.
//
// 2026-10-06, read off Scott's build-629 debug console: saves back to 7084KB, 7627KB, 7771KB and
// climbing, where build 620 had them at 134KB after the first. Beside them in the same log, a 409,
// two `NetworkError: Can't reach Forge`, and a 16MB video upload that failed and queued.
//
// The omission was wired correctly and never got to act. `capturePersistedRef` -- what decides
// which captures a later save may OMIT -- is filled in onSuccess from a WeakMap keyed by the
// payload OBJECT. A payload replayed off the offline queue has been serialised to a file and read
// back, so it is a different object and the WeakMap does not know it. Build 624's note called that
// "one re-send, which can never lose anything". On a clean connection that is true. On a flaky one
// EVERY save is a replay, nothing is ever marked, and the payload grows until it fails -- which is
// the 13MB failure of build 620 arriving through another door.
//
// The fix is that the record travels WITH the payload, so it survives the round trip through the
// queue file. The WeakMap stays as the fast path, and the two cannot disagree because both are
// written at the one place omission is decided.
import fs from "node:fs";
import path from "path";

import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.resolve(__dirname, "../pages/workout.tsx"), "utf8");

describe("a replayed save still marks what it sent", () => {
  it("writes the carried keys onto the payload, beside the WeakMap", () => {
    // Both, from the same Set, at the one place omission is decided -- so they cannot drift.
    expect(src).toContain("capturesSentRef.current.set(payload, sentCaptureKeys);");
    expect(src).toContain("sentCaptureKeys = [...sentCaptureKeys]");
  });

  it("falls back to the payload's own list when the WeakMap does not know it", () => {
    expect(src).toContain("capturesSentRef.current.get(payload) ??");
    expect(src).toContain("sentCaptureKeys ??");
  });

  it("still marks ONLY what the save carried, never the current state", () => {
    // The 624 bug: reading itemsRef.current here marked a capture that finished WHILE the save
    // was in flight. Neither source may be the live state.
    const onSuccess = src.slice(src.indexOf("if (synced) {"), src.indexOf("if (synced) {") + 700);
    expect(onSuccess).not.toContain("itemsRef.current");
    expect(onSuccess).toContain("capturePersistedRef.current.add(key)");
  });

  it("marks nothing when the save did not succeed", () => {
    // A failed save must leave every capture unmarked, or the next one omits frames the server
    // never got. The guard is necessary AND not sufficient -- see 624 -- but it is necessary.
    const i = src.indexOf("const carried =");
    expect(src.slice(Math.max(0, i - 400), i)).toContain("if (synced) {");
  });

  it("survives the trip the offline queue actually makes", () => {
    // The queue writes the body to a file and reads it back, so whatever carries the record has
    // to be JSON. A WeakMap is not; an array on the payload is.
    const payload = { entries: [], sentCaptureKeys: ["a:1", "b:2"] };
    const roundTripped = JSON.parse(JSON.stringify(payload)) as typeof payload;
    expect(roundTripped.sentCaptureKeys).toEqual(["a:1", "b:2"]);
    expect(roundTripped).not.toBe(payload);
  });

  it("costs the wire almost nothing and the server ignores it", () => {
    // The log request is a plain z.object, which strips keys it does not declare. A few dozen
    // bytes of key strings against the megabytes this stops re-sending.
    const schema = fs.readFileSync(path.resolve(__dirname, "../../../shared/schema.ts"), "utf8");
    expect(schema).not.toContain("sentCaptureKeys");
  });
});
