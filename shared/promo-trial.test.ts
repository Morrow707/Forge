import { describe, it, expect } from "vitest";
import { promoTrialEndFromSignup, promoTrialFor, DEFAULT_PROMO_TRIAL_DAYS } from "./promo-trial";

/* SCOTT'S OWN EXAMPLES (2026-10-15): "if they sign up October 17th they have until November
 * 17th, if they sign up the 23rd they have until November 23rd and so on." The anchor is the
 * signup date, never the day the code is typed, and "the 17th to the 17th" is a calendar month. */
const at = (iso: string) => new Date(iso);

describe("thirty days from the original signup date, read as Scott reads it", () => {
  it("October 17th runs to November 17th", () => {
    expect(promoTrialEndFromSignup(at("2026-10-17T15:30:00.000Z"), 30).toISOString()).toBe(
      "2026-11-17T15:30:00.000Z",
    );
  });

  it("October 23rd runs to November 23rd", () => {
    expect(promoTrialEndFromSignup(at("2026-10-23T09:00:00.000Z"), 30).toISOString()).toBe(
      "2026-11-23T09:00:00.000Z",
    );
  });

  it("the default is thirty, and a signup late on the 17th still has the whole of the 17th", () => {
    expect(DEFAULT_PROMO_TRIAL_DAYS).toBe(30);
    expect(promoTrialEndFromSignup(at("2026-10-17T23:59:00.000Z"), 30).toISOString()).toBe(
      "2026-11-17T23:59:00.000Z",
    );
  });

  it("a month that has no 31st clamps to its last day", () => {
    expect(promoTrialEndFromSignup(at("2027-01-31T12:00:00.000Z"), 30).toISOString()).toBe(
      "2027-02-28T12:00:00.000Z",
    );
    expect(promoTrialEndFromSignup(at("2026-10-31T12:00:00.000Z"), 30).toISOString()).toBe(
      "2026-11-30T12:00:00.000Z",
    );
  });

  it("sixty is two calendar months and crosses the year", () => {
    expect(promoTrialEndFromSignup(at("2026-11-23T09:00:00.000Z"), 60).toISOString()).toBe(
      "2027-01-23T09:00:00.000Z",
    );
  });

  it("a number of days that is not a whole number of thirties is exactly that many days", () => {
    expect(promoTrialEndFromSignup(at("2026-10-17T15:30:00.000Z"), 14).toISOString()).toBe(
      "2026-10-31T15:30:00.000Z",
    );
  });

  it("is anchored to the signup, not to the redemption", () => {
    // Same account, code typed at signup and a week later: same end date.
    const signup = at("2026-10-17T15:30:00.000Z");
    const atSignup = promoTrialFor(signup, 30, signup);
    const aWeekLater = promoTrialFor(signup, 30, at("2026-10-24T15:30:00.000Z"));
    expect(atSignup.ok && aWeekLater.ok).toBe(true);
    expect((atSignup as { trialEndsAt: Date }).trialEndsAt.toISOString()).toBe(
      (aWeekLater as { trialEndsAt: Date }).trialEndsAt.toISOString(),
    );
  });

  it("a code typed after the window closed unlocks nothing, and says why", () => {
    const verdict = promoTrialFor(at("2026-08-01T00:00:00.000Z"), 30, at("2026-10-15T00:00:00.000Z"));
    expect(verdict.ok).toBe(false);
    expect((verdict as { message: string }).message).toContain("30 days from the day you signed up");
  });

  it("the last instant of the window still counts; the instant it ends does not", () => {
    const signup = at("2026-10-17T15:30:00.000Z");
    const end = promoTrialEndFromSignup(signup, 30);
    expect(promoTrialFor(signup, 30, new Date(end.getTime() - 1)).ok).toBe(true);
    expect(promoTrialFor(signup, 30, end).ok).toBe(false);
  });
});
