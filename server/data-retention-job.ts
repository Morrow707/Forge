import { storage } from "./storage";
import { scheduleDailyJob } from "./job-lock";

// Daily sweep that purges raw video for Tier 1/2 minor athletes once it's
// past that tier's configured retention window (shared/privacy-tiers.ts) --
// see that file's own comment for why those windows are placeholders
// pending legal review, not settled law. Deletes only the video file and
// nulls the URL column via the exact same deleteAdminVideo path the admin
// video-management page already uses; every numeric metric derived from
// that video (velocity, ROM, form faults, etc.) is a separate column and is
// never touched here.
export async function runDataRetentionJob() {
  try {
    const eligible = await storage.getVideosEligibleForRetentionPurge();
    // Logged even at zero -- this job deletes minor athletes' video data on
    // a compliance-driven schedule, so a run that silently no-ops looks
    // identical to one that never started (a crashed boot, a bad deploy)
    // without some periodic evidence it actually executed.
    if (eligible.length === 0) {
      console.log("Data retention job: no eligible videos.");
      return;
    }
    let purged = 0;
    for (const row of eligible) {
      // Each row is independent -- one failed delete (a bad file path, a
      // transient DB error) shouldn't abort the rest of this run and leave
      // every other eligible minor's video unpurged until tomorrow. Same
      // per-item isolation as the video-cap and reflection jobs' notify loops.
      try {
        // deleteAdminVideo always resolves to a (truthy) object, never
        // rejects on its own -- checking the object itself instead of its
        // .deleted field meant this counted every eligible row as purged
        // regardless of whether the delete actually found and removed
        // anything.
        const result = await storage.deleteAdminVideo(row.source, row.id);
        if (result.deleted) purged += 1;
      } catch (err) {
        console.error(`Data retention job: failed to purge ${row.source} video ${row.id}:`, err);
      }
    }
    console.log(`Data retention job: purged ${purged}/${eligible.length} eligible video(s).`);
  } catch (err) {
    console.error("Data retention job failed:", err);
  }
}

// Scheduled on a fixed wall-clock hour under an advisory lock (see
// job-lock.ts). This job permanently deletes minor athletes' raw video, so
// it must not run once per deploy (which the old boot-delay timer made it
// do) and must not run on two instances at once.
export function startDataRetentionJob() {
  scheduleDailyJob("data-retention", 8, runDataRetentionJob);
}
