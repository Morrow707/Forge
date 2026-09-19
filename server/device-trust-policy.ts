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

export function isDeviceVerificationExempt(email: string): boolean {
  const list = (process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export type ApprovalState = "pending" | "approved" | "denied" | "expired";

export function approvalState(row: DeviceApproval, now = Date.now()): ApprovalState {
  if (row.status === "approved") return "approved";
  if (row.status === "denied") return "denied";
  if (row.expiresAt.getTime() < now) return "expired";
  return "pending";
}

