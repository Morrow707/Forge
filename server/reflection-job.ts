import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { notifyUser } from "./notify";

// The one background job in the app -- everything else here is request-
// triggered (see the "route layer owns notifyUser" convention throughout
// storage.ts). storage.generateReflectionFindings() does the actual mining
// and its own per-category cooldown gating; this module is just the timer
// and the fan-out to every admin once a genuinely new finding exists.
//
// Tiered like notifyUser's own bypassEmailPref override: a "safety" finding
// (e.g. injuries clustering after a training-load spike) reaches every
// admin's push+email regardless of their notification prefs, the same
// emergency-reach precedent notify.ts already sets for announcements.
// "informational" findings (e.g. a real roster segment with nothing
// established taught for it) land in-app only -- worth surfacing, not worth
// interrupting anyone over.
export async function runReflectionJob() {
  try {
    const findings = await storage.generateReflectionFindings();
    if (findings.length === 0) return;
    const admins = await db.query.users.findMany({ where: eq(users.role, "admin") });
    for (const finding of findings) {
      for (const admin of admins) {
        if (finding.tier === "safety") {
          await notifyUser(admin.id, "reflection_safety", finding.summary, finding.detail, "/admin/forge-ai", {
            bypassEmailPref: true,
          });
        } else {
          await storage.createNotification(
            admin.id,
            "reflection_info",
            finding.summary,
            finding.detail,
            "/admin/forge-ai",
          );
        }
      }
    }
  } catch (err) {
    console.error("Reflection job failed:", err);
  }
}

// Runs once shortly after boot (data has to exist and this shouldn't block
// startup) and then daily -- daily rather than the job's own weekly
// cooldown so a finding lands within a day of first becoming true instead
// of waiting up to a week for the next check.
export function startReflectionJob() {
  setTimeout(() => {
    runReflectionJob();
  }, 60_000);
  setInterval(
    () => {
      runReflectionJob();
    },
    24 * 60 * 60 * 1000,
  );
}
