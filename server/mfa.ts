import { randomInt } from "crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { hashPassword, comparePasswords } from "./auth-utils";

const ISSUER = "Forge";
const BACKUP_CODE_COUNT = 10;
// Same no-ambiguous-chars alphabet as generateCoachCode/generateClaimCode
// in auth-utils.ts.
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTotpSecret(): string {
  return generateSecret();
}

// otpauth:// URI an authenticator app scans as a QR code -- rendered
// client-side via qrcode.react (already used elsewhere in the app for the
// coach-invite QR), so nothing server-side needs to draw an image.
export function totpOtpauthUri(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

// epochTolerance: 30 = +/- one 30s time step, the standard allowance for
// clock drift and the few seconds it takes to type a code in.
export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;
  try {
    const result = await verify({ secret, token: trimmed, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}

function generateBackupCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    // randomInt, not Math.random -- these bypass 2FA entirely if guessed,
    // same "not lower-stakes than a password" bar this file's own comment
    // above already holds them to.
    code += BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Hashed the same way passwordHash is (scrypt, see auth-utils.ts) -- these
// are single-use recovery credentials, not lower-stakes than a password.
// Plain codes are returned exactly once, right after generation; only the
// hashes are ever persisted.
export async function generateBackupCodes(): Promise<{ plain: string[]; hashes: string[] }> {
  const plain = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const hashes = await Promise.all(plain.map((c) => hashPassword(c)));
  return { plain, hashes };
}

// Returns the remaining hash list with the matched one removed (so the
// caller can persist it back, making the code single-use), or null if
// nothing matched.
export async function consumeBackupCode(hashes: string[], code: string): Promise<string[] | null> {
  const normalized = code.trim().toUpperCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await comparePasswords(normalized, hashes[i])) {
      return [...hashes.slice(0, i), ...hashes.slice(i + 1)];
    }
  }
  return null;
}
