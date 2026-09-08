import { scheduleDailyJob } from "./job-lock";
import { reportJobFailure } from "./job-errors";
import { rebuildCohortNorms } from "./cohort-norms";

// Nightly rebuild of the population norms.
//
// This is the mechanism, not a safety net -- unlike the research mirror,
// nothing updates these when an athlete's data changes, and nothing should.
// The whole design is that the reference drifts with the population on its
// own: a fifteen year old becomes sixteen, their numbers move to the next
// band, and no code anywhere had to notice.
//
// Runs at 06:00 UTC, before the research mirror at 07:00 and the retention
// sweep at 08:00, so a coach opening the app in the morning is comparing
// against figures computed the same night.
export async function runCohortNormsJob(): Promise<Record<string, number>> {
  try {
    const { cohorts, norms } = await rebuildCohortNorms();
    // Logged even at zero. A new platform legitimately has no cohort large
    // enough to produce a norm, and that is worth being able to see rather
    // than mistaking for a job that never ran.
    console.log(`Cohort norms job: ${norms} norm(s) across ${cohorts} cohort(s).`);
    return { cohorts, norms };
  } catch (err) {
    reportJobFailure("cohort-norms", err);
    return { cohorts: 0, norms: 0 };
  }
}

export function startCohortNormsJob() {
  scheduleDailyJob("cohort-norms", 6, runCohortNormsJob);
}
