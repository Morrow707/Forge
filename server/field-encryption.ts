import crypto from "crypto";

/**
 * Encrypts a single column value, with the key held outside the database.
 *
 * The threat this answers is a database that leaves: a leaked connection
 * string, a pg_dump on somebody's laptop, provider-side access, an injection
 * that reads rows. Render already encrypts the volume, which stops someone
 * stealing a physical disk and stops nothing else -- the database decrypts
 * transparently for anyone who can connect. Ciphertext in the column, with
 * the key somewhere the database has never seen, is what makes a stolen copy
 * inert.
 *
 * It does NOT protect against a compromised app server, because this process
 * holds the key. Worth stating plainly rather than letting the word
 * "encrypted" do work it cannot do.
 *
 * First user is users.mfa_secret, which was the one at-rest secret in this
 * codebase that was neither hashed nor encrypted -- passwords use scrypt,
 * reset and invite tokens are SHA-256, media URLs are HMAC'd, and the TOTP
 * seed sat in plain text next to all of it. It is also a deliberate pilot for
 * the athlete-identity migration: low volume, small blast radius, and
 * recoverable if the key is ever lost, since a lost TOTP seed means
 * re-enrolling an authenticator rather than losing anyone's data.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt
 * rather than silently returning wrong plaintext. A 96-bit random IV per
 * value, which is the size GCM is specified for.
 */

/**
 * Every ciphertext carries the version of the scheme that produced it.
 *
 * Rotation is the reason. Without a marker, re-keying means knowing which
 * rows were written before the change, which nothing records; with one, a
 * reader can hold two keys and decide per value. Nothing rotates yet, and
 * the prefix costs three bytes to make it possible later rather than
 * impossible.
 */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

/**
 * A 32-byte key, hex or base64.
 *
 * Deliberately NOT declared with `generateValue: true` in render.yaml the way
 * MEDIA_URL_SECRET is. That regenerates on deploy, and a regenerated
 * encryption key does not mean a new secret -- it means every value ever
 * written with the old one is gone. The same trap would be silent and
 * permanent, so it is worth one loud comment.
 *
 * Refuses to start in production without a real key, matching auth.ts's
 * requireSecret. The dev fallback is derived rather than constant so a
 * developer machine works out of the box, and it is unreachable in
 * production.
 */
function resolveKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY?.trim();
  if (raw) {
    const key = /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error(
        `PII_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}. ` +
          `Generate one with: openssl rand -hex 32`,
      );
    }
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PII_ENCRYPTION_KEY is not set. Refusing to start in production: encrypted columns " +
        "would be unreadable, and anything written would be encrypted under a key nobody " +
        "kept. Generate one with `openssl rand -hex 32`, set it in Render, and keep an " +
        "offline copy -- losing it destroys the data it protects.",
    );
  }
  return crypto.createHash("sha256").update("forge-dev-field-encryption").digest();
}

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) cachedKey = resolveKey();
  return cachedKey;
}

/** Resolve the key NOW rather than on first use.
 *
 * The key was only ever read lazily, the first time something was encrypted or decrypted --
 * which for this app means the first time somebody set up two-factor login. So a wrong
 * variable name on the host (it was PII_ENCRYPTION_KEYS on Render, plural, for the whole
 * beta) let every deploy come up green and only surfaced as an error inside one settings
 * screen nobody had opened. Called at startup in production, a bad or missing key fails the
 * deploy with resolveKey's own message, which names the variable and how to generate one. */
export function assertFieldEncryptionConfigured(): void {
  key();
}

/** Only for tests that need to change the key mid-process. */
export function resetFieldEncryptionKeyForTest(): void {
  cachedKey = null;
}

/** `v1:<iv>:<authTag>:<ciphertext>`, all base64url. */
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/**
 * True for a value this module produced.
 *
 * What makes a migration survivable: a column part-way through one holds both
 * shapes, and a reader has to tell them apart without a second column
 * recording which is which. Anything without the marker is treated as
 * plaintext written before encryption existed.
 */
export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

/**
 * Decrypts, or passes a legacy plaintext value straight through.
 *
 * The pass-through is the whole reason a rollout does not need a flag day.
 * It also means a column is only as protected as its least-migrated row, so
 * it is a migration aid rather than a resting state -- see
 * decryptFieldStrict for the check to switch to once a backfill is done.
 */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!isEncryptedField(stored)) return stored;
  return decryptFieldStrict(stored);
}

/** Decrypts, and throws on anything that is not a well-formed ciphertext. */
export function decryptFieldStrict(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(`Not a ${VERSION} encrypted field`);
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  // GCM verifies the tag in final(), so a tampered ciphertext, a swapped IV,
  // or a value encrypted under a different key all throw here rather than
  // returning plausible-looking rubbish.
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
