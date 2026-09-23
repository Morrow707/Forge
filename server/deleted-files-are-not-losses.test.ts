import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const uploadedFilesSrc = readFileSync(resolve(__dirname, "uploaded-files.ts"), "utf8");
const schemaSrc = readFileSync(resolve(__dirname, "../shared/schema.ts"), "utf8");
const migration = readFileSync(resolve(__dirname, "reconcile-schema.ts"), "utf8");

/** uploaded_files is insert-only -- nothing has ever deleted a row from it -- while files are
 *  removed deliberately all the time. Every one of those left a row with no file under it, and
 *  the admin reconciliation counted it as MISSING: 84 of the newest 100 on 2026-09-23, on a
 *  disk that was fine. A red number that is red in normal operation is worse than no number. */
describe("a file Forge removed is not a file the disk lost", () => {
  it("stamps the ledger inside deleteUploadedFile, not at each call site", () => {
    // A dozen places remove a file. A stamp that has to be remembered at each one is a stamp
    // that gets forgotten at the next one, and a forgotten stamp reads as data loss.
    expect(uploadedFilesSrc).toContain("async function markLedgerRowDeleted");
    const fn = uploadedFilesSrc.slice(
      uploadedFilesSrc.indexOf("export async function deleteUploadedFile"),
    );
    // Both exits: the unlink succeeding, and the file already being gone.
    expect(fn.slice(0, fn.indexOf("statUploadedFile")).match(/markLedgerRowDeleted\(url\)/g))
      .toHaveLength(2);
  });

  it("never clears a stamp, and never overwrites the first one", () => {
    // A path can be re-used after a delete; the FIRST removal is the one the timeline wants.
    expect(uploadedFilesSrc).toContain("isNull(uploadedFiles.deletedAt)");
    expect(uploadedFilesSrc).not.toMatch(/deletedAt:\s*null/);
  });

  it("never lets the bookkeeping write fail the delete", () => {
    const fn = uploadedFilesSrc.slice(uploadedFilesSrc.indexOf("async function markLedgerRowDeleted"));
    expect(fn.slice(0, fn.indexOf("export async function deleteUploadedFile"))).toContain("catch");
  });

  it("has the column in the schema and a migration that adds it to an existing table", () => {
    expect(schemaSrc).toContain('deletedAt: timestamp("deleted_at")');
    expect(migration).toContain(
      'ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;',
    );
  });

  it("does not backfill, because a backfill would have to guess the thing this answers", () => {
    expect(migration).not.toMatch(/UPDATE "uploaded_files"\s+SET "deleted_at"/);
  });
});
