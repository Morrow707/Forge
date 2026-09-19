import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_FREE_AGENT_TIER_IDS,
  FREE_AGENT_TIERS,
  entitlementsForFreeAgentTier,
} from "@shared/free-agent-tiers";

/**
 * THE CAMERA BUTTON IS DRAWN ONLY FOR SOMEONE WHO MAY ACTUALLY USE IT.
 *
 * The server has gated clip upload on a Free Agent's tier for a long time. The CLIENT never
 * asked: every tracker control was drawn on `trackingLevel !== "none"` alone. So a Basic or AI
 * Coach Free Agent saw the record button, filmed a set, watched the analysis run, and hit a 402
 * only when the clip tried to save -- numbers on screen, video gone. That is the worst possible
 * order to meet a paywall in, and it reads as a bug rather than a price.
 *
 * Both workout pages had it. The strength page is the obvious one; skill-workout runs the sprint
 * and mechanics trackers and was missed on the first pass, which is why this checks both by name
 * rather than trusting that the one somebody remembered was the only one.
 */

const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "..", ...p), "utf8");

describe("only the two paid-for tiers grant camera access", () => {
  it("excludes Basic and AI Coach", () => {
    // Nothing here changes what a tier BUYS -- it asserts what the tiers already say, so that a
    // later "let's include form-check in AI Coach" is a deliberate edit to this expectation
    // rather than something that slips through with a pricing tweak.
    expect(entitlementsForFreeAgentTier("basic").hasVideoFormCheck).toBe(false);
    expect(entitlementsForFreeAgentTier("ai_coach").hasVideoFormCheck).toBe(false);
  });

  it("grants it to exactly one tier, the withdrawn video one", () => {
    const withCamera = ALL_FREE_AGENT_TIER_IDS.filter(
      (id) => FREE_AGENT_TIERS[id].hasVideoFormCheck,
    );
    expect(withCamera).toEqual(["ai_coach_video"]);
  });

  it("gives an unknown or absent tier nothing", () => {
    // A signed-in Free Agent who has never bought anything has a null tier, and the safe answer
    // for "may they film" is no.
    expect(entitlementsForFreeAgentTier(null).hasVideoFormCheck).toBe(false);
    expect(entitlementsForFreeAgentTier("something_else").hasVideoFormCheck).toBe(false);
  });
});

describe("both workout pages ask before drawing a camera control", () => {
  it.each([
    ["strength workout", ["client", "src", "pages", "workout.tsx"]],
    ["skill workout", ["client", "src", "pages", "skill-workout.tsx"]],
  ])("%s gates its tracker controls on camera access", (_label, parts) => {
    const src = read(...parts);
    expect(src).toContain("useCameraAccess");
    // Every control that can START a recording sits behind the trackingOptOut check already, so
    // the access gate has to ride alongside it -- added to one branch and forgotten on the rest
    // is exactly how skill-workout got missed the first time.
    const optOutChecks = [...src.matchAll(/!user\?\.trackingOptOut/g)].length;
    const gatedChecks = [...src.matchAll(/cameraAllowed && !user\?\.trackingOptOut/g)].length;
    expect(optOutChecks).toBeGreaterThan(0);
    expect(gatedChecks).toBe(optOutChecks);
  });

  it("still lets anyone watch a clip they already recorded", () => {
    // The form-check button previews an existing video OR records a new one, and only the second
    // half is a purchase. Gating the whole control would hide a video the athlete already has,
    // which takes something away rather than withholding something unbought -- and it would hit
    // hardest on exactly the sets that were filmed before a subscription lapsed.
    expect(read("client", "src", "pages", "workout.tsx")).toContain(
      "(set.formCheckVideoUrl || (cameraAllowed && !user?.trackingOptOut))",
    );
  });

  it("requires an explicit true, so an unanswered query does not open the camera", () => {
    // `undefined` means the server has not answered yet. Treating that as permission would flash
    // the button at somebody who cannot use it, which is the bug this fixes, one frame shorter.
    for (const parts of [
      ["client", "src", "pages", "workout.tsx"],
      ["client", "src", "pages", "skill-workout.tsx"],
    ]) {
      expect(read(...parts)).toMatch(/useCameraAccess\(\)(\?\.allowed === true|;)/);
    }
    expect(read("client", "src", "pages", "workout.tsx")).toContain(
      "cameraAccess?.allowed === true",
    );
  });

  it("a failed read is said on the page, not shown as a missing button", () => {
    // `allowed` stays undefined on a failed request, so no control is drawn -- correct. But a
    // coach with every right to film then sees the button missing with nothing to act on. The
    // hook reports the failure and both pages render ReadFailed with its retry.
    const hook = read("client", "src", "hooks", "use-camera-access.ts");
    expect(hook).toContain("failed: isError");
    for (const parts of [
      ["client", "src", "pages", "workout.tsx"],
      ["client", "src", "pages", "skill-workout.tsx"],
    ]) {
      const src = read(...parts);
      expect(src).toMatch(/cameraAccess\.failed && \(\s*<ReadFailed/);
      expect(src).toContain("onRetry={cameraAccess.retry}");
    }
  });
});
