import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A SET'S FRAMES ARE NEVER MARKED SERVER-HELD BY A SAVE THAT DID NOT CARRY THEM.
 *
 * `capturePersistedRef` decides what future saves may OMIT (build 620, after a session where
 * every finished set re-uploaded every earlier set's skeleton frames and the payload reached
 * 13MB). Omission is the right fix and it has one failure mode, which is total: a set that
 * enters that ref without having reached the server is omitted from every save afterwards, so
 * its frames are never sent and never will be. Silent, permanent.
 *
 * The ref was filled inside `if (synced)` from `itemsRef.current` -- the state as it stands when
 * the RESPONSE arrives, not what the REQUEST contained. CLAUDE.md records the `if (synced)`
 * guard as the safety, and it is necessary but not sufficient:
 *
 *   t0  a save's payload is built; set 3 has no capture yet
 *   t1  set 3's analysis finishes and its frames land in state
 *   t2  the save from t0 succeeds -> the loop reads current state and marks set 3 persisted
 *   t3  every later save omits set 3; its frames were never sent and never are
 *
 * With a ten-second save and a camera analysis finishing in the background, t1 landing between
 * t0 and t2 is the ordinary case rather than a corner. The fix reads the PAYLOAD, which is the
 * only honest record of what was sent and is already handed to onSuccess as the mutation's
 * variables.
 */
const src = readFileSync(join(process.cwd(), "client/src/pages/workout.tsx"), "utf8");

describe("capturePersistedRef only ever records what a payload really carried", () => {
  it("records the keys while BUILDING the payload, where omission is decided", () => {
    // The same condition that decides to omit is the one that decides to record, so the two
    // can never disagree -- which is the property the old code lacked.
    expect(src).toContain(
      "if (!omitCapture && setHasCapture(s)) sentCaptureKeys.add(captureKey(it.key, s.setNumber));",
    );
    expect(src).toContain("capturesSentRef.current.set(payload, sentCaptureKeys);");
  });

  it("marks from the payload on success, never from current state", () => {
    // Reshaped 2026-10-06 when the replay path was fixed: the source is now the WeakMap OR the
    // payload's own list. The PROPERTY is what matters and is what this asserts -- the keys come
    // from the payload, by either route, and never from the live state.
    expect(src).toContain("capturesSentRef.current.get(payload)");
    expect(src).toContain("capturePersistedRef.current.add(key)");
    // The shape that lost a set: iterating live state inside the success handler.
    expect(src).not.toMatch(
      /if \(synced\) \{\s*for \(const it of itemsRef\.current\)[\s\S]*?capturePersistedRef\.current\.add/,
    );
  });

  it("still requires a SYNCED save -- an offline resolve must not mark anything", () => {
    // Necessary as well as not sufficient: queueing resolves onSuccess with synced === false.
    const idx = src.indexOf("capturesSentRef.current.get(payload)");
    expect(idx).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, idx - 400), idx)).toContain("if (synced) {");
  });

  it("marks nothing for a payload that carried no record either way", () => {
    // Still ends in `?? []`, so a payload with neither a WeakMap entry nor a list marks nothing:
    // the capture stays un-marked and is re-sent, which costs bandwidth and can never lose data.
    //
    // 2026-10-06: a REPLAY off the queue used to land here on every retry, which on a flaky
    // connection meant nothing was ever marked and the payload grew to 7.8MB. It now carries its
    // own list -- see a-replayed-save-still-marks-what-it-sent.test.ts -- so this is the floor
    // rather than the normal case.
    expect(src).toMatch(/sentCaptureKeys \?\?\s*\[\];/);
    expect(src).toContain("useRef<WeakMap<object, Set<string>>>(new WeakMap())");
  });
});

/* AND THE SCREEN THAT CLAIMS A DAY MUST BE ABLE TO RESCUE IT.
 *
 * The workout screen claims its dayKey, which makes the global flush skip it ("the open workout
 * screen has claimed this day"). So while the screen is open, its own listeners are the only
 * thing that can replay a queued save -- and they were `online` alone, the one trigger
 * startOfflineLogSync documents as insufficient. A request that dies with "TypeError: Load
 * failed" never went offline, so no online event follows. 2026-10-06: a 1510KB save failed
 * exactly that way, queued, and every flush after it logged SKIPPED.
 */
describe("the screen that locks out the global flush can still rescue its own day", () => {
  it("listens on the same three signals the global flush does", () => {
    const start = src.indexOf("claimDayKeyForFlush(dayKey);");
    const end = src.indexOf("releaseDayKeyForFlush(dayKey);");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const effect = src.slice(start, end);
    expect(effect).toContain('window.addEventListener("online", resolveOwnPendingLog)');
    expect(effect).toContain('Network.addListener("networkStatusChange"');
    expect(effect).toContain('CapacitorApp.addListener("resume"');
  });

  it("removes all three when the screen goes away", () => {
    const cleanup = src.slice(src.indexOf("releaseDayKeyForFlush(dayKey);"));
    expect(cleanup).toContain('window.removeEventListener("online", resolveOwnPendingLog)');
    expect(cleanup).toContain("netHandle.then((h) => h.remove())");
    expect(cleanup).toContain("resumeHandle.then((h) => h.remove())");
  });

  it("is the same set of triggers startOfflineLogSync uses, so neither drifts", () => {
    const sync = readFileSync(join(process.cwd(), "client/src/lib/offline-queue.ts"), "utf8");
    const global = sync.slice(sync.indexOf("export function startOfflineLogSync"));
    for (const trigger of ['"online"', '"networkStatusChange"', '"resume"']) {
      expect(global, `global flush lost ${trigger}`).toContain(trigger);
    }
  });
});
