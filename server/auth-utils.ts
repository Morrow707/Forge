import { scrypt, randomBytes, randomInt, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(
  supplied: string,
  stored: string,
): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// A 256-bit random token is unguessable regardless of how its hash is
// stored, so a plain SHA-256 (no per-token salt) is enough here -- unlike
// passwords, there's no low-entropy input to protect against dictionary
// attack.
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateCalendarToken(): string {
  return randomBytes(24).toString("hex");
}

export function generateCoachCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    // randomInt, not Math.random -- this code is a real access-control
    // credential (it's what lets an athlete join a coach's roster), and
    // Math.random's PRNG carries no guarantee of being unpredictable.
    code += chars[randomInt(chars.length)];
  }
  return code;
}

// Same alphabet as generateCoachCode (no ambiguous 0/O/1/I), but longer --
// a coach code just picks which coach to join, while this one hands out a
// specific pre-filled identity, so it gets a little more entropy against
// someone guessing their way into a teammate's provisional slot.
export function generateClaimCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
}
