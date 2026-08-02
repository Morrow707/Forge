import { TESTING_METRICS } from "@shared/testing-metrics";

type RosterAthlete = {
  name: string;
  sport?: string | null;
  position?: string | null;
} & Record<(typeof TESTING_METRICS)[number]["key"], number | null | undefined>;

type ProgressSummary = {
  totalWorkoutsCompleted: number;
  workoutsThisMonth: number;
  recentPRs: { exerciseName: string; weight: number; unit: string; reps: string; date: string }[];
  currentLifts: { exerciseName: string; weight: string; unit: string; reps: string; date: string }[];
};

type Streak = { currentStreak: number; totalCompleted: number };

/** Plain-HTML email body -- no external CSS/images, so it renders consistently
 * across mail clients. Built from data the coach already sees in-app; this is
 * just packaging it for a one-tap send rather than a new data source. */
export function buildProgressReportEmail(
  athlete: RosterAthlete,
  coachName: string,
  summary: ProgressSummary,
  streak: Streak,
) {
  const testingRows = TESTING_METRICS.filter((m) => athlete[m.key] != null)
    .map((m) => `<tr><td style="padding:4px 12px 4px 0;color:#555;">${m.label}</td><td style="padding:4px 0;font-weight:600;">${athlete[m.key]} ${m.unit}</td></tr>`)
    .join("");

  const prRows = summary.recentPRs
    .slice(0, 5)
    .map(
      (pr) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#555;">${pr.exerciseName}</td><td style="padding:4px 0;font-weight:600;">${pr.weight} ${pr.unit} x ${pr.reps}</td></tr>`,
    )
    .join("");

  const liftRows = summary.currentLifts
    .slice(0, 10)
    .map(
      (l) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#555;">${l.exerciseName}</td><td style="padding:4px 0;">${l.weight} ${l.unit} x ${l.reps}</td></tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">Your Progress Report</h1>
        <p style="color:#555;margin:0 0 20px;">From ${coachName}${athlete.sport ? ` &middot; ${athlete.sport}` : ""}${athlete.position ? ` &middot; ${athlete.position}` : ""}</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:12px;background:#f5f5f5;border-radius:6px;text-align:center;width:33%;">
              <div style="font-size:22px;font-weight:bold;">${streak.currentStreak}</div>
              <div style="font-size:11px;color:#777;text-transform:uppercase;">Current Streak</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:12px;background:#f5f5f5;border-radius:6px;text-align:center;width:33%;">
              <div style="font-size:22px;font-weight:bold;">${summary.workoutsThisMonth}</div>
              <div style="font-size:11px;color:#777;text-transform:uppercase;">This Month</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:12px;background:#f5f5f5;border-radius:6px;text-align:center;width:33%;">
              <div style="font-size:22px;font-weight:bold;">${summary.totalWorkoutsCompleted}</div>
              <div style="font-size:11px;color:#777;text-transform:uppercase;">All-Time</div>
            </td>
          </tr>
        </table>

        ${
          prRows
            ? `<h2 style="font-size:14px;text-transform:uppercase;color:#F65B23;margin:20px 0 8px;">Recent PRs</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">${prRows}</table>`
            : ""
        }

        ${
          liftRows
            ? `<h2 style="font-size:14px;text-transform:uppercase;color:#F65B23;margin:20px 0 8px;">Current Lifts</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">${liftRows}</table>`
            : ""
        }

        ${
          testingRows
            ? `<h2 style="font-size:14px;text-transform:uppercase;color:#F65B23;margin:20px 0 8px;">Testing / Combine</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">${testingRows}</table>`
            : ""
        }

        <p style="color:#999;font-size:12px;margin-top:24px;">Sent by your coach via Forge.</p>
      </div>
    </div>
  `;
}
