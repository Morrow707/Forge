import { describe, expect, it } from "vitest";
import { buildProgressReportEmail } from "./progress-report";

// This email goes from Forge's own domain to the athlete's coach, and it is
// built from values the athlete typed. The weight column is free text.

const HOSTILE = '100"><img src=x onerror=alert(1)>';

function build(overrides: Partial<Parameters<typeof buildProgressReportEmail>[2]> = {}) {
  return buildProgressReportEmail(
    { id: 1, name: "Sam Athlete" } as any,
    "Coach Taylor",
    {
      totalWorkoutsCompleted: 4,
      workoutsThisMonth: 2,
      recentPRs: [],
      currentLifts: [],
      ...overrides,
    } as any,
    { currentStreak: 3 } as any,
  );
}

describe("progress report escapes what the athlete typed", () => {
  it("escapes a hostile weight rather than emitting it as markup", () => {
    const html = build({
      currentLifts: [
        { exerciseName: "Back Squat", weight: HOSTILE, unit: "lbs", reps: "5", date: "2026-09-01" },
      ],
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("escapes a hostile exercise name and rep scheme too", () => {
    const html = build({
      currentLifts: [
        { exerciseName: "<b>Squat</b>", weight: "100", unit: "lbs", reps: "<i>5</i>", date: "2026-09-01" },
      ],
    });
    expect(html).not.toContain("<b>Squat</b>");
    expect(html).not.toContain("<i>5</i>");
  });

  it("escapes the unit, which is typed as a plain string", () => {
    const html = build({
      currentLifts: [
        { exerciseName: "Squat", weight: "100", unit: '<script>x</script>', reps: "5", date: "2026-09-01" },
      ],
    });
    expect(html).not.toContain("<script>");
  });

  it("still renders the real values readably", () => {
    const html = build({
      currentLifts: [
        { exerciseName: "Back Squat", weight: "225", unit: "lbs", reps: "5", date: "2026-09-01" },
      ],
    });
    expect(html).toContain("Back Squat");
    expect(html).toContain("225");
    expect(html).toContain("lbs");
  });

  it("escapes a PR row's unit and reps", () => {
    const html = build({
      recentPRs: [
        { exerciseName: "Bench", weight: 185, unit: "<em>lbs</em>", reps: "<u>3</u>", date: "2026-09-01" },
      ],
    });
    expect(html).not.toContain("<em>lbs</em>");
    expect(html).not.toContain("<u>3</u>");
    expect(html).toContain("185");
  });
});
