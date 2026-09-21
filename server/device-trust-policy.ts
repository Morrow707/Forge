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

export function isDeviceVerificationExempt(email: string): boolean {
  const fromEnv = (process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const list = [...DEMO_ACCOUNT_EMAILS, ...fromEnv];
  return list.includes(email.trim().toLowerCase() as (typeof DEMO_ACCOUNT_EMAILS)[number]);
}

export type ApprovalState = "pending" | "approved" | "denied" | "expired";

export function approvalState(row: DeviceApproval, now = Date.now()): ApprovalState {
  if (row.status === "approved") return "approved";
  if (row.status === "denied") return "denied";
  if (row.expiresAt.getTime() < now) return "expired";
  return "pending";
}

