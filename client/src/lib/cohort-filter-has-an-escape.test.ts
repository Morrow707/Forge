import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A FILTER MUST NOT BE ABLE TO STRAND SOMEBODY.
 *
 * Narrowing the cohort can legitimately produce no number -- that is the 30 floor working. But
 * the control that undoes the narrowing has to survive that state, or an athlete who taps "my
 * sport", gets "not enough athletes", and finds the chips gone is stuck with a dead card and
 * no way back.
 *
 * I built exactly that bug and caught it before it ran: the chips were inside the
 * `scored.length === 0 ? ... : ...` else-branch, so they vanished at precisely the moment they
 * were needed, under an empty state that told the reader to use them.
 */
const src = readFileSync("client/src/components/strength-profile-card.tsx", "utf8");

describe("the cohort chips", () => {
  it("render outside the empty/scored branch", () => {
    const chipsAt = src.indexOf("<CohortChip");
    const branchAt = src.indexOf("scored.length === 0 ?");
    expect(chipsAt, "the chips are gone").toBeGreaterThan(-1);
    expect(branchAt, "the empty-state branch is gone").toBeGreaterThan(-1);
    expect(
      chipsAt,
      "the chips moved inside the branch -- a thin cohort would hide the control that widens it",
    ).toBeLessThan(branchAt);
  });

  it("always offers the way back to the broadest group", () => {
    expect(src).toContain('label="Everyone my age"');
    expect(src).toContain("setCohort({ gender: false, sport: false })");
  });

  it("tells a filtered empty state how to escape, and an unfiltered one why to wait", () => {
    // The two empty states have different causes and different answers. One sentence for both
    // would be wrong for one of them.
    expect(src).toContain("Widen the comparison above");
    expect(src).toContain("Your lifts are still being recorded");
  });

  it("hides a filter this athlete cannot use rather than drawing it dead", () => {
    expect(src).toContain("data.available.gender");
    expect(src).toContain("data.available.sport");
  });

  it("takes the cohort sentence from the server, not from the chips", () => {
    // If the client assembled its own description, the words on screen and the group the query
    // actually used could drift apart -- and the drift would be invisible.
    expect(src).toContain("data.cohortLabel");
  });
});
