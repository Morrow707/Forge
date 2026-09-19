import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "./db";
import { deviceApprovals, trustedDevices, type DeviceApproval, type TrustedDevice } from "@shared/schema";
import { generateResetToken, hashResetToken } from "./auth-utils";
import { hashDeviceId, TRUSTED_DEVICE_TTL_MS, DEVICE_APPROVAL_TTL_MS } from "./device-trust-policy";

// The pure half -- ids, hashing, expiry, the stand-down switches -- lives in
// device-trust-policy.ts so it can be unit-tested without a database. Every
// caller that has a DB imports from here and gets both.
export * from "./device-trust-policy";


/**
 * Trusted devices and new-device approval. Every role, every device.
 *
 * THE RULE. A password alone signs you in only on a device this account has used before. On any
 * other device the sign-in waits, an email goes to the account's address with the device's name
 * and approximate location, and the person approves or denies it from there. Approve, and the
 * waiting device gets its session and is trusted from then on. Deny, and every session and every
 * trusted device is dropped and the person is walked straight into choosing a new password --
 * a denial means somebody else has the password, and there is nothing else to do about that.
 *
 * Scott, 2026-09-19: "if we notice a device that is not trusted, then have the app send a message
 * saying we don't recognize this device ... then they click the email tab, then accept the new
 * device, or deny it, if they deny it have them be guided to a new password screen because
 * obviously they were hacked." Chosen over a "trust this device?" prompt on the new device
 * itself, because whoever is holding the new device just taps yes -- and a thief taps yes too.
 * The question has to be put to something the account owner already holds.
 *
 * ORDER. Password, then device, then the authenticator code for accounts that have one. The
 * device check comes BEFORE the code on purpose: an approval token proves the sign-in was seen
 * by the inbox, a TOTP code proves it was seen by the phone, and a stolen password should have
 * to get past the first before it is allowed to try the second.
 *
 * WHAT A DEVICE IS. An id the client generates once and keeps in its own storage
 * (client/src/lib/device-id.ts) -- NOT the User-Agent, which every phone of one model shares
 * and which session-tracking.ts already uses for the friendlier "new login" notice. A sign-in
 * that sends no id is simply an unrecognised device. Only the hash of the id is stored.
 *
 * THE TIMER RESETS. Trust lasts TRUSTED_DEVICE_TTL_MS from the last sign-in on that device,
 * and each sign-in moves it forward -- the same rule the session cookie already follows.
 * Signing out on a device forgets it. Changing or resetting the password forgets all of them.
 *
 * WHEN IT STANDS DOWN. DEVICE_VERIFICATION_DISABLED=true switches the whole gate off, for an
 * email outage or a rollback; DEVICE_VERIFICATION_EXEMPT_EMAILS lists accounts that sign in with
 * a password alone -- the App Review demo accounts, which sign in on Apple's devices and cannot
 * open the email. Neither weakens anything for anyone else. With no email provider configured
 * at all (a local dev box) the gate also stands down, loudly, rather than lock every login.
 */

function trustCutoff(now = Date.now()): Date {
  return new Date(now - TRUSTED_DEVICE_TTL_MS);
}

/** The live trusted-device row for this device, or null. Expired trust is the same as none. */
export async function findTrustedDevice(userId: number, deviceId: string): Promise<TrustedDevice | null> {
  const [row] = await db
    .select()
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.userId, userId),
        eq(trustedDevices.deviceIdHash, hashDeviceId(deviceId)),
        isNull(trustedDevices.revokedAt),
        gt(trustedDevices.lastUsedAt, trustCutoff()),
      ),
    )
    .orderBy(desc(trustedDevices.lastUsedAt))
    .limit(1);
  return row ?? null;
}

export async function touchTrustedDevice(id: number): Promise<void> {
  await db.update(trustedDevices).set({ lastUsedAt: new Date() }).where(eq(trustedDevices.id, id));
}

/** Trust a device now. Any earlier row for the same device is revoked first so the list a
 * person sees never shows one phone twice. */
export async function trustDevice(
  userId: number,
  deviceId: string,
  meta: { deviceLabel?: string | null; ipAddress?: string | null; location?: string | null },
): Promise<TrustedDevice> {
  const deviceIdHash = hashDeviceId(deviceId);
  await db
    .update(trustedDevices)
    .set({ revokedAt: new Date() })
    .where(and(eq(trustedDevices.userId, userId), eq(trustedDevices.deviceIdHash, deviceIdHash), isNull(trustedDevices.revokedAt)));
  const [row] = await db
    .insert(trustedDevices)
    .values({
      userId,
      deviceIdHash,
      deviceLabel: meta.deviceLabel ?? null,
      ipAddress: meta.ipAddress ?? null,
      location: meta.location ?? null,
    })
    .returning();
  return row;
}

