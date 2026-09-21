import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { agoLabel, priorClipRouteFor } from "@/lib/prior-clip";

/**
 * THE "YOU VERSUS YOU" SHORTCUT (Phase 4b of docs/video-review-plan.md).
 *
 * The suggestion makes a claim in its own label -- "compare to 3 weeks ago" -- and the claim
 * is the reason anybody taps it. Two things have to hold for it to be true: the gap is
 * described from the two dates rather than guessed, and the clip comes from a route scoped to
 * the athlete whose comparison this is.
 */
describe("the gap in the suggestion's label", () => {
  it("describes weeks, months and years from the two dates", () => {
    expect(agoLabel("2026-08-30", "2026-09-20")).toBe("3 weeks ago");
    expect(agoLabel("2026-06-20", "2026-09-20")).toBe("3 months ago");
    expect(agoLabel("2025-09-20", "2026-09-20")).toBe("a year ago");
    expect(agoLabel("2023-09-20", "2026-09-20")).toBe("3 years ago");
  });

  it("says nothing rather than something wrong", () => {
    // Under the server's own 14-day floor there is no honest "ago" to print, and a garbled
    // date must not become "NaN weeks ago" on a button.
    expect(agoLabel("2026-09-18", "2026-09-20")).toBeNull();
    expect(agoLabel("not a date", "2026-09-20")).toBeNull();
  });
});

describe("where the suggestion asks", () => {
  it("asks the caller's own route, never one that takes somebody else's id", () => {
    expect(priorClipRouteFor({ kind: "self" })).toBe("/api/athlete/clips/prior");
    expect(priorClipRouteFor({ kind: "roster", athleteId: 7, athleteName: "A" })).toBe(
      "/api/coach/roster/7/clips/prior",
    );
  });

  it("offers nothing to a guardian", () => {
    // There is no guardian prior-clip route. The suggestion is a coaching prompt, and
    // widening what a guardian may pull is a consent question rather than a UI one -- a
    // route invented here would 404 at best and disclose at worst.
    expect(priorClipRouteFor({ kind: "guardian", athleteId: 7, athleteName: "A" })).toBeNull();
  });

  it("draws nothing at all when the read fails or comes back empty", () => {
    // A picker sits underneath this, so a missing shortcut costs one extra tap. An error
    // banner for an optional convenience is louder than the thing it reports, and this is
    // the kind of early return a later edit quietly turns into a <ReadFailed>.
    const src = readFileSync("client/src/components/clip-picker.tsx", "utf8");
    expect(src).toContain("if (!enabled || prior.isError || !prior.data) return null;");
  });
});
