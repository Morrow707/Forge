import { derivePrivacyTier } from "@shared/privacy-tiers";
import { encryptField, blindIndex } from "./field-encryption";

/**
 * The encrypted companions of the columns that name a person.
 *
 * Phase 2 of the migration: every write that sets a name, an email address or
 * a date of birth also writes its ciphertext, so new rows are already
 * migrated and only the existing ones need a backfill. Nothing reads these
 * yet -- the plaintext columns are still the source of truth -- so this
 * changes no behaviour, which is the whole reason it ships on its own.
 *
 * One helper rather than encryption scattered across five call sites. A write
 * path that forgot to encrypt would leave a row looking migrated while its
 * plaintext quietly stayed the only copy, and nothing would notice until the
 * plaintext column was dropped and the data went with it. Spreading one
 * object into each write makes the omission visible in review, and
 * pii-backfill.ts catches anything that slips through anyway.
 *
 * Deliberately field-by-field optional: updateUserName touches only the name,
 * updateUserEmail only the address, and neither should overwrite the other's
 * ciphertext with a stale value.
 */
export type IdentityInput = {
  name?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
};

export type IdentityColumns = {
  nameEnc?: string | null;
  emailEnc?: string | null;
  emailBidx?: string | null;
  dateOfBirthEnc?: string | null;
  privacyTier?: string | null;
};

export function identityColumns(input: IdentityInput): IdentityColumns {
  const columns: IdentityColumns = {};

  if (input.name !== undefined) {
    columns.nameEnc = input.name == null ? null : encryptField(input.name);
  }

  if (input.email !== undefined) {
    if (input.email == null) {
      columns.emailEnc = null;
      columns.emailBidx = null;
    } else {
      // Lowercased to match what the plaintext column already depends on:
      // users_email_idx is unique on the raw value, and uniqueness only holds
      // because every write path normalizes first. A blind index that
      // normalized differently would let two accounts share an address.
      const normalized = input.email.trim().toLowerCase();
      columns.emailEnc = encryptField(normalized);
      columns.emailBidx = blindIndex(normalized);
    }
  }

  if (input.dateOfBirth !== undefined) {
    if (input.dateOfBirth == null) {
      columns.dateOfBirthEnc = null;
      columns.privacyTier = null;
    } else {
      columns.dateOfBirthEnc = encryptField(input.dateOfBirth);
      // The band is written here so the SQL comparisons that currently read
      // the date have something to move to. It goes stale on a birthday,
      // which is what the nightly recompute is for.
      columns.privacyTier = derivePrivacyTier(input.dateOfBirth);
    }
  }

  return columns;
}
