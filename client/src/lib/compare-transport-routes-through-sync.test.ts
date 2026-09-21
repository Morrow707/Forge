import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sidesToDrive } from "./video-sync";

// AN UNLINKED SIDE THAT IS NOT THE TARGET MUST NOT MOVE.
//
// That is the whole promise of the "Unlink" button: a coach steps the left clip frame by frame
// while the right one holds still on the position they want to compare against. A single stray
// `videoRight.play()` outside the transport's own loop breaks it, and breaks it INVISIBLY --
// both clips still play, which looks like the linked mode working rather than the unlinked mode
// failing. Nobody files that bug; they just stop trusting the toggle.
//
// video-sync.test.ts already covers what sidesToDrive RETURNS. What it cannot cover is whether
// the component asks. This is the other half: every transport action in video-compare.tsx has
// to go through sidesToDrive, so the decision lives in the one tested function rather than
// being re-derived at each call site.
const COMPARE = readFileSync(
  join(__dirname, "..", "components", "video-compare.tsx"),
  "utf8",
);

/** Comments stripped: this file explains the rule it enforces, and a scan that reads its own
 * explanation as a violation is the failure mode the read-ratchet already hit once. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SRC = code(COMPARE);

describe("the compare transport", () => {
  it("is reading the component it thinks it is", () => {
    // A scan that matches nothing passes forever while checking nothing.
    expect(SRC).toContain("sidesToDrive");
    expect(SRC.length).toBeGreaterThan(5000);
  });

  it("drives playback only through sidesToDrive", () => {
    // Every play()/pause() must sit inside a loop over sidesToDrive's result. The check is
    // deliberately crude -- it asserts the calls are on a variable resolved from that loop
    // (`v`), never on a side-specific ref like videoLeftRef.current.play().
    const sideSpecificPlayback = [
      ...SRC.matchAll(/\b(videoL|videoR|leftVideo|rightVideo|videoLeftRef|videoRightRef)[A-Za-z]*\??\.(play|pause)\s*\(/g),
    ].map((m) => m[0]);
    expect(
      sideSpecificPlayback,
      "playback aimed at one side by name bypasses the linked/unlinked decision entirely",
    ).toEqual([]);
  });

  it("keeps the linked decision in one place", () => {
    // One call site per transport action (toggle play, seek). More than a handful means the
    // decision is being re-derived, which is how the two modes drift apart.
    const calls = [...SRC.matchAll(/sidesToDrive\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeLessThanOrEqual(6);
  });

  it("never treats an unlinked, untargeted side as drivable", () => {
    // The property itself, restated here so this file fails for the right reason if somebody
    // changes sidesToDrive rather than the component.
    expect(sidesToDrive("left", false)).not.toContain("right");
    expect(sidesToDrive("right", false)).not.toContain("left");
    // And the converse: linked means both, or the toggle does nothing.
    expect(sidesToDrive("left", true)).toContain("right");
    expect(sidesToDrive("right", true)).toContain("left");
  });

  it("corrects drift only while linked", () => {
    // The rAF drift correction nudges the follower onto the master's mapped time. Running it
    // unlinked would drag a deliberately-parked clip back, which is the same bug by another
    // route -- so the guard is pinned here.
    expect(SRC).toMatch(/linkedRef\.current\s*&&/);
  });
});
