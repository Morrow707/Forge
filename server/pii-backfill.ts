import { and, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { users, guardianInvites, provisionalAthletes } from "@shared/schema";
import { derivePrivacyTier } from "@shared/privacy-tiers";
import { encryptField, blindIndex } from "./field-encryption";
import { identityColumns } from "./pii-identity";

/**
 * Fills the encrypted identity columns for rows that predate them, and keeps
 * filling them afterwards.
 *
 * Phase 3 of the migration, and deliberately two jobs in one.
 *
 * As a BACKFILL it walks every row whose plaintext exists and whose
 * ciphertext does not. As a RECONCILER it never stops being useful: a future
 * write path that forgets to encrypt leaves exactly the same signature, and
 * without something looking for it that row would sit there looking migrated
 * until the plaintext column was dropped and its data went with it. Dual-write
 * is the mechanism; this is what makes the mechanism verifiable.
 *
 * Not expressed in reconcile-schema.ts, for two reasons. The key lives in the
 * application, so the work cannot be written as SQL at all. And that file's
 * backfills are single unguarded UPDATE statements inside a DO block --
 * against ~485k users that is one long transaction blocking the deploy's
 * build step, which is a bad way to find out the encryption key was wrong.
 *
 * Resumable by construction. It pages by ascending id and re-reads its own
 * predicate each time, so an interruption loses only the batch in flight and
 * a rerun picks up exactly where it stopped -- the same checkpointing
 * reasoning the book-transcription pipeline already works to, where a
 * redeploy mid-run used to lose the whole job and charge for it twice.
 */
const BATCH_SIZE = 500;

export type BackfillProgress = {
  usersScanned: number;
  usersEncrypted: number;
  guardianInvitesEncrypted: number;
  provisionalAthletesEncrypted: number;
};

/**
 * True for a row that still needs work.
 *
 * Every clause is "the plaintext is there and the ciphertext is not", so a
 * completed row is never revisited and the job converges. dateOfBirth is
 * nullable on purpose -- accounts predating the column have none, and a row
 * with no birthdate is already fully migrated with respect to it.
 */
function usersNeedingBackfill() {
  return or(
    isNull(users.nameEnc),
    isNull(users.emailEnc),
    isNull(users.emailBidx),
    and(isNotNull(users.dateOfBirth), isNull(users.dateOfBirthEnc)),
    and(isNotNull(users.dateOfBirth), isNull(users.privacyTier)),
  );
}

export async function backfillEncryptedIdentity(
  onProgress?: (p: BackfillProgress) => void,
): Promise<BackfillProgress> {
  const progress: BackfillProgress = {
    usersScanned: 0,
    usersEncrypted: 0,
    guardianInvitesEncrypted: 0,
    provisionalAthletesEncrypted: 0,
  };

  let afterId = 0;
  for (;;) {
    const batch = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        dateOfBirth: users.dateOfBirth,
      })
      .from(users)
      .where(and(gt(users.id, afterId), usersNeedingBackfill()))
      .orderBy(users.id)
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    for (const row of batch) {
      // Written one row at a time rather than as a bulk UPDATE, because each
      // value gets its own IV and its own ciphertext -- there is no single
      // statement that expresses this.
      await db
        .update(users)
        .set(
          identityColumns({
            name: row.name,
            email: row.email,
            dateOfBirth: row.dateOfBirth ?? null,
          }),
        )
        .where(eq(users.id, row.id));
      progress.usersEncrypted++;
    }

    progress.usersScanned += batch.length;
    afterId = batch[batch.length - 1].id;
    onProgress?.(progress);
  }

  // A parent's address, and a child's name and birthdate entered by a coach
  // before that child has any account at all. Neither table is looked up by
  // the encrypted value -- guardian invites resolve by token hash and
  // provisional athletes by claim code -- so neither needs a blind index.
  const invites = await db
    .select({ id: guardianInvites.id, email: guardianInvites.email })
    .from(guardianInvites)
    .where(isNull(guardianInvites.emailEnc));
  for (const invite of invites) {
    await db
      .update(guardianInvites)
      .set({ emailEnc: encryptField(invite.email.trim().toLowerCase()) })
      .where(eq(guardianInvites.id, invite.id));
    progress.guardianInvitesEncrypted++;
  }

  const provisional = await db
    .select({
      id: provisionalAthletes.id,
      name: provisionalAthletes.name,
      dateOfBirth: provisionalAthletes.dateOfBirth,
    })
    .from(provisionalAthletes)
    .where(
      or(
        isNull(provisionalAthletes.nameEnc),
        and(
          isNotNull(provisionalAthletes.dateOfBirth),
          isNull(provisionalAthletes.dateOfBirthEnc),
        ),
      ),
    );
  for (const row of provisional) {
    await db
      .update(provisionalAthletes)
      .set({
        nameEnc: encryptField(row.name),
        dateOfBirthEnc: row.dateOfBirth ? encryptField(row.dateOfBirth) : null,
        privacyTier: row.dateOfBirth ? derivePrivacyTier(row.dateOfBirth) : null,
      })
      .where(eq(provisionalAthletes.id, row.id));
    progress.provisionalAthletesEncrypted++;
  }

  return progress;
}

