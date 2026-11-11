import { describe, expect, it } from "vitest";
import { VELOCITY_GOALS, coachFlag, inZonePercent, isValidZone, speedDropShare, weightSuggestion, zoneVerdict } from "./velocity-zones";

/* The rules every velocity-zone surface reads (2026-11-11). Pure, so they are driven directly. */

const LOW = 0.65;
const HIGH = 0.75;
const ZONE = { lowMps: LOW, highMps: HIGH };
const FAST = 0.8;
const SLOW = 0.6;
const IN = 0.7;
const SLOWER = 0.58;
const PAST_ANY_SPEED = 9;
const A_QUARTER = 0.25;
const CLOSE_DIGITS = 5;
const TWO = 2;
const HALF_PERCENT = 50;
const day = (speedMps: number, date: string) => ({ date, load: "275", speedMps });

describe("velocity zones", () => {
  it("tags a set in zone, slow or fast, with both edges counting as in", () => {
    expect(zoneVerdict(SLOW, ZONE)).toBe("slow");
    expect(zoneVerdict(ZONE.lowMps, ZONE)).toBe("in");
    expect(zoneVerdict(ZONE.highMps, ZONE)).toBe("in");
    expect(zoneVerdict(FAST, ZONE)).toBe("fast");
  });

  it("the goal presets run edge to edge with no gap", () => {
    VELOCITY_GOALS.slice(1).forEach((g, i) => expect(g.lowMps).toBe(VELOCITY_GOALS[i].highMps));
    VELOCITY_GOALS.forEach((g) => expect(isValidZone(g)).toBe(true));
  });

  it("refuses a zone that is backwards or past any real speed", () => {
    expect(isValidZone({ lowMps: FAST, highMps: IN })).toBe(false);
    expect(isValidZone({ lowMps: SLOW, highMps: PAST_ANY_SPEED })).toBe(false);
  });

  it("measures a speed drop from the day's first set", () => {
    expect(speedDropShare(FAST, SLOW)).toBeCloseTo(A_QUARTER, CLOSE_DIGITS);
    expect(speedDropShare(null, SLOW)).toBeNull();
  });

  it("suggests weight only when three sessions agree, never on two", () => {
    const fast3 = [day(FAST, "2026-11-04"), day(FAST, "2026-10-28"), day(FAST, "2026-10-21")];
    expect(weightSuggestion(fast3, ZONE)?.kind).toBe("add_weight");
    expect(weightSuggestion(fast3.slice(0, TWO), ZONE)).toBeNull();
    expect(weightSuggestion([day(FAST, "a"), day(IN, "b"), day(FAST, "c")], ZONE)).toBeNull();
    expect(weightSuggestion([day(SLOW, "a"), day(SLOW, "b"), day(SLOW, "c")], ZONE)?.kind).toBe("hold_weight");
  });

  it("the coach's card ranks a drop over a slow week over a fast one, and stays quiet in zone", () => {
    expect(coachFlag([[FAST, IN, SLOWER]], ZONE)?.kind).toBe("drop");
    expect(coachFlag([[SLOW, SLOW, IN]], ZONE)?.kind).toBe("slow");
    expect(coachFlag([[FAST, FAST], [FAST]], ZONE)?.kind).toBe("fast");
    expect(coachFlag([[IN, IN, FAST]], ZONE)).toBeNull();
    expect(coachFlag([], ZONE)).toBeNull();
  });

  it("counts the share of sets in zone", () => {
    expect(inZonePercent([IN, IN, SLOW, FAST], ZONE)).toBe(HALF_PERCENT);
    expect(inZonePercent([], ZONE)).toBeNull();
  });
});
