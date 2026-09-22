import { hashResetToken } from "./auth-utils";
import type { DeviceApproval } from "@shared/schema";

/** The database-free half of new-device approval. See trusted-devices.ts for the rule and the
 * rows; this file is what a unit test can import without provisioning Postgres. */

export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEVICE_APPROVAL_TTL_MS = 15 * 60 * 1000;

const DEVICE_ID_MIN = 8;
const DEVICE_ID_MAX = 128;

/** A device id the client sent, or null when it sent nothing usable. Bounded so a hostile
 * client cannot hand us a megabyte to hash. */
export function normalizeDeviceId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < DEVICE_ID_MIN || trimmed.length > DEVICE_ID_MAX) return null;
  return trimmed;
}

export function hashDeviceId(deviceId: string): string {
  return hashResetToken(`device:${deviceId}`);
}

export function isDeviceVerificationDisabled(): boolean {
  return process.env.DEVICE_VERIFICATION_DISABLED === "true";
}

/**
 * THE SAME KILL SWITCH, FOR THE AUTHENTICATOR STEP.
 *
 * Set MFA_ENFORCEMENT_DISABLED=true and a login stops asking for the six-digit code. It is an
 * OPERATOR control with the same shape and the same reasoning as the device one above, and it
 * exists for beta: an account is reinstalled off TestFlight several times a day, every install
 * is a fresh device, and the code is demanded on every one of them. Scott, 2026-09-22: "the
 * keys spawn, everything works, disable forge wanting it."
 *
 * TWO PROPERTIES MATTER, AND BOTH ARE WHY THIS IS A SWITCH RATHER THAN A DATA CHANGE.
 *
 * It does not touch a single row. `mfaEnabled`, the secret and the backup codes are left
 * exactly as they are, so turning the variable off again restores every account's second
 * factor with the authenticator that is already paired -- nobody re-enrols and nobody is
 * quietly left unprotected after beta without it being visible right here.
 *
 * And it is deliberately NOT per-account. An exemption for one email is the thing that gets
 * forgotten: it reads as normal code, nothing points at it, and it survives into production
 * protecting nobody's attention. A platform-wide variable is impossible to forget, because
 * the day it is still set is the day every account is running without a second factor.
 *
 * It does not disable the enrolment routes: an account can still set MFA up and confirm it
 * while this is on. Only the DEMAND at login stands down.
 */
export function isMfaEnforcementDisabled(): boolean {
  return process.env.MFA_ENFORCEMENT_DISABLED === "true";
}

/**
 * THE DEMO ACCOUNTS, EXEMPT IN CODE RATHER THAN IN AN ENVIRONMENT VARIABLE.
 *
 * These three are the accounts Apple's reviewers and anyone demonstrating Forge sign in with.
 * Their addresses do not receive mail -- nothing is on the other end of coach@forge.app -- so
 * the new-device email is a door with no key: the sign-in waits for an approval that can never
 * arrive, on every device that is not already trusted.
 *
 * It was meant to be handled by DEVICE_VERIFICATION_EXEMPT_EMAILS, and that was the wrong shape
 * for it. An env var is the right control for a decision an operator makes (an email outage, a
 * particular account) but these three are a FACT ABOUT THE SOFTWARE: the seed creates them, the
 * seed gives them unreachable addresses, and no deployment of Forge has ever wanted them to meet
 * this gate. Leaving that fact in a Render dashboard means it is one unset variable away from
 * locking out App Review, which is exactly what happened (Scott, 2026-09-21: "I can't login for
 * the demo accounts ... I obviously can't get to those emails as they don't exist").
 *
 * This weakens nothing for anybody else. These accounts hold no real athlete's data, their
 * passwords are randomised in production (see demoPassword in seed.ts), and the exemption is by
 * exact address -- a real user cannot land in it by accident. The env var still works and still
 * ADDS to this list, so an operator can exempt something else without a deploy.
 */
export const DEMO_ACCOUNT_EMAILS = [
  "coach@forge.app",
  "athlete@forge.app",
  "freeagent@forge.app",
] as const;

/**
 * A TEMPORARY OPERATOR EXEMPTION, AND IT IS NOT THE SAME THING AS THE LIST ABOVE.
 *
 * The demo accounts are exempt because their addresses do not exist. THIS account's address is
 * real and the email arrives fine -- what fails is the link in it, which landed on a 404 on
 * 2026-09-21 and left the owner of the platform unable to sign in on a new device. Scott:
 * "let's fix that, or just disable this feature for now for the scott.morrow admin I created."
 *
 * Kept separate so the distinction survives: this is a REAL account trading a real protection
 * for access while a bug is outstanding, not a fact about the software. It should be deleted
 * the moment the approval link is confirmed working, and the entry names that condition so
 * nobody has to reconstruct it. Do not add anybody else here -- an account that needs a
 * standing exemption belongs in DEVICE_VERIFICATION_EXEMPT_EMAILS on Render, where an operator
 * can remove it without a deploy.
 */
export const TEMPORARY_ACCOUNT_EXEMPTIONS = [
  // Remove once /device-approval is confirmed reachable from the emailed link.
  "scott.morrow@live.com",
] as const;

export function isDeviceVerificationExempt(email: string): boolean {
  const fromEnv = (process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const list: string[] = [
    ...DEMO_ACCOUNT_EMAILS,
    ...TEMPORARY_ACCOUNT_EXEMPTIONS,
    ...fromEnv,
  ];
  return list.includes(email.trim().toLowerCase());
}

export type ApprovalState = "pending" | "approved" | "denied" | "expired";

export function approvalState(row: DeviceApproval, now = Date.now()): ApprovalState {
  if (row.status === "approved") return "approved";
  if (row.status === "denied") return "denied";
  if (row.expiresAt.getTime() < now) return "expired";
  return "pending";
}

