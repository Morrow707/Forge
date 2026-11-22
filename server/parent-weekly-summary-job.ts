/** THE WEEKLY PARENT SUMMARY, SCHEDULED (2026-11-21). Runs daily under the job lock and sends only
 * on the first three days after a week ends (parent-weekly-summary.ts SEND_WINDOW_DAYS); the send
 * record is what keeps the second and third day's runs from sending again. Rules and wording live in
 * parent-weekly-summary.ts. */
import { scheduleDailyJob } from "./job-lock";
import { reportJobFailure } from "./job-errors";
import { runParentWeeklySummaries } from "./parent-weekly-summary";

export const PARENT_WEEKLY_SUMMARY_JOB = "parent-weekly-summary";
const SUMMARY_HOUR_UTC = 14;

export function startParentWeeklySummaryJob(): void {
  scheduleDailyJob(PARENT_WEEKLY_SUMMARY_JOB, SUMMARY_HOUR_UTC, async () => {
    try {
      const tally = await runParentWeeklySummaries();
      if ((tally.sent ?? 0) > 0) console.log(`Parent weekly summaries: sent ${tally.sent}.`);
      return Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, v ?? 0]));
    } catch (err) {
      reportJobFailure(PARENT_WEEKLY_SUMMARY_JOB, err);
      return { sent: 0 };
    }
  });
}
