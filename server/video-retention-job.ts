import { storage } from "./storage";
import { notifyUser } from "./notify";

// Daily sweep of form-check AND skill-drill videos -- applies to every
// athlete (coached or Free Agent alike, see shared/video-retention.ts's own
// comment), curated automatically since nobody else prunes a coached
// athlete's video history either. Caps each (athlete, exercise) pair AND
// each (athlete, skill exercise) pair independently at that athlete's own
// getVideoRetentionLimits().totalCap most recent unfavorited videos --
// one shared cap/add-on resolution, applied per track; anything older gets
// a 7-day grace window (a push/email/in-app notice linking back, so there's
// a real chance to hit the heart before it's gone) before the file is
// actually deleted. Favorited videos are never touched, at any count -- see
// storage.sweepVideoRetentionCap's own comment for the exact mechanics, and
// shared/schema.ts's workoutSetEntries.videoFavorited / skillSessionLogs.
// videoFavorited for why each is a separate field from its track's own
// coach-facing flag.
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
          `You've got more saved for this ${w.source === "skill" ? "drill" : "exercise"} than your plan keeps -- tap the heart on this one within 7 days to keep it, or it'll be automatically removed to save space.`,
          w.link,
        );
        await storage.markVideoPendingDeletion(w.source, w.id);
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

// Distinct from the cap sweep above: this purges every video for an
// ATHLETE ACCOUNT that's shown no sign of life (no login, no logged
// workout, no skill session) in 12 months, regardless of that athlete's
// own retention cap -- someone who stopped using Forge entirely, whose
// clips would otherwise sit on disk forever. Same warn-then-7-day-grace
// safety pattern as the cap sweep, and for the same reason: a genuinely
// active account that got flagged in error self-corrects on its next real
// login, well before the grace window elapses. See
// storage.sweepStaleAccountVideos's own comment for the exact mechanics.
export async function runStaleAccountVideoSweep() {
  try {
    const { warned, purged } = await storage.sweepStaleAccountVideos();
    let notified = 0;
    for (const w of warned) {
      // Same independent-per-item reasoning as the cap sweep above -- one
      // failed notify shouldn't stop the rest, and the grace clock only
      // starts once notifyUser actually succeeds for this one.
      try {
        await notifyUser(
          w.athleteId,
          "stale_account_video_warning",
          `A ${w.itemName} video is about to be removed`,
          `Your account hasn't been active in a while, so your saved videos are being cleared out to free up space -- log in within 7 days if you'd like to keep this one, or it'll be automatically removed.`,
          w.link,
        );
        await storage.markStaleAccountVideoPendingDeletion(w.source, w.id);
        notified++;
      } catch (err) {
        console.error(`Stale-account video sweep: failed to notify athlete ${w.athleteId} about ${w.source} ${w.id}:`, err);
      }
    }
    if (notified > 0 || purged > 0) {
      console.log(`Stale-account video sweep: warned ${notified}, purged ${purged}.`);
    }
  } catch (err) {
    console.error("Stale-account video sweep failed:", err);
  }
}

// Same boot-delay-then-daily-interval shape as data-retention-job.ts's
// startDataRetentionJob -- data has to exist and this shouldn't block
// startup.
export function startVideoRetentionJob() {
  setTimeout(() => {
    runVideoRetentionSweep();
    runStaleAccountVideoSweep();
  }, 120_000);
  setInterval(
    () => {
      runVideoRetentionSweep();
      runStaleAccountVideoSweep();
    },
    24 * 60 * 60 * 1000,
  );
}
