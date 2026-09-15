import { describe, it, expect } from "vitest";
import {
  encryptField,
  decryptField,
  decryptFieldStrict,
  isEncryptedField,
} from "./field-encryption";

/**
 * The properties a column-encryption scheme has to actually have.
 *
 * Its first job is users.mfa_secret, but it is also the pilot for encrypting
 * athlete identity, so the things that matter later are worth pinning now
 * while the blast radius is a handful of authenticator seeds: ciphertext that
 * does not repeat, tampering that fails loudly instead of quietly, and a
 * migration path that does not need a flag day.
 */
describe("field encryption", () => {
  it("round-trips a value", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    expect(decryptFieldStrict(encryptField(secret))).toBe(secret);
  });

  it("never stores the plaintext", () => {
    const stored = encryptField("JBSWY3DPEHPK3PXP");
    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
  });

  it("produces a different ciphertext every time", () => {
    // A fresh IV per value. Without it, equal plaintexts produce equal
    // ciphertexts, and a dump then tells you which rows share a value even
    // though it never tells you what the value is.
    const a = encryptField("same");
    const b = encryptField("same");
    expect(a).not.toBe(b);
    expect(decryptFieldStrict(a)).toBe(decryptFieldStrict(b));
  });

  it("refuses a tampered ciphertext instead of returning rubbish", () => {
    // The reason for an authenticated mode. Unauthenticated encryption
    // decrypts a modified ciphertext into a different plaintext without
    // complaining, which for a TOTP seed would mean silently rejecting every
    // valid code with no indication why.
    const stored = encryptField("JBSWY3DPEHPK3PXP");
    const [v, iv, tag, ct] = stored.split(":");
    const flipped = ct[0] === "A" ? `B${ct.slice(1)}` : `A${ct.slice(1)}`;

    expect(() => decryptFieldStrict([v, iv, tag, flipped].join(":"))).toThrow();
  });

  it("refuses a swapped authentication tag", () => {
    const stored = encryptField("one");
    const other = encryptField("two");
    const [v, iv, , ct] = stored.split(":");
    const otherTag = other.split(":")[2];

    expect(() => decryptFieldStrict([v, iv, otherTag, ct].join(":"))).toThrow();
  });

  it("marks its own output so a half-migrated column can be read", () => {
    expect(isEncryptedField(encryptField("x"))).toBe(true);
    expect(isEncryptedField("JBSWY3DPEHPK3PXP")).toBe(false);
    expect(isEncryptedField(null)).toBe(false);
    expect(isEncryptedField(undefined)).toBe(false);
  });

  it("passes a legacy plaintext value through unchanged", () => {
    // What lets the rollout happen without a flag day: a column part-way
    // through a migration holds both shapes, and a reader has to cope with
    // both without a second column recording which is which.
    expect(decryptField("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
    expect(decryptField(null)).toBeNull();
    expect(decryptField(undefined)).toBeNull();
  });

  it("carries a version, so the key can be rotated later", () => {
    // Nothing rotates today. Without a marker, re-keying would mean knowing
    // which rows predate the change, and nothing records that -- so the
    // prefix is what keeps rotation possible rather than impossible.
    expect(encryptField("x").startsWith("v1:")).toBe(true);
  });

  it("handles an empty string and unicode", () => {
    expect(decryptFieldStrict(encryptField(""))).toBe("");
    expect(decryptFieldStrict(encryptField("Zoë Ñuñez 中文 🏋"))).toBe("Zoë Ñuñez 中文 🏋");
  });

  it("rejects a malformed value rather than guessing at it", () => {
    expect(() => decryptFieldStrict("v1:only:three")).toThrow();
    expect(() => decryptFieldStrict("v2:a:b:c")).toThrow();
    expect(() => decryptFieldStrict("not encrypted at all")).toThrow();
  });
});
