/**
 * "YOUR TRIAL ENDS IN A FEW DAYS." Added 2026-11-13.
 *
 * Scott, the day the plan wall shipped: "a hey your account is going to run out in a few days
 * you need to upgrade." From that day a Free Agent with no plan cannot log once the 14-day trial
 * ends, and a coach with no plan loses the camera, skill recording and the AI tools (see
 * server/free-agent-plan.ts and coachPlanIsActive). A wall nobody was told about reads as a
 * broken app, so each account is written to once, a few days ahead.
 *
 * WHO IS WRITTEN TO: an account on a trialing subscriptions row that ends within the window and
 * that would actually meet a wall when it does. Nobody who already holds a plan, nobody comped,
 * no athlete on a roster (their plan is the program's), no assistant coach (the plan is the head
 * coach's).
 *
 * ONCE PER END DATE, not once per account. `trial_ending_notified_for` records the END DATE the
 * note was about, so a promo code that moves the trial out a month earns one more note ahead of
 * the new date, and a redeploy inside the window sends nothing twice.
 *
 * THE EMAIL NAMES NO WEBSITE AND CARRIES NO LINK, on purpose. Scott: "we can't advertise that
 * forge is online or else apple will get mad." It says what ends, when, and what to do, and
 * leaves where to the reader.
 */
import { and, eq, gt, isNotNull, lte } from "drizzle-orm";
import { db } from "./db";
import { subscriptions, users } from "@shared/schema";
import { ALL_FREE_AGENT_TIER_IDS } from "@shared/free-agent-tiers";
import { coachPlanIsPaidFor, ENFORCEMENT_ENABLED } from "./billing";
import { sendEmail } from "./email";
import { emailShell } from "./email-shell";
import { storage } from "./storage";
import { scheduleDailyJob, runWithJobLock } from "./job-lock";
import { reportJobFailure } from "./job-errors";

export const TRIAL_ENDING_JOB = "trial-ending-notice";
export const TRIAL_ENDING_NOTICE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function endDateInWords(endsAt: Date): string {
  return endsAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

export function buildTrialEndingEmail(role: "athlete" | "coach", firstName: string, endsAt: Date) {
  const when = endDateInWords(endsAt);
  const p = (text: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;">${text}</p>`;
  if (role === "coach") {
    return {
      subject: "Your Forge trial ends in a few days",
      html: emailShell(
        "Your Forge trial ends in a few days",
        p(`Hi ${firstName},`) +
          p(`Your free trial ends on ${when}. To keep filming, skill sessions and the AI tools on for you and your athletes, your program needs a plan before then.`) +
          p("Your roster, your programs and everything already recorded stay exactly as they are."),
      ),
    };
  }
  return {
    subject: "Your Forge trial ends in a few days",
    html: emailShell(
      "Your Forge trial ends in a few days",
      p(`Hi ${firstName},`) +
        p(`Your free trial ends on ${when}. To keep training in Forge, pick a plan before then.`) +
        p("Everything you have logged stays on your account either way."),
    ),
  };
}

/** Would this account meet a wall the day its trial ends? Mirrors the two rules it warns about. */
async function trialEndWillWall(user: typeof users.$inferSelect): Promise<boolean> {
  if (user.isBetaAccount) return false;
  if (user.role === "athlete") {
    if (user.freeAgentTier && (ALL_FREE_AGENT_TIER_IDS as string[]).includes(user.freeAgentTier)) return false;
    return (await storage.getCoachSeatsForAthlete(user.id)).length === 0;
  }
  if (user.role === "coach") {
    const primaryId = (await storage.getEffectiveCoachIds(user.id))[0];
    if (primaryId !== user.id) return false;
    return !coachPlanIsPaidFor(user);
  }
  return false;
}

export async function runTrialEndingNotices(now: Date = new Date()): Promise<{ sent: number; considered: number }> {
  if (!ENFORCEMENT_ENABLED) return { sent: 0, considered: 0 };
  const windowEnd = new Date(now.getTime() + TRIAL_ENDING_NOTICE_DAYS * DAY_MS);
  const rows = await db
    .select({ sub: subscriptions, user: users })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .where(
      and(
        eq(subscriptions.status, "trialing"),
        isNotNull(subscriptions.trialEndsAt),
        gt(subscriptions.trialEndsAt, now),
        lte(subscriptions.trialEndsAt, windowEnd),
      ),
    );
  let sent = 0;
  for (const { sub, user } of rows) {
    const endsAt = sub.trialEndsAt!;
    if (sub.trialEndingNotifiedFor && sub.trialEndingNotifiedFor.getTime() === endsAt.getTime()) continue;
    if (user.role !== "athlete" && user.role !== "coach") continue;
    if (!(await trialEndWillWall(user))) continue;
    const firstName = (user.name ?? "").trim().split(/\s+/)[0] || "there";
    const email = buildTrialEndingEmail(user.role, firstName, endsAt);
    const result = await sendEmail({ to: user.email, subject: email.subject, html: email.html });
    // Marked only when it really went: a mail outage inside the window retries tomorrow.
    if (result.sent) {
      await db.update(subscriptions).set({ trialEndingNotifiedFor: endsAt }).where(eq(subscriptions.id, sub.id));
      sent += 1;
    }
  }
  return { sent, considered: rows.length };
}

export function startTrialEndingJob(): void {
  const run = async () => {
    try {
      const result = await runTrialEndingNotices();
      if (result.sent > 0) console.log(`Trial-ending notices: sent ${result.sent} of ${result.considered} trials ending soon.`);
      return result;
    } catch (err) {
      reportJobFailure(TRIAL_ENDING_JOB, err);
      return { sent: 0, considered: 0 };
    }
  };
  void runWithJobLock(TRIAL_ENDING_JOB, run);
  // 17:00 UTC: mid-morning across the US, outside the hours the other daily jobs use.
  scheduleDailyJob(TRIAL_ENDING_JOB, 17, run);
}
