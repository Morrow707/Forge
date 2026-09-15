import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { resetDatabase, makeAthlete, makeCoach } from "./test-support/fixtures";
import { decryptField, blindIndex, isEncryptedField } from "./field-encryption";
import {
  backfillEncryptedIdentity,
  countRowsAwaitingEncryption,
  findIdentityParityMismatches,
  recomputePrivacyTiers,
} from "./pii-backfill";

/**
 * Phases 1 to 3 of encrypting athlete identity: the columns exist, new writes
 * fill them, and old rows get filled by a job.
 *
 * Nothing READS the ciphertext yet. The plaintext columns are still the
 * source of truth, so a deploy carrying this changes no behaviour at all --
 * which is the point of landing it as its own step rather than alongside the
 * read switch. What these tests pin is that by the time the read switch does
 * happen, the ciphertext is complete and says the same thing as the plaintext.
 *
 * The step after this one is irreversible: dropping the plaintext columns
 * turns "the ciphertext is wrong" from a bug into lost data. So parity is
 * asserted here rather than assumed later.
 */
describe("encrypted identity is written alongside the plaintext", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function rawUser(id: number) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row;
  }

  it("encrypts identity when an account is created", async () => {
    // Every account on the platform is created through storage.createUser,
    // so this one path covers signup, claim codes and free agents alike.
    const created = await storage.createUser({
      email: "Nadia.Oyelaran@Example.Test",
      passwordHash: "x",
      name: "Nadia Oyelaran",
      role: "athlete",
      dateOfBirth: "2014-02-11",
    } as any);

    const row = await rawUser(created.id);
    expect(decryptField(row.nameEnc)).toBe("Nadia Oyelaran");
    expect(decryptField(row.emailEnc)).toBe("nadia.oyelaran@example.test");
    expect(decryptField(row.dateOfBirthEnc)).toBe("2014-02-11");
    expect(row.privacyTier).toBe("tier1_under13");
  });

  it("stores ciphertext, not the value", async () => {
    const created = await storage.createUser({
      email: "hidden@example.test",
      passwordHash: "x",
      name: "Hidden Person",
      role: "athlete",
      dateOfBirth: "2014-02-11",
    } as any);

    const row = await rawUser(created.id);
    expect(row.nameEnc).not.toContain("Hidden");
    expect(row.emailEnc).not.toContain("hidden@");
    expect(row.dateOfBirthEnc).not.toContain("2014");
    expect(isEncryptedField(row.nameEnc)).toBe(true);
  });

  it("gives the same address the same blind index, and different ones different", async () => {
    // The property the whole lookup path depends on: a random IV makes two
    // encryptions of one address differ, so equality has to happen somewhere
    // else.
    const a = await storage.createUser({
      email: "Same.Person@Example.Test",
      passwordHash: "x",
      name: "A",
      role: "athlete",
    } as any);
    const b = await storage.createUser({
      email: "other@example.test",
      passwordHash: "x",
      name: "B",
      role: "athlete",
    } as any);

    const rowA = await rawUser(a.id);
    const rowB = await rawUser(b.id);

    // Normalization matches the plaintext column's, which is what keeps the
    // uniqueness guarantee intact.
    expect(rowA.emailBidx).toBe(blindIndex("same.person@example.test"));
    expect(rowA.emailBidx).not.toBe(rowB.emailBidx);
    // And the ciphertexts do NOT match, which is why the index has to exist.
    expect(rowA.emailEnc).not.toBe(rowB.emailEnc);
  });

  it("finds an account by blind index, which is what login will use", async () => {
    const created = await storage.createUser({
      email: "login.path@example.test",
      passwordHash: "x",
      name: "Login Path",
      role: "coach",
    } as any);

    const [found] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailBidx, blindIndex("LOGIN.PATH@example.test")));

    expect(found?.id).toBe(created.id);
  });

  it("keeps the ciphertext current when a name or address changes", async () => {
    // A stale ciphertext is the failure mode that survives dual-write and
    // only shows up once the plaintext is gone.
    const created = await storage.createUser({
      email: "before@example.test",
      passwordHash: "x",
      name: "Before Change",
      role: "coach",
    } as any);

    await storage.updateUserName(created.id, "After Change");
    await storage.updateUserEmail(created.id, "After@Example.Test");

    const row = await rawUser(created.id);
    expect(decryptField(row.nameEnc)).toBe("After Change");
    expect(decryptField(row.emailEnc)).toBe("after@example.test");
    expect(row.emailBidx).toBe(blindIndex("after@example.test"));
  });

  it("encrypts a date of birth supplied after signup", async () => {
    const created = await storage.createUser({
      email: "dob.later@example.test",
      passwordHash: "x",
      name: "Later DOB",
      role: "athlete",
    } as any);

    await storage.backfillDateOfBirth(created.id, "2009-08-30");

    const row = await rawUser(created.id);
    expect(decryptField(row.dateOfBirthEnc)).toBe("2009-08-30");
    expect(row.privacyTier).toBe("tier2_teen_13_17");
  });
});