/**
 * How far from done the migration is, without changing anything.
 *
 * The number to watch before the plaintext columns are dropped, and the
 * number that must stay at zero afterwards. Cheap enough to expose on an
 * admin health surface, which is where it belongs -- "encryption is on" is
 * not a thing anyone should be taking on faith.
 */
export async function countRowsAwaitingEncryption(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(usersNeedingBackfill());
  return row?.count ?? 0;
}

/**
 * Recomputes the privacy-tier band from the date of birth.
 *
 * The band is the price of keeping the minors queue and the retention purge
 * in SQL once the birthdate is unreadable, and a band goes stale on a
 * birthday -- an athlete turning 13 or 18 changes what the platform owes
 * them. Nightly is the right cadence because the boundary it tracks moves
 * once a day.
 *
 * Reads the plaintext column while it still exists; once it is gone this
 * decrypts date_of_birth_enc instead, which is the one place in the whole
 * scheme that has to do real work at scale (~485k decryptions, a few seconds
 * of CPU, once a night).
 */
export async function recomputePrivacyTiers(): Promise<number> {
  let afterId = 0;
  let updated = 0;
  for (;;) {
    const batch = await db
      .select({ id: users.id, dateOfBirth: users.dateOfBirth, privacyTier: users.privacyTier })
      .from(users)
      .where(and(gt(users.id, afterId), isNotNull(users.dateOfBirth)))
      .orderBy(users.id)
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;

    for (const row of batch) {
      const tier = derivePrivacyTier(row.dateOfBirth!);
      if (tier !== row.privacyTier) {
        await db.update(users).set({ privacyTier: tier }).where(eq(users.id, row.id));
        updated++;
      }
    }
    afterId = batch[batch.length - 1].id;
  }
  return updated;
}

/**
 * Proves the ciphertext says the same thing as the plaintext.
 *
 * The check that has to pass before the plaintext columns are dropped, since
 * that step is irreversible and "the backfill reported success" is not the
 * same claim as "every row decrypts back to what it replaced". Returns the
 * ids that disagree rather than a boolean, because the useful output of a
 * parity check is which rows to look at.
 */
export async function findIdentityParityMismatches(limit = 100): Promise<number[]> {
  const { decryptField } = await import("./field-encryption");
  const mismatched: number[] = [];
  let afterId = 0;

  for (;;) {
    const batch = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        dateOfBirth: users.dateOfBirth,
        nameEnc: users.nameEnc,
        emailEnc: users.emailEnc,
        emailBidx: users.emailBidx,
        dateOfBirthEnc: users.dateOfBirthEnc,
      })
      .from(users)
      .where(gt(users.id, afterId))
      .orderBy(users.id)
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;

    for (const row of batch) {
      const normalizedEmail = row.email.trim().toLowerCase();
      const agrees =
        decryptField(row.nameEnc) === row.name &&
        decryptField(row.emailEnc) === normalizedEmail &&
        row.emailBidx === blindIndex(normalizedEmail) &&
        (row.dateOfBirth == null
          ? row.dateOfBirthEnc == null
          : decryptField(row.dateOfBirthEnc) === row.dateOfBirth);
      if (!agrees) mismatched.push(row.id);
      if (mismatched.length >= limit) return mismatched;
    }
    afterId = batch[batch.length - 1].id;
  }
  return mismatched;
}