export async function forgetDevice(userId: number, deviceId: string): Promise<void> {
  await db
    .update(trustedDevices)
    .set({ revokedAt: new Date() })
    .where(and(eq(trustedDevices.userId, userId), eq(trustedDevices.deviceIdHash, hashDeviceId(deviceId)), isNull(trustedDevices.revokedAt)));
}

export async function forgetDeviceById(userId: number, id: number): Promise<boolean> {
  const rows = await db
    .update(trustedDevices)
    .set({ revokedAt: new Date() })
    .where(and(eq(trustedDevices.id, id), eq(trustedDevices.userId, userId), isNull(trustedDevices.revokedAt)))
    .returning({ id: trustedDevices.id });
  return rows.length > 0;
}

export async function forgetAllDevices(userId: number): Promise<void> {
  await db
    .update(trustedDevices)
    .set({ revokedAt: new Date() })
    .where(and(eq(trustedDevices.userId, userId), isNull(trustedDevices.revokedAt)));
}

export async function listTrustedDevices(userId: number): Promise<TrustedDevice[]> {
  return db
    .select()
    .from(trustedDevices)
    .where(and(eq(trustedDevices.userId, userId), isNull(trustedDevices.revokedAt), gt(trustedDevices.lastUsedAt, trustCutoff())))
    .orderBy(desc(trustedDevices.lastUsedAt));
}

/** Open a new approval. Returns the two raw tokens exactly once; only their hashes are kept. */
export async function createDeviceApproval(
  userId: number,
  deviceId: string,
  meta: { deviceLabel?: string | null; ipAddress?: string | null; location?: string | null },
): Promise<{ approval: DeviceApproval; actionToken: string; pollToken: string }> {
  const actionToken = generateResetToken();
  const pollToken = generateResetToken();
  const [approval] = await db
    .insert(deviceApprovals)
    .values({
      userId,
      deviceIdHash: hashDeviceId(deviceId),
      deviceLabel: meta.deviceLabel ?? null,
      ipAddress: meta.ipAddress ?? null,
      location: meta.location ?? null,
      actionTokenHash: hashResetToken(actionToken),
      pollTokenHash: hashResetToken(pollToken),
      expiresAt: new Date(Date.now() + DEVICE_APPROVAL_TTL_MS),
    })
    .returning();
  return { approval, actionToken, pollToken };
}

export async function setApprovalLocation(id: number, location: string | null): Promise<void> {
  if (!location) return;
  await db.update(deviceApprovals).set({ location }).where(eq(deviceApprovals.id, id));
}

export async function findApprovalByActionToken(actionToken: string): Promise<DeviceApproval | null> {
  const [row] = await db
    .select()
    .from(deviceApprovals)
    .where(eq(deviceApprovals.actionTokenHash, hashResetToken(actionToken)))
    .limit(1);
  return row ?? null;
}

export async function findApprovalByPollToken(pollToken: string): Promise<DeviceApproval | null> {
  const [row] = await db
    .select()
    .from(deviceApprovals)
    .where(eq(deviceApprovals.pollTokenHash, hashResetToken(pollToken)))
    .limit(1);
  return row ?? null;
}

/** Decide a pending approval. Returns false when it was not pending (already decided, or
 * expired) -- the caller says so rather than pretending a stale click did something. */
export async function decideApproval(id: number, decision: "approved" | "denied"): Promise<boolean> {
  const rows = await db
    .update(deviceApprovals)
    .set({ status: decision, decidedAt: new Date() })
    .where(and(eq(deviceApprovals.id, id), eq(deviceApprovals.status, "pending"), gt(deviceApprovals.expiresAt, new Date())))
    .returning({ id: deviceApprovals.id });
  return rows.length > 0;
}

/** Spend an approved row: the one call that turns "approved" into a trusted device. Atomic on
 * consumedAt so two racing claims cannot both win. */
export async function consumeApproval(id: number): Promise<DeviceApproval | null> {
  const [row] = await db
    .update(deviceApprovals)
    .set({ consumedAt: new Date() })
    .where(and(eq(deviceApprovals.id, id), eq(deviceApprovals.status, "approved"), isNull(deviceApprovals.consumedAt)))
    .returning();
  return row ?? null;
}
