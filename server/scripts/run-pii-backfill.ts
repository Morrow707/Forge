import {
  backfillEncryptedIdentity,
  countRowsAwaitingEncryption,
  findIdentityParityMismatches,
  recomputePrivacyTiers,
} from "../pii-backfill";
import { pool } from "../db";

/**
 * Runs the identity backfill by hand: `npm run pii:backfill`.
 *
 * Deliberately not wired into the boot sequence yet. It is resumable and
 * batched, so it is safe to run against production, but the first run over
 * ~485k accounts should be something a person starts and watches rather than
 * something a deploy does on its way past -- not least because the first run
 * is also the one that would discover the encryption key is wrong.
 *
 * Once it has converged it becomes a reconciler rather than a migration, and
 * belongs on the nightly schedule beside the other jobs. At that point the
 * count it prints is the number to alert on.
 */
async function main() {
  const before = await countRowsAwaitingEncryption();
  console.log(`Rows awaiting encryption: ${before}`);

  const progress = await backfillEncryptedIdentity((p) => {
    if (p.usersScanned % 5000 === 0) {
      console.log(`  ...${p.usersEncrypted} encrypted (${p.usersScanned} scanned)`);
    }
  });
  console.log(`Encrypted: ${JSON.stringify(progress)}`);

  const tiers = await recomputePrivacyTiers();
  console.log(`Privacy tiers refreshed: ${tiers}`);

  const remaining = await countRowsAwaitingEncryption();
  console.log(`Rows awaiting encryption: ${remaining}`);

  // The check that has to pass before anyone considers dropping a plaintext
  // column, since that step turns a wrong ciphertext into lost data.
  const mismatches = await findIdentityParityMismatches();
  if (mismatches.length > 0) {
    console.error(`PARITY MISMATCH on user ids: ${mismatches.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("Parity check passed: every ciphertext decrypts back to its plaintext.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("PII backfill failed:", err);
  process.exit(1);
});
