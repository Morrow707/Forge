import { storage } from "./storage";
import { notifyUser } from "./notify";
import { scheduleDailyJob } from "./job-lock";
import { reportJobFailure } from "./job-errors";

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
export async function runVideoRetentionSweep(): Promise<Record<string, number>> {
  try {
    const { warned, purged } = await storage.sweepVideoRetentionCap();
    // ONE MESSAGE PER ATHLETE PER SWEEP, NOT ONE PER VIDEO (2026-11-17, the cost audit at 10,000
    // athletes). An athlete past the cap on a lift gets a warning for every clip over it, so a
    // morning's filming used to arrive as a stack of near-identical emails -- most of Forge's
    // projected email volume, and an inbox nobody reads by the fourth one. The videos still each
    // get their own grace clock; only the telling is grouped.
    const byAthlete = new Map<number, typeof warned>();
    for (const w of warned) byAthlete.set(w.athleteId, [...(byAthlete.get(w.athleteId) ?? []), w]);
    let notified = 0;
    for (const [athleteId, videos] of Array.from(byAthlete)) {
      // Each warning is independent -- one athlete's bad/expired push
      // token shouldn't stop everyone after them in this list from being
      // notified. And the grace clock (markVideoPendingDeletion) only
      // starts once notifyUser actually succeeds for this one, so a
      // failure here just means it's retried on tomorrow's sweep instead
      // of the video silently sliding toward deletion unwarned.
      try {
        const first = videos[0];
        const names = Array.from(new Set(videos.map((v) => v.exerciseName)));
        const nameList = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
        const { delivered, attempted } = await notifyUser(
          athleteId,
          "video_cap_warning",
          videos.length === 1 ? `A ${first.exerciseName} video is about to be removed` : `${videos.length} videos are about to be removed`,
          videos.length === 1
            ? `You've got more saved for this ${first.source === "skill" ? "drill" : "exercise"} than your plan keeps -- tap the heart on this one within 7 days to keep it, or it'll be automatically removed to save space.`
            : `You've got more saved than your plan keeps for ${nameList}. Tap the heart on any you want to keep within 7 days, or they'll be automatically removed to save space.`,
          first.link,
        );
        // The clock starts on delivery, not on the call returning. This
        // used to start it either way: notifyUser could not fail, so a
        // warning that reached no device and no inbox began a seven-day
        // countdown to deleting a video whose owner was never told. Not
        // starting it means tomorrow's sweep tries again, which is the
        // right outcome for a transient failure and an honest one for a
        // permanent failure.
        // Only hold the clock when a channel was actually tried and failed;
        // that is worth retrying tomorrow. When none was even available --
        // no VAPID/APNs keys and no Resend key, or an athlete with no push
        // subscription and email switched off -- retrying can never
        // succeed. Holding for that case disabled the cap sweep outright
        // and, because the in-app row is written before any send is
        // attempted, re-warned the same video every single night forever.
        if (!delivered && attempted) {
          console.warn(`Video retention: every configured channel failed for athlete ${athleteId}; not starting the grace clock for ${videos.length} video(s).`);
          continue;
        }
        if (!delivered) {
          console.warn(`Video retention: no delivery channel available for athlete ${athleteId}; the in-app notification is the only warning for ${videos.length} video(s).`);
        }
        for (const w of videos) {
          await storage.markVideoPendingDeletion(w.source, w.id);
          notified++;
        }
      } catch (err) {
        console.error(`Video retention: failed to notify athlete ${athleteId} about ${videos.length} video(s):`, err);
      }
    }
    if (notified > 0 || purged > 0) {
      console.log(`Video retention sweep: warned ${notified}, purged ${purged}.`);
    }
    return { warned: notified, purged };
  } catch (err) {
    reportJobFailure("video-retention-cap-sweep", err);
    return { warned: 0, purged: 0 };
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
export async function runStaleAccountVideoSweep(): Promise<Record<string, number>> {
  try {
    const { warned, purged } = await storage.sweepStaleAccountVideos();
    let notified = 0;
    for (const w of warned) {
      // Same independent-per-item reasoning as the cap sweep above -- one
      // failed notify shouldn't stop the rest, and the grace clock only
      // starts once notifyUser actually succeeds for this one.
      try {
        const { delivered, attempted } = await notifyUser(
          w.athleteId,
          "stale_account_video_warning",
          `A ${w.itemName} video is about to be removed`,
          `Your account hasn't been active in a while, so your saved videos are being cleared out to free up space -- log in within 7 days if you'd like to keep this one, or it'll be automatically removed.`,
          w.link,
        );
        // Same rule as the cap sweep above, and it bites harder here: this
        // job targets accounts nobody has opened in a year, so the in-app
        // notification is the least likely of the three channels to be
        // seen and the only one that always "succeeds".
        // Same rule as the cap sweep above.
        if (!delivered && attempted) {
          console.warn(`Stale-account video sweep: every configured channel failed for athlete ${w.athleteId}; not starting the grace clock for ${w.source} ${w.id}.`);
          continue;
        }
        if (!delivered) {
          console.warn(`Stale-account video sweep: no delivery channel available for athlete ${w.athleteId}; the in-app notification is the only warning for ${w.source} ${w.id}.`);
        }
        await storage.markStaleAccountVideoPendingDeletion(w.source, w.id);
        notified++;
      } catch (err) {
        console.error(`Stale-account video sweep: failed to notify athlete ${w.athleteId} about ${w.source} ${w.id}:`, err);
      }
    }
    if (notified > 0 || purged > 0) {
      console.log(`Stale-account video sweep: warned ${notified}, purged ${purged}.`);
    }
    return { warned: notified, purged };
  } catch (err) {
    reportJobFailure("stale-account-video-sweep", err);
    return { warned: 0, purged: 0 };
  }
}

// Scheduled on a fixed wall-clock hour under an advisory lock (see
// job-lock.ts) rather than the old boot-delay-then-daily-interval shape.
// Both of these sweeps permanently delete athletes' video files, and the
// old shape restarted its timer on every deploy -- so the "daily" purge
// actually ran once per deploy, and two overlapping instances during a
// rolling deploy would each run it. The two sweeps take separate locks so
// a slow cap sweep can't block the stale-account one on another instance,
// and are staggered an hour apart so they don't contend for the same
// connections.
export function startVideoRetentionJob() {
  scheduleDailyJob("video-retention-cap-sweep", 9, runVideoRetentionSweep);
  scheduleDailyJob("stale-account-video-sweep", 10, runStaleAccountVideoSweep);
}
