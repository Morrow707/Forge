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

/**
 * A searchable fingerprint of a value, for the one thing encryption breaks:
 * looking a row up by it.
 *
 * `getUserByEmail` is the single equality chokepoint in this codebase, and
 * ten features sit behind it -- login, signup's duplicate check, password
 * reset, the two admin lookups, the email-change check, free-agent invites,
 * claim-code signup, and both halves of the guardian invite claim. Encrypting
 * the column with a random IV makes every one of those impossible, because
 * two encryptions of the same address do not match.
 *
 * So a second column holds HMAC-SHA256 of the normalized value: deterministic,
 * so a lookup works, and one-way, so a stolen dump cannot be read back into
 * addresses. It IS vulnerable to a guessing attack -- an attacker with the
 * index key and a list of candidate addresses can test them -- which is why
 * the key must never be stored next to the data, and why this is a lookup
 * mechanism rather than a second layer of confidentiality.
 *
 * Normalization has to match what the plaintext column already relies on.
 * users_email_idx is a unique index on the raw column, and uniqueness holds
 * today only because every write path lowercases first. A blind index that
 * normalized differently would let two accounts share an address.
 */
function blindIndexKey(): Buffer {
  // Derived from the encryption key rather than being its own env var, which
  // is a deliberate trade. Two keys is the stricter pattern and matches how
  // this repo already separates the session, media and native-token secrets.
  // One key is far harder to lose half of, and losing half of this pair is
  // unrecoverable in a way losing a signing secret never is.
  //
  // The cost: rotating the encryption key changes this one too, so every
  // blind index has to be recomputed. That is already what rotation requires
  // -- re-encrypting every value -- and the backfill job walks exactly these
  // rows, so re-indexing is the same operation rather than a new problem.
  return crypto.createHmac("sha256", key()).update("forge:blind-index:v1").digest();
}

export function blindIndex(value: string): string {
  return crypto
    .createHmac("sha256", blindIndexKey())
    .update(value.trim().toLowerCase())
    .digest("hex");
}

/**
 * Resolves the key at boot instead of at first use.
 *
 * Without this the first failure would be a signup returning 500, because
 * dual-write calls encryptField on every account create and update. That is a
 * bad way to learn the key is missing: the deploy looks healthy, Render keeps
 * routing to it, and the symptom shows up as users unable to register.
 *
 * Called from index.ts's boot path so a misconfigured production deploy fails
 * to start, which leaves the previous version serving -- the same fail-closed
 * posture auth.ts takes for SESSION_SECRET and media-url-signing.ts for its
 * own secret.
 */
export function assertFieldEncryptionReady(): void {
  key();
}
