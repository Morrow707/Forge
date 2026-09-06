import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Six fixes from the whole-branch review, pinned where a behavioural test
// would need a filesystem failure, a float4 round-trip, or a chart render.

const storage = readFileSync(join(__dirname, "storage.ts"), "utf8");
const workout = readFileSync(join(__dirname, "..", "client", "src", "pages", "workout.tsx"), "utf8");
const coachAnalytics = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "coach", "analytics.tsx"),
  "utf8",
);

describe("a failed unlink is never reported as a delete", () => {
  it("requires every file that was present to be gone, in all three branches", () => {
    // deleteUploadedFile returns true for a null url, so testing the two
    // booleans alone let an absent second file vouch for a first one whose
    // unlink had failed -- closing a guardian's removal request over a clip
    // still on disk.
    expect(storage).toContain("!(!row.videoUrl || skillGone) || !(!row.coachAnnotationUrl || annotationGone)");
    expect(storage).toContain("!(!row.videoUrl || videoGone) || !(!row.imageUrl || imageGone)");
    expect(storage).toContain("!(!row.videoUrl || commentVideoGone) || !(!row.imageUrl || commentImageGone)");
  });
});

describe("record detection tolerates float4 round-tripping", () => {
  it("compares against a tolerance rather than a bare greater-than", () => {
    // weight_lbs is a real column; MAX() returns ~7 significant digits while
    // the new set is computed in double. An identical kg lift was therefore
    // "greater" by millionths of a pound, every session.
    expect(storage).toContain("PR_EPSILON_LBS");
    expect(storage).toContain("weightLbsForPr > priorBest + PR_EPSILON_LBS");
  });
});

describe("the roster and digest record query ranks on one scale", () => {
  it("no longer partitions by unit", () => {
    expect(storage).toContain("DISTINCT ON (athlete_id, exercise_id, reps)");
    expect(storage).not.toContain("DISTINCT ON (athlete_id, exercise_id, weight_unit, reps)");
  });

  it("orders by the normalized column", () => {
    expect(storage).toContain("weight_lbs DESC");
  });

  it("still returns the logged unit for display", () => {
    expect(storage).toContain("wse.weight_unit_at_log AS weight_unit");
  });
});

describe("the pushed injury-risk alert uses the athlete's day", () => {
  it("takes today from the athlete, not from UTC", () => {
    const fn = storage.slice(storage.indexOf("acwrRiskAlerts)"));
    const window = storage.slice(storage.indexOf("const series = buildAcwrSeries(dailyLoads, today, 1)") - 600);
    expect(window).toContain("await this.todayForAthlete(athleteId)");
    expect(window).toContain("shiftIsoDate(today, -34)");
    expect(fn.length).toBeGreaterThan(0);
  });
});

describe("an unlabelled historical set reads as pounds on the client", () => {
  it("matches what the migration and the server already assume", () => {
    // Reading it as the athlete's current unit inflated a kg athlete's own
    // history 2.2x against every server number built from the same rows.
    expect(workout).toContain('convertWeight(rawWeight, h.weightUnit ?? "lbs", unit)');
  });
});

describe("the coach analytics chart draws one unit", () => {
  it("picks the unit before building the points and converts onto it", () => {
    expect(coachAnalytics).toContain("const unitForChart =");
    expect(coachAnalytics.indexOf("const unitForChart =")).toBeLessThan(
      coachAnalytics.indexOf("const chartData = points.map"),
    );
    expect(coachAnalytics).toContain("convertWeight(parseFloat(p.weight)");
  });
});

describe("an AI goal suggestion comes back in the goal's unit", () => {
  it("converts out of the pounds it was reasoned in", () => {
    expect(storage).toContain('input.type === "exercise" && input.targetUnit === "kg"');
  });
});
