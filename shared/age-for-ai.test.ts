import { describe, it, expect } from "vitest";
import { ageFromDateOfBirth, ageLineForAi, derivePrivacyTier } from "./privacy-tiers";

const NOW = new Date("2026-09-06T00:00:00Z");

describe("age from a real birthdate", () => {
  it("counts whole years, not calendar years", () => {
    expect(ageFromDateOfBirth("2008-09-06", NOW)).toBe(18);
    expect(ageFromDateOfBirth("2008-09-07", NOW)).toBe(17); // birthday tomorrow
    expect(ageFromDateOfBirth("2012-09-06", NOW)).toBe(14);
  });

  it("agrees with the tier the rest of the platform uses", () => {
    // These two decide different things -- who is blocked without a guardian,
    // and how a program is written -- and must never disagree about who is a
    // minor.
    for (const dob of ["2008-09-05", "2008-09-06", "2008-09-07", "2012-01-01", "1990-06-15"]) {
      const minorByAge = ageFromDateOfBirth(dob, NOW) < 18;
      const minorByTier = derivePrivacyTier(dob, NOW) !== "tier3_adult_18plus";
      expect(minorByAge, dob).toBe(minorByTier);
    }
  });
});

describe("how an athlete's age is stated to a coaching AI", () => {
  it("names a minor as one rather than leaving it to be inferred", () => {
    // The programming prompt's age rules were gated on "any signal the
    // athlete isn't a physically mature adult". A bare number is a signal the
    // model has to interpret; this does not leave that to chance.
    const line = ageLineForAi("2012-09-06", null, NOW);
    expect(line).toContain("14");
    expect(line).toContain("MINOR");
  });

  it("says nothing extra for an adult", () => {
    expect(ageLineForAi("1996-04-02", null, NOW)).toBe("30");
  });

  it("prefers the birthdate over the self-reported snapshot", () => {
    // users.age is written by a profile edit and goes stale as a season
    // passes; dateOfBirth cannot.
    expect(ageLineForAi("2012-09-06", 25, NOW)).toContain("14");
    expect(ageLineForAi("2012-09-06", 25, NOW)).toContain("MINOR");
  });

  it("falls back to the snapshot only when there is no birthdate", () => {
    // Accounts predating the dateOfBirth column. Marked as self-reported so
    // the model weighs it accordingly.
    const line = ageLineForAi(null, 16, NOW);
    expect(line).toContain("16");
    expect(line).toContain("self-reported");
  });

  it("says not set rather than guessing an adult", () => {
    expect(ageLineForAi(null, null, NOW)).toBe("not set");
  });

  it("treats the day before an 18th birthday as a minor", () => {
    expect(ageLineForAi("2008-09-07", null, NOW)).toContain("MINOR");
    expect(ageLineForAi("2008-09-06", null, NOW)).not.toContain("MINOR");
  });
});
