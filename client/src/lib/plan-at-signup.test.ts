import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bandForAthleteCount } from "@shared/billing-tiers";

/**
 * A SCHOOL PICKS ITS PLAN AT SIGNUP, AND THE PRICE IT IS SHOWN IS THE PRICE IT IS BILLED.
 *
 * Two things can go wrong here and neither shows up as a crash.
 *
 * The first is sending `expectedAthletes` for an athlete. The server takes it only from a
 * coach, and an athlete signup that carries it is either rejected or -- worse -- accepted,
 * quietly attaching a billing plan to somebody who is not buying one. The field has to sit
 * under the coach branch, the same way sport/position/height already do.
 *
 * The second is a hand-typed price. The band ladder lives in shared/billing-tiers.ts and is
 * read by the pricing page and the coach billing page; a signup screen that spells out
 * "$160/month" in its own JSX is a fourth copy that nobody updates when the rate moves, and
 * the person who finds out is the school that was quoted one number and charged another.
 * So: the signup page must derive its live band text from bandForAthleteCount.
 *
 * A scan, not a render test -- the copy is inline in signup.tsx and cannot be reached without
 * mounting the whole auth-provider tree. The checkpoints below are the other half: they run
 * the real function, so the scan and the arithmetic fail for different reasons.
 */

const signupSrc = readFileSync(
  join(__dirname, "..", "pages", "signup.tsx"),
  "utf8",
);

describe("signup sends expectedAthletes only for a coach", () => {
  it("guards the field on the coach role in the signup body", () => {
    const line = signupSrc
      .split("\n")
      .find((l) => l.includes("expectedAthletes:"));
    expect(line, "signup.tsx must send an expectedAthletes field").toBeTruthy();
    // e.g. `expectedAthletes: role === "coach" ? expectedAthletesNum : undefined,`
    expect(line).toMatch(/role\s*===\s*"coach"/);
    expect(line).toMatch(/undefined/);
  });

  it("never sends it under the athlete branch", () => {
    // An athlete-guarded send would read `role === "athlete" ... expectedAthletes`.
    const athleteBranchSend = /expectedAthletes[^\n]*role\s*===\s*"athlete"/.test(signupSrc);
    expect(athleteBranchSend).toBe(false);
  });

  it("only draws the question for a coach", () => {
    expect(signupSrc).toMatch(/role === "coach" && !joiningStaff && \(\s*\n?\s*<div/);
    expect(signupSrc).toContain("How many athletes will you have?");
  });

  it("validates before submitting rather than letting the server 400 answer it", () => {
    expect(signupSrc).toMatch(/Number\.isInteger\(expectedAthletesNum\)/);
    expect(signupSrc).toMatch(/if \(role === "coach" && !joiningStaff && !expectedAthletesValid\)/);
  });
});

describe("the live band text is computed, not typed", () => {
  it("derives the band and the price from shared/billing-tiers", () => {
    expect(signupSrc).toMatch(
      /import \{[^}]*bandForAthleteCount[^}]*\} from "@shared\/billing-tiers"/,
    );
    expect(signupSrc).toContain("bandForAthleteCount(expectedAthletesNum)");
    expect(signupSrc).toContain("formatCents(expectedBand.monthlyPriceCents)");
    expect(signupSrc).toContain("formatCents(ORG_PER_ATHLETE_CENTS)");
  });

  it("has no hand-typed dollar price in the page", () => {
    // Any literal like "$160" or "$4.00" in the signup copy is a price that can drift.
    const literals = signupSrc.match(/\$\d[\d,]*(\.\d\d)?\b/g) ?? [];
    expect(literals).toEqual([]);
  });
});

describe("the UI copy and the pricing table cannot disagree", () => {
  it("puts the checkpoints in the bands the copy quotes", () => {
    expect(bandForAthleteCount(5).id).toBe("0-5");
    expect(bandForAthleteCount(34).id).toBe("21-40");
    expect(bandForAthleteCount(120).id).toBe("101-120");
  });

  it("prices every checkpoint at the band ceiling times $4.00", () => {
    expect(bandForAthleteCount(5).monthlyPriceCents).toBe(5 * 400);
    expect(bandForAthleteCount(34).monthlyPriceCents).toBe(40 * 400);
    expect(bandForAthleteCount(120).monthlyPriceCents).toBe(120 * 400);
  });

  it("labels a band as a range of athletes, which is what the signup copy renders", () => {
    expect(bandForAthleteCount(34).label).toBe("21-40 athletes");
  });
});
