/**
 * "FULL PERSONALIZATION IS NOW INCLUDED IN YOUR PLAN." Added 2026-11-18.
 *
 * Scott: "if a coach does hit 50 athletes, how do they know it's unlocked? Is there a pop? Is
 * there an email? What?" There was nothing. The band moves when the roster grows (the re-bill at
 * a join), when Stripe confirms a payment, or when an admin sets it -- and the Branding page simply
 * stopped drawing its locks, for a coach who had no reason to open it.
 *
 * Told both ways, because both are about money: a program that moves up gets a bell notification
 * and an email; a program that moves back below the line is told its own look is paused (nothing
 * deleted). And a program PAYING for the add-on when the band starts including it is told it can
 * cancel the add-on, which is the half that matters most -- otherwise it pays $24.99 a month for
 * something it already has.
 *
 * Fire-and-forget, like the plan-ended email: a mail problem must never fail a webhook or a join.
 * No link and no website named in the email (see trial-ending-job.ts for why); the in-app
 * notification links to the Branding page, inside the app.
 */
import { BILLING_TIERS, FULL_PERSONALIZATION_INCLUDED_AT_ATHLETES, type BillingTierId } from "@shared/billing-tiers";
import { activeAddOns, type AddOnTerms } from "@shared/add-on-terms";
import { sendEmail } from "./email";
import { emailShell } from "./email-shell";
import { notifyUser } from "./notify";
import { storage } from "./storage";

export function bandIncludesPersonalization(tier: string | null | undefined): boolean {
  return Boolean(tier && BILLING_TIERS[tier as BillingTierId]?.includesFullPersonalization);
}

export type PersonalizationChange = "now_included" | "no_longer_included" | null;

export function personalizationChange(before: string | null | undefined, after: string | null | undefined): PersonalizationChange {
  const was = bandIncludesPersonalization(before);
  const is = bandIncludesPersonalization(after);
  if (was === is) return null;
  return is ? "now_included" : "no_longer_included";
}

export function buildPersonalizationNotice(change: Exclude<PersonalizationChange, null>, paysForAddOn: boolean) {
  if (change === "now_included") {
    const title = "Full Personalization is now included in your plan";
    const body =
      `Your program covers ${FULL_PERSONALIZATION_INCLUDED_AT_ATHLETES} athletes or more, so everything on the Branding page is unlocked: ` +
      "a second color, your motto, mission and welcome message, your team address, nav tabs, dashboard cards and your athletes' exercise screen." +
      (paysForAddOn ? " You're also paying for the Full Personalization add-on, which you no longer need. You can cancel it from Billing." : "");
    return { title, body };
  }
  const title = "Full Personalization is no longer included in your plan";
  const body =
    `Your plan now covers fewer than ${FULL_PERSONALIZATION_INCLUDED_AT_ATHLETES} athletes, so your second color, motto, team address, nav changes and exercise-screen colors are paused. ` +
    "Nothing was deleted: they come back as soon as the program has Full Personalization again, from Billing or a larger plan. Your logo, team name and main color stay.";
  return { title, body };
}

export function announcePersonalizationChange(coachUserId: number, before: string | null | undefined, after: string | null | undefined): void {
  const change = personalizationChange(before, after);
  if (!change) return;
  void (async () => {
    try {
      const coach = await storage.getUser(coachUserId);
      // A comped account already has everything, so nothing changed for it.
      if (!coach || coach.role !== "coach" || coach.isBetaAccount) return;
      const paysForAddOn = activeAddOns(coach.billingAddOns, coach.addOnTerms as AddOnTerms | null).includes("full_bundle");
      // Moving down while the add-on is paid for changes nothing the coach can see.
      if (change === "no_longer_included" && paysForAddOn) return;
      const { title, body } = buildPersonalizationNotice(change, paysForAddOn);
      await notifyUser(coach.id, "plan_personalization", title, body, "/coach/branding", { skipEmail: true });
      // First word of the name: splits on runs of whitespace, so "Riley  Smith" -> "Riley";
      // "" gives no word and falls to "there". https://regex101.com/?regex=%5Cs%2B
      const firstName = (coach.name ?? "").trim().split(/\s+/)[0] || "there";
      const p = (text: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;">${text}</p>`;
      await sendEmail({ to: coach.email, subject: title, html: emailShell(title, p(`Hi ${firstName},`) + p(body)) });
    } catch (err) {
      console.error("personalization notice failed:", err);
    }
  })();
}
