/**
 * "FULL PERSONALIZATION IS NOW INCLUDED IN YOUR PLAN." Added 2026-11-18.
 *
 * Scott: "if a coach does hit 50 athletes, how do they know it's unlocked? Is there a pop? Is
 * there an email? What?" There was nothing; the locks on the Branding page simply disappeared.
 *
 * A paying program earns Full Personalization when 50 athletes are on its roster
 * (personalizationEarnedByRoster). The answer is kept on the primary coach's row
 * (users.fullPersonalizationEarned), and every roster or plan change calls syncPersonalizationNotice,
 * which tells the coach once when the answer flips: a bell notification and an email. Moving up
 * tells a coach who pays for the add-on that they can cancel it; moving down says the extra look is
 * paused and nothing was deleted. The first check of an account records its answer and sends
 * nothing, so a deploy does not announce anything to programs already over the line.
 *
 * Fire-and-forget: a mail problem must never fail a join, a webhook or a removal. No link and no
 * website named in the email (see trial-ending-job.ts for why); the bell notification opens the
 * Branding page inside the app.
 */
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { FULL_PERSONALIZATION_INCLUDED_AT_ATHLETES } from "@shared/billing-tiers";
import { activeAddOns, type AddOnTerms } from "@shared/add-on-terms";
import { personalizationEarnedByRoster } from "./billing";
import { sendEmail } from "./email";
import { emailShell } from "./email-shell";
import { notifyUser } from "./notify";
import { storage } from "./storage";

export type PersonalizationChange = "now_included" | "no_longer_included";

export function buildPersonalizationNotice(change: PersonalizationChange, paysForAddOn: boolean) {
  if (change === "now_included") {
    const title = "Full Personalization is now included in your plan";
    const body =
      `Your program has ${FULL_PERSONALIZATION_INCLUDED_AT_ATHLETES} athletes, so everything on the Branding page is unlocked: ` +
      "a second color, your motto, mission and welcome message, your team address, nav tabs, dashboard cards and your athletes' exercise screen." +
      (paysForAddOn ? " You're also paying for the Full Personalization add-on, which you no longer need. You can cancel it from Billing." : "");
    return { title, body };
  }
  const title = "Full Personalization is no longer included in your plan";
  const body =
    `Your roster is under ${FULL_PERSONALIZATION_INCLUDED_AT_ATHLETES} athletes, so your second color, motto, team address, nav changes and exercise-screen colors are paused. ` +
    "Nothing was deleted: they come back as soon as the program has Full Personalization again. Your logo, team name and main color stay.";
  return { title, body };
}

/** Awaitable for tests; every production caller fires and forgets it. */
export async function checkPersonalizationNotice(coachUserId: number): Promise<PersonalizationChange | null> {
  const primaryId = await storage.getPrimaryCoachId(coachUserId);
  const coach = await storage.getUser(primaryId);
  if (!coach || coach.role !== "coach") return null;
  const earned = personalizationEarnedByRoster(coach, await storage.getRosterSeatCountForCoach(primaryId));
  const before = coach.fullPersonalizationEarned;
  if (before === earned) return null;
  // Loaded here, not at the top: billing.ts imports this module, and its unit tests mock storage
  // with no database behind them.
  const { db } = await import("./db");
  await db.update(users).set({ fullPersonalizationEarned: earned }).where(eq(users.id, primaryId));
  // First check: record the answer, announce nothing.
  if (before === null || before === undefined) return null;
  // A comped account already has everything, so nothing it can see changed.
  if (coach.isBetaAccount) return null;
  const change: PersonalizationChange = earned ? "now_included" : "no_longer_included";
  const paysForAddOn = activeAddOns(coach.billingAddOns, coach.addOnTerms as AddOnTerms | null).includes("full_bundle");
  // Moving down while the add-on is paid for changes nothing the coach can see.
  if (change === "no_longer_included" && paysForAddOn) return change;
  const { title, body } = buildPersonalizationNotice(change, paysForAddOn);
  await notifyUser(coach.id, "plan_personalization", title, body, "/coach/branding", { skipEmail: true });
  // First word of the name: splits on runs of whitespace, so "Riley  Smith" -> "Riley";
  // "" gives no word and falls to "there". https://regex101.com/?regex=%5Cs%2B
  const firstName = (coach.name ?? "").trim().split(/\s+/)[0] || "there";
  const p = (text: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;">${text}</p>`;
  await sendEmail({ to: coach.email, subject: title, html: emailShell(title, p(`Hi ${firstName},`) + p(body)) });
  return change;
}

export function syncPersonalizationNotice(coachUserId: number): void {
  void checkPersonalizationNotice(coachUserId).catch((err) => {
    console.error("personalization notice failed:", err);
  });
}
