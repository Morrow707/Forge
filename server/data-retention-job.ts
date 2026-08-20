import { storage } from "./storage";

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
    if (eligible.length === 0) return;
    let purged = 0;
    for (const row of eligible) {
      const ok = await storage.deleteAdminVideo(row.source, row.id);
      if (ok) purged += 1;
    }
    console.log(`Data retention job: purged ${purged}/${eligible.length} eligible video(s).`);
  } catch (err) {
    console.error("Data retention job failed:", err);
  }
}

// Same boot-delay-then-daily-interval shape as reflection-job.ts's
// startReflectionJob -- data has to exist and this shouldn't block startup.
export function startDataRetentionJob() {
  setTimeout(() => {
    runDataRetentionJob();
  }, 90_000);
  setInterval(
    () => {
      runDataRetentionJob();
    },
    24 * 60 * 60 * 1000,
  );
}