describe("the backfill fills rows that predate the columns", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  /** A row as it looked before any of this existed: plaintext only. */
  async function makeLegacyRow(name: string, email: string, dob: string | null) {
    const athlete = await makeAthlete({ name, email, dateOfBirth: dob ?? undefined });
    await db
      .update(users)
      .set({
        nameEnc: null,
        emailEnc: null,
        emailBidx: null,
        dateOfBirthEnc: null,
        privacyTier: null,
      })
      .where(eq(users.id, athlete.id));
    return athlete;
  }

  it("encrypts every legacy row and reports how many are left", async () => {
    await makeLegacyRow("Legacy One", "legacy1@example.test", "2013-01-05");
    await makeLegacyRow("Legacy Two", "legacy2@example.test", null);

    expect(await countRowsAwaitingEncryption()).toBe(2);

    const progress = await backfillEncryptedIdentity();
    expect(progress.usersEncrypted).toBe(2);
    expect(await countRowsAwaitingEncryption()).toBe(0);
  });

  it("is safe to run twice and does no work the second time", async () => {
    // It runs on a schedule, so converging matters more than being fast.
    await makeLegacyRow("Legacy Three", "legacy3@example.test", "2013-01-05");
    await backfillEncryptedIdentity();

    const second = await backfillEncryptedIdentity();
    expect(second.usersEncrypted).toBe(0);
  });

  it("catches a row a future write path forgets to encrypt", async () => {
    // Dual-write is the mechanism; this is what makes it verifiable. A write
    // that skipped encryption leaves exactly this signature, and without
    // something looking for it the row sits there looking migrated until the
    // plaintext is dropped and its data goes too.
    const athlete = await makeAthlete({ name: "Forgotten", email: "forgot@example.test" });
    await db.update(users).set({ nameEnc: null }).where(eq(users.id, athlete.id));

    expect(await countRowsAwaitingEncryption()).toBe(1);
    await backfillEncryptedIdentity();

    const [row] = await db.select().from(users).where(eq(users.id, athlete.id));
    expect(decryptField(row.nameEnc)).toBe("Forgotten");
  });

  it("leaves an account with no date of birth alone rather than looping on it", async () => {
    // The trap in a "fill what is empty" job: a genuinely empty source column
    // looks identical to unfinished work, and the job never converges.
    await makeLegacyRow("No Birthday", "nodob@example.test", null);
    await backfillEncryptedIdentity();

    expect(await countRowsAwaitingEncryption()).toBe(0);
    const second = await backfillEncryptedIdentity();
    expect(second.usersEncrypted).toBe(0);
  });
});

describe("the ciphertext says the same thing as the plaintext", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("reports no mismatches across a mixed population", async () => {
    // The check that has to pass before the plaintext columns are dropped,
    // because that step turns a wrong ciphertext into lost data.
    await makeCoach({ name: "Parity Coach" });
    for (let i = 0; i < 5; i++) {
      await makeAthlete({ name: `Parity Athlete ${i}`, dateOfBirth: "2012-06-01" });
    }
    await backfillEncryptedIdentity();

    expect(await findIdentityParityMismatches()).toEqual([]);
  });

  it("names the row when the ciphertext disagrees", async () => {
    // A parity check that cannot fail is not a check.
    const athlete = await makeAthlete({ name: "Tampered", email: "tampered@example.test" });
    await backfillEncryptedIdentity();
    await db
      .update(users)
      .set({ name: "Something Else" })
      .where(eq(users.id, athlete.id));

    expect(await findIdentityParityMismatches()).toContain(athlete.id);
  });
});

describe("the privacy tier tracks birthdays", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("recomputes a band that has gone stale", async () => {
    // The band is what keeps the minors queue and the retention purge in SQL
    // once the birthdate is unreadable, and a band goes stale on a birthday.
    const athlete = await makeAthlete({ name: "Turning 13", dateOfBirth: "2013-01-05" });
    await backfillEncryptedIdentity();

    // Force the stale value a birthday would have left behind.
    await db
      .update(users)
      .set({ privacyTier: "tier1_under13" })
      .where(eq(users.id, athlete.id));

    const updated = await recomputePrivacyTiers();
    expect(updated).toBe(1);

    const [row] = await db.select().from(users).where(eq(users.id, athlete.id));
    expect(row.privacyTier).toBe("tier2_teen_13_17");
  });

  it("changes nothing when every band is already right", async () => {
    await makeAthlete({ name: "Stable", dateOfBirth: "2013-01-05" });
    await backfillEncryptedIdentity();

    expect(await recomputePrivacyTiers()).toBe(0);
  });

  it("agrees with the date of birth for every athlete", async () => {
    // The band and the date must never disagree, since the band is what
    // decides guardian consent and video retention for a minor.
    for (const dob of ["2016-03-02", "2012-09-14", "2004-05-20"]) {
      await makeAthlete({ name: `Band ${dob}`, dateOfBirth: dob });
    }
    await backfillEncryptedIdentity();

    const rows = await db
      .select({ dateOfBirth: users.dateOfBirth, privacyTier: users.privacyTier })
      .from(users)
      .where(sql`${users.dateOfBirth} is not null`);

    for (const row of rows) {
      const expected =
        row.dateOfBirth! > "2013-09-15"
          ? "tier1_under13"
          : row.dateOfBirth! > "2008-09-15"
            ? "tier2_teen_13_17"
            : "tier3_adult_18plus";
      expect(row.privacyTier).toBe(expected);
    }
  });
});
