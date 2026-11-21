/**
 * THE TWO EMAILS THE EXEMPT LIST SENDS (2026-11-21).
 *
 * Scott asked for a note to the person when an admin adds them to the exempt list and a heads-up
 * when they are taken off it. Before this the only way they learned either was by opening the
 * app, and a removal made a plan necessary from the next request with no warning at all.
 *
 * No link and no website named, for the reason trial-ending-job.ts gives: the same message may
 * be read by somebody who uses the iPhone app, which may not be pointed at a web checkout.
 *
 * Each send is awaited and reports whether it left, because the admin's screen says "emailed"
 * and that has to be true. Neither ever throws: a mail problem must not undo the list change.
 */
import type { ExemptBillingResult } from "./billing";
import { sendEmail } from "./email";
import { emailShell } from "./email-shell";
import { storage } from "./storage";

const p = (text: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;">${text}</p>`;
const firstNameOf = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "there";
const CENTS_PER_DOLLAR = 100;

export function buildCoveredByForgeEmail(firstName: string, billing: ExemptBillingResult | null) {
  const refunded = (billing?.refunds ?? []).reduce((sum, r) => sum + r.amountCents, 0);
  const lines = [
    p(`Hi ${firstName},`),
    p("Your Forge account is now covered by Forge. Everything is open and you do not need to pick a plan or pay."),
  ];
  if (billing && billing.cancelled.length > 0) {
    lines.push(
      p(
        refunded > 0
          ? `The plan you were paying for by card has been cancelled and your most recent payment of $${(refunded / CENTS_PER_DOLLAR).toFixed(2)} has been refunded. It can take a few days to show on your statement.`
          : "The plan you were paying for by card has been cancelled. You will not be charged again.",
      ),
    );
  }
  if (billing?.appStoreSubscription) {
    lines.push(
      p(
        "You also have a Forge subscription through the App Store. Forge cannot cancel that one for you: cancel it in your iPhone's Settings, under your name, then Subscriptions. A refund for it is requested from Apple.",
      ),
    );
  }
  return {
    subject: "Your Forge account is covered",
    html: emailShell("Your Forge account is covered", lines.join("")),
  };
}

export function buildNoLongerCoveredEmail(firstName: string) {
  return {
    subject: "Your Forge account now needs a plan",
    html: emailShell(
      "Your Forge account now needs a plan",
      p(`Hi ${firstName},`) +
        p("Your Forge account is no longer covered by Forge, so it needs a plan to keep training.") +
        p("Nothing has been removed. Everything you have logged is still there and opens again as soon as a plan is active."),
    ),
  };
}

async function send(accountId: number, build: (firstName: string) => { subject: string; html: string }): Promise<boolean> {
  try {
    const account = await storage.getUser(accountId);
    if (!account?.email) return false;
    const email = build(firstNameOf(account.name));
    const result = await sendEmail({ to: account.email, subject: email.subject, html: email.html });
    return result.sent === true;
  } catch (err) {
    console.error("exempt-list email failed:", err);
    return false;
  }
}

export function notifyAccountCoveredByForge(accountId: number, billing: ExemptBillingResult | null): Promise<boolean> {
  return send(accountId, (firstName) => buildCoveredByForgeEmail(firstName, billing));
}

export function notifyAccountNoLongerCovered(accountId: number): Promise<boolean> {
  return send(accountId, buildNoLongerCoveredEmail);
}
