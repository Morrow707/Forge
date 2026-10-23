import "dotenv/config";
import { pool } from "./db";
import {
  actualForeignKeys,
  compareForeignKeys,
  declaredForeignKeys,
  describeFk,
  type ActualFk,
} from "./foreign-key-drift";

// The CLI half of server/foreign-key-drift.ts -- `npm run db:check-drift`, and the "Check for
// foreign-key drift" step in CI. The logic lives in that module because the SERVER imports it
// too (server/fk-drift-job.ts), and this file calls main() at module scope and exits the
// process: importing it from the server would have crash-looped a deploy on the first database
// that actually had drift. Read that file's comment for what drift is and why nothing repairs
// it automatically.
//
// ON A FRESH DATABASE THIS PASSES TRIVIALLY, which is the limit worth knowing: every constraint
// was written by the CREATE TABLE that made the table minutes earlier. That is exactly why it
// had never once reported the production gap, and why the boot-time job exists beside it.

async function main() {

  const declared = declaredForeignKeys();
  const actual = await actualForeignKeys((text) => pool.query(text) as Promise<{ rows: ActualFk[] }>);
  const { missing, wrongAction } = compareForeignKeys(declared, actual);

  console.log(`Declared foreign keys: ${declared.length}`);
  console.log(`Present in database:   ${declared.length - missing.length}`);

  for (const fk of missing) {
    console.error(`MISSING  ${describeFk(fk)}`);
  }
  for (const { fk, found } of wrongAction) {
    console.error(
      `WRONG    ${fk.table}.${fk.columns.join(",")} -> ${fk.refTable}: declared "on delete ${fk.onDelete}", database has "on delete ${found}"`,
    );
  }

  await pool.end();

  if (missing.length > 0 || wrongAction.length > 0) {
    console.error(
      `\n${missing.length} missing, ${wrongAction.length} with the wrong delete rule.\n` +
        `Not repaired automatically: adding a cascade to a table that has already\n` +
        `accumulated orphans either fails outright or starts deleting rows that\n` +
        `survived because the constraint was absent. See this file's own comment.`,
    );
    process.exit(1);
  }
  console.log("No foreign-key drift.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
