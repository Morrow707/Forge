import { storage } from "./storage";
import { notifyUser } from "./notify";

// Daily sweep of form-check videos -- applies to every athlete (coached or
// Free Agent alike, see shared/video-retention.ts's own comment), curated
// automatically since nobody else prunes a coached athlete's video history
// either. Caps each (athlete, exercise) pair at that athlete's own
// getVideoRetentionLimits().totalCap most recent unfavorited videos;
// anything older gets a 7-day grace window (a push/email/in-app notice
// linking straight to that day, so there's a real chance to hit the heart
// before it's gone) before the file is actually deleted. Favorited videos
// are never touched, at any count -- see storage.sweepVideoRetentionCap's
// own comment for the exact mechanics, and shared/schema.ts's
// workoutSetEntries.videoFavorited for why it's a separate field from the
// coach-facing formCheckFlag.
export async function runVideoRetentionSweep() {
  try {
    const { warned, purged } = await storage.sweepVideoRetentionCap();
    let notified = 0;
    for (const w of warned) {
      // Each warning is independent -- one athlete's bad/expired push
      // token shouldn't stop everyone after them in this list from being
      // notified. And the grace clock (markVideoPendingDeletion) only
      // starts once notifyUser actually succeeds for this one, so a
      // failure here just means it's retried on tomorrow's sweep instead
      // of the video silently sliding toward deletion unwarned.
      try {
        await notifyUser(
          w.athleteId,
          "video_cap_warning",
          `A ${w.exerciseName} video is about to be removed`,
          "You've got more saved for this exercise than your plan keeps -- tap the heart on this one within 7 days to keep it, or it'll be automatically removed to save space.",
          w.link,
        );
        await storage.markVideoPendingDeletion(w.id);
        notified++;
      } catch (err) {
        console.error(`Video retention: failed to notify athlete ${w.athleteId} about set ${w.id}:`, err);
      }
    }
    if (notified > 0 || purged > 0) {
      console.log(`Video retention sweep: warned ${notified}, purged ${purged}.`);
    }
  } catch (err) {
    console.error("Video retention sweep failed:", err);
  }
}

// Same boot-delay-then-daily-interval shape as data-retention-job.ts's
// startDataRetentionJob -- data has to exist and this shouldn't block
// startup.
export function startVideoRetentionJob() {
  setTimeout(() => {
    runVideoRetentionSweep();
  }, 120_000);
  setInterval(
    () => {
      runVideoRetentionSweep();
    },
    24 * 60 * 60 * 1000,
  );
}
