import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { db } from "./db";
import { subscriptions } from "@shared/schema";
import { storage } from "./storage";
import { bandForAthleteCount } from "@shared/billing-tiers";
import { scheduleDailyJob } from "./job-lock";
import { reportJobFailure } from "./job-errors";

/**
 * NOTHING RE-BILLS A ROSTER THAT GROWS, AND THIS IS THE MEASUREMENT OF HOW MUCH (2026-10-14).
 *
 * Found by the ten-dimension billing sweep and confirmed by grep:
 * `syncCoachSubscriptionBand` has exactly ONE caller -- PUT /api/coach/plan, a page a coach has
 * to choose to visit and re-save a number on. The roster, meanwhile, moves on its own: every
 * athlete who claims a seat or is linked to a coach changes
 * `getRosterSeatCountForCoach`, and so changes `getBilledAthleteCountForCoach`, which is
 * max(planned, roster) and is what the band is supposed to be derived from.
 *
 * So a program that signed up expecting 5 athletes and grew to 50 keeps paying the 0-5 band --
 * $20 a month for $200 of athletes -- indefinitely, until somebody happens to open the plan page.
 * Forge is the one losing money, which is why this is a sweep and not an emergency, and also
 * why it is worth having at all.
 *
 * ** IT REPORTS AND CHANGES NOTHING UNTIL `COACH_BAND_DRIFT_REBILL` IS SET. **
 *
 * That is deliberate and is the shape this repo uses everywhere it has to act on a number it has
 * not yet seen in the wild: ship the measurement first, read it, then arm the correction. The
 * camera pipeline does exactly this -- every new diagnostic lands with `appliedCorrection: false`
 * and a note saying read it on a real take before anything acts on it. The stakes here are the
 * same in kind: an unattended nightly job that prorates charges on real schools' cards, written
 * in one sitting, is how a program gets billed wrongly overnight with nobody watching. So the
 * first nights produce a log line per drifted program and move no money, and the switch that
 * arms it is named here so turning it on is a decision somebody makes rather than a default
 * nobody chose.
 *
 * WHY A SWEEP RATHER THAN A HOOK ON THE JOIN. The roster is written in at least two places
 * (claimRosterSeat, linkAthleteToCoach) and storage.ts cannot import billing.ts, so a hook means
 * billing logic spread across every join path -- and the next join path added would silently
 * miss it. That is the "a correction wired to one path and not its siblings" defect this repo
 * keeps recording. A sweep reads the world as it is and so cannot be bypassed by a route nobody
 * remembered.
 */
export async function runCoachBandDriftSweep(): Promise<Record<string, number>> {
  const rebillArmed = process.env.COACH_BAND_DRIFT_REBILL === "true";
  try {
    // Only accounts with a live Stripe subscription can drift: an unpaid coach has no quantity
    // to be wrong, and an Apple-billed one cannot be re-quantified by this server at all.
    const rows = await db
      .select({ userId: subscriptions.userId, stripeSubscriptionId: subscriptions.stripeSubscriptionId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.accountType, "coach"),
          isNotNull(subscriptions.stripeSubscriptionId),
          inArray(subscriptions.status, ["active", "trialing", "past_due"]),
        ),
      );

    let drifted = 0;
    let rebilled = 0;
    let failed = 0;

    for (const row of rows) {
      const billed = await storage.getBilledAthleteCountForCoach(row.userId);
      const shouldBe = bandForAthleteCount(billed);
      const onFile = (await storage.getUser(row.userId))?.billingTier ?? null;
      if (onFile === shouldBe.id) continue;

      drifted++;
      // The log is the product while the switch is off. It names the program by id -- never an
      // email or a school name, which is the admin anonymity rule in this repo -- plus what it
      // is paying for and what it has.
      console.log(
        `Coach band drift: coach ${row.userId} is on band ${onFile ?? "none"} and bills ${billed} athletes (band ${shouldBe.id}, ${shouldBe.monthlyPriceCents / 100}/mo)` +
          (rebillArmed ? " -- re-billing" : " -- reporting only, COACH_BAND_DRIFT_REBILL is not set"),
      );

      if (!rebillArmed) continue;

      try {
        // syncCoachSubscriptionBand no-ops when the quantity already matches, prorates upward and
        // waits for the next invoice downward. Imported lazily so this module does not pull the
        // Stripe client in on a boot that never runs the sweep.
        const { syncCoachSubscriptionBand } = await import("./billing");
        const result = await syncCoachSubscriptionBand(row.userId, billed);
        if ("synced" in result && result.synced) rebilled++;
        else failed++;
      } catch (err) {
        failed++;
        console.error(`Coach band drift: coach ${row.userId} could not be re-billed:`, err);
      }
    }

    if (drifted) {
      console.log(
        `Coach band drift sweep: ${drifted} program(s) off their band, ${rebilled} re-billed, ${failed} failed` +
          (rebillArmed ? "" : " (reporting only)"),
      );
    }
    return { examined: rows.length, drifted, rebilled, failed };
  } catch (err) {
    reportJobFailure("coach-band-drift-sweep", err);
    return { examined: 0, drifted: 0, rebilled: 0, failed: 0 };
  }
}

// 11:00 UTC, an hour clear of the two video sweeps at 09:00 and 10:00 so they do not contend for
// the same connections -- the reason those two are staggered in the first place.
export function startCoachBandDriftJob() {
  scheduleDailyJob("coach-band-drift-sweep", 11, runCoachBandDriftSweep);
}
