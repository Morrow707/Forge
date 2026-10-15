import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { autoregulateLoad, AUTOREGULATION_FACTORS } from "./autoregulation";

/* AUTOREGULATION IS FOR A FREE AGENT'S OWN TRAINING, AND NOBODY ELSE'S (2026-10-15).
 *
 * Scott: "lets have it auto regulate for the free agent classes, not the athletes as they are
 * controlled by the coach." The rule itself is pure and lives in shared/autoregulation.ts; the
 * gate lives in storage.getWorkoutDayDetail and is scanned here, because the gate is the part
 * that would be wrong to lose -- a coached athlete's numbers are the coach's.
 */
const green = { score: 85, level: "green" as const };
const yellow = { score: 55, level: "yellow" as const };
const red = { score: 30, level: "red" as const };

describe("the three readiness bands", () => {
  it("no check-in today means no suggestion, never a guessed one", () => {
    expect(autoregulateLoad({ readiness: null, lastRpe: 6, lastWeight: 200 })).toBeNull();
  });

  it("red takes 10% off and keeps the reps", () => {
    const out = autoregulateLoad({ readiness: red, lastRpe: 7, lastWeight: 200 });
    expect(out?.rule).toBe("red");
    expect(out?.factor).toBe(AUTOREGULATION_FACTORS.red);
    expect(out?.suggestedWeight).toBe(180);
    expect(out?.text).toContain("keep the reps");
  });

  it("yellow takes 5% off", () => {
    const out = autoregulateLoad({ readiness: yellow, lastRpe: 7, lastWeight: 200 });
    expect(out?.rule).toBe("yellow");
    expect(out?.suggestedWeight).toBe(190);
  });

  it("green and an easy last session adds 2.5%, rounded to a plate", () => {
    const out = autoregulateLoad({ readiness: green, lastRpe: 6, lastWeight: 200 });
    expect(out?.rule).toBe("green_easy");
    expect(out?.suggestedWeight).toBe(205);
  });

  it("green and a hard last session repeats it", () => {
    const out = autoregulateLoad({ readiness: green, lastRpe: 9, lastWeight: 200 });
    expect(out?.rule).toBe("green_hard");
    expect(out?.factor).toBe(1);
    expect(out?.suggestedWeight).toBe(200);
  });

  it("green after a 10 still backs off: a 10 is not a working weight", () => {
    const out = autoregulateLoad({ readiness: green, lastRpe: 10, lastWeight: 200 });
    expect(out?.rule).toBe("green_maxed");
    expect(out?.suggestedWeight).toBe(190);
  });

  it("green with no RPE on file asks for one and fills nothing", () => {
    const out = autoregulateLoad({ readiness: green, lastRpe: null, lastWeight: 200 });
    expect(out?.rule).toBe("green_no_rpe");
    expect(out?.suggestedWeight).toBeNull();
  });

  it("a bodyweight, band or box lift gets the sentence and nothing to fill", () => {
    const out = autoregulateLoad({ readiness: red, lastRpe: 8, lastWeight: null });
    expect(out?.suggestedWeight).toBeNull();
    expect(out?.text).not.toContain(" to ");
  });

  it("never adds more than 2.5% and never removes more than 10%", () => {
    for (const readiness of [green, yellow, red]) {
      for (const lastRpe of [null, 5, 6, 7, 8, 9, 10]) {
        const out = autoregulateLoad({ readiness, lastRpe, lastWeight: 100 });
        expect(out!.factor).toBeLessThanOrEqual(1.025);
        expect(out!.factor).toBeGreaterThanOrEqual(0.9);
      }
    }
  });
});

describe("the gate: a coached athlete's day carries no autoregulation", () => {
  const storage = readFileSync(join(import.meta.dirname, "..", "server/storage.ts"), "utf8");
  const fn = storage.slice(storage.indexOf("async getWorkoutDayDetail("));
  const body = fn.slice(0, fn.indexOf("\n  },\n"));

  it("asks whether the athlete has a coach before reading today's check-in", () => {
    const coachAt = body.indexOf("getCoachesForAthlete(athleteId)");
    expect(coachAt).toBeGreaterThan(-1);
    expect(body).toMatch(/const autoregulates = [^;]*\.length === 0/);
    // The check-in is read only for a Free Agent; a coached athlete's day does not even look.
    expect(body).toMatch(/autoregulates\s*\?\s*await this\.getWellnessCheckin\(athleteId, date\)/);
  });

  it("attaches the suggestion per exercise off the lift's own last performance", () => {
    expect(body).toContain("autoregulation: autoregulates && todayReadiness");
    expect(body).toContain("lastRpe: lastPerformance?.rpe ?? null");
  });

  it("the sentence is a suggestion the athlete taps, never a rewrite of the prescription", () => {
    // The prescribed sets/reps/weight on the day are untouched by this feature: the only
    // writes to those keys in the map are the regression's, which was already there.
    const map = body.slice(body.indexOf("const exercisesWithHistory = day.exercises.map("));
    const mapBody = map.slice(0, map.indexOf("\n    });"));
    expect(mapBody).not.toMatch(/weight:\s*autoreg/);
    expect(mapBody).not.toMatch(/sets:\s*autoreg/);
    expect(mapBody).not.toMatch(/reps:\s*autoreg/);
  });
});
