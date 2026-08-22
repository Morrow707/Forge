import { storage } from "./storage";
import { notifyUser } from "./notify";

// Daily sweep of Free Agent form-check videos -- the one account type with
// nobody else (no coach) curating what stays. Caps each (athlete, exercise)
// pair at the 10 most recent unfavorited videos; anything older gets a
// 7-day grace window (a push/email/in-app notice linking straight to that
// day, so there's a real chance to hit the heart before it's gone) before
// the file is actually deleted. Favorited videos are never touched, at any
// count -- see storage.sweepFreeAgentVideoCap's own comment for the exact
// mechanics, and shared/schema.ts's workoutSetEntries.favorited for why
// it's a separate field from the coach-facing formCheckFlag.
export async function runFreeAgentVideoCapSweep() {
  try {
    const { warned, purged } = await storage.sweepFreeAgentVideoCap();
    for (const w of warned) {
      await notifyUser(
        w.athleteId,
        "video_cap_warning",
        `A ${w.exerciseName} video is about to be removed`,
        "You've got more than 10 saved for this exercise -- tap the heart on this one within 7 days to keep it, or it'll be automatically removed to save space.",
        w.link,
      );
    }
    if (warned.length > 0 || purged > 0) {
      console.log(`Free Agent video cap sweep: warned ${warned.length}, purged ${purged}.`);
    }
  } catch (err) {
    console.error("Free Agent video cap sweep failed:", err);
  }
}

// Same boot-delay-then-daily-interval shape as data-retention-job.ts's
// startDataRetentionJob -- data has to exist and this shouldn't block
// startup.
export function startFreeAgentVideoCapJob() {
  setTimeout(() => {
    runFreeAgentVideoCapSweep();
  }, 120_000);
  setInterval(
    () => {
      runFreeAgentVideoCapSweep();
    },
    24 * 60 * 60 * 1000,
  );
}
