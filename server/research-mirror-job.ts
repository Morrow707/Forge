import { scheduleDailyJob } from "./job-lock";
import { reportJobFailure } from "./job-errors";
import { syncAllResearchSubjects } from "./research-mirror";

// Nightly reconcile of the research mirror against current consent.
//
// Consent changes already update the mirror the moment they happen, so this
// is not the mechanism -- it is the safety net for the ways a row drifts
// without anyone changing a consent flag: new training data for an athlete
// already in the mirror, a profile edit, an account deleted outright, or a
// write that failed and left the two sides disagreeing.
//
// It runs at 07:00 UTC, an hour before the data retention sweep, so an
// extract taken during the working day is built on a mirror reconciled the
// same morning.
export async function runResearchMirrorJob(): Promise<Record<string, number>> {
  try {
    const { synced, removed } = await syncAllResearchSubjects();
    // Logged even at zero, same reasoning as the data retention job: this
    // one carries a consent commitment, and a run that silently no-ops looks
    // identical to one that never started.
    console.log(`Research mirror job: ${synced} subject(s) synced, ${removed} removed.`);
    return { synced, removed };
  } catch (err) {
    reportJobFailure("research-mirror", err);
    return { synced: 0, removed: 0 };
  }
}

export function startResearchMirrorJob() {
  scheduleDailyJob("research-mirror", 7, runResearchMirrorJob);
}
