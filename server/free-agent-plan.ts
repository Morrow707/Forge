/**
 * DOES THIS FREE AGENT NEED TO PICK A PLAN BEFORE THEY CAN TRAIN.
 *
 * Added 2026-11-13. Scott, on the plan audit's first finding ("Basic unlocks nothing"): "fix 1".
 * Nothing in the app asked whether a Free Agent held ANY plan -- the tier was only ever read for
 * the AI, the camera and skills -- so an account that never paid kept logging, the calendar, the
 * program builder, the exercise library and the nutrition log for good, which is everything
 * Basic ($4.99) sells. His standing decision is "I don't need it free to start" (2026-10-15), so
 * the answer is that training needs a plan once the 14-day sign-up trial ends.
 *
 * One function, asked by the server wall (routes.ts) and by the flag the client redirects on
 * (auth.ts), so the two cannot disagree.
 *
 * WHO IS NEVER ASKED, each for its own reason:
 *  - anybody but an athlete;
 *  - an athlete with ANY roster seat, parked or not. A coached athlete's plan is the program's,
 *    and a parked one keeps logging through the off season -- that is what the hold leaves them
 *    (see "THE OFF-SEASON HOLD" in CLAUDE.md), and they cannot buy a tier as a minor on a team;
 *  - a comped account, an account on its trial, and any account holding a tier, whoever put it
 *    there (a purchase or an admin's grant);
 *  - everybody, while a tier restricts nothing (enforcement off, or the paywall
 *    test switch), so no environment walls people off a plan they have no way to buy.
 *
 * NOTHING IS DELETED OR HIDDEN FOR GOOD. The wall refuses new training writes and the client
 * sends the athlete to the plans screen; every row they logged is still there when they pick one.
 */
import { ALL_FREE_AGENT_TIER_IDS } from "@shared/free-agent-tiers";
import { ENFORCEMENT_ENABLED } from "./billing";
import { storage } from "./storage";

export const FREE_AGENT_PLAN_REQUIRED_MESSAGE =
  "Your free trial has ended. Pick a plan to keep training. Everything you have logged is still here.";

export async function freeAgentPlanRequired(user: { id: number; role: string }): Promise<boolean> {
  if (user.role !== "athlete") return false;
  if (process.env.PAYWALLS_DISABLED === "true") return false;
  if (!ENFORCEMENT_ENABLED) return false;
  const seats = await storage.getCoachSeatsForAthlete(user.id);
  if (seats.length > 0) return false;
  const account = await storage.getFreeAgentBillingAccount(user.id);
  if (account?.isBetaAccount) return false;
  if (account?.freeAgentTier && (ALL_FREE_AGENT_TIER_IDS as string[]).includes(account.freeAgentTier)) {
    return false;
  }
  const sub = await storage.getSubscriptionForUser(user.id);
  const trialing =
    sub?.accountType === "free_agent" &&
    sub.status === "trialing" &&
    sub.trialEndsAt != null &&
    sub.trialEndsAt.getTime() > Date.now();
  return !trialing;
}

/** Writes a walled Free Agent may still make: buying a plan, redeeming a code, joining or
 *  answering a coach, and the account's own consents and settings. Everything else under these
 *  roots that is not a GET is training, and training is what a plan buys. */
export const PLAN_WALL_ROOTS = ["/api/athlete/", "/api/anvil/checks"] as const;
export const PLAN_WALL_ALLOWED_PREFIXES = [
  "/api/athlete/apple-iap",
  "/api/athlete/google-play",
  "/api/athlete/redeem-code",
  "/api/athlete/coach",
  "/api/athlete/tracking-opt-out",
  "/api/athlete/research-consent",
  "/api/athlete/preferences",
  "/api/athlete/profile",
  "/api/athlete/widget-prefs",
] as const;

export function planWallCovers(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (!PLAN_WALL_ROOTS.some((root) => path.startsWith(root))) return false;
  return !PLAN_WALL_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}
