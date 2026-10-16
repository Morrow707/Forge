import { describe, expect, it, vi } from "vitest";

// The module imports the live pool; `npm test` runs with no database (CLAUDE.md, Tests).
vi.mock("./db", () => ({ db: {} }));
vi.mock("./job-lock", () => ({ scheduleDailyJob: vi.fn(), runWithJobLock: vi.fn() }));
import fs from "node:fs";
import path from "node:path";
import { formatDatabaseSizeReport, formatMb } from "./database-size-job";

describe("the database size report", () => {
  it("prints sizes and row estimates only, never a value from a row", () => {
    const line = formatDatabaseSizeReport(623_587_300, [
      { table: "workout_set_entries", totalBytes: 400 * 1024 * 1024, rowsEstimate: 1200 },
      { table: "knowledge_passages", totalBytes: 120 * 1024 * 1024, rowsEstimate: 9000 },
    ]);
    expect(line).toBe(
      "Database size: 594.7 MB total; largest tables: workout_set_entries 400.0 MB (~1200 rows); knowledge_passages 120.0 MB (~9000 rows)",
    );
    expect(formatMb(1024 * 1024)).toBe("1.0 MB");
  });

  it("the query selects pg_class sizes and no table's contents", () => {
    const src = fs.readFileSync(path.join(__dirname, "database-size-job.ts"), "utf8");
    expect(src).toMatch(/pg_total_relation_size/);
    expect(src).toMatch(/pg_database_size/);
    // The only tables it reads FROM are the catalog; a `FROM "users"` or any public table here
    // would be the line that starts putting a person's data in the Render log.
    const froms = [...src.matchAll(/\bFROM\s+([\w"]+)/g)].map((m) => m[1]);
    expect(froms.every((f) => f.startsWith("pg_"))).toBe(true);
  });

  it("is started at boot beside the other daily jobs", () => {
    const index = fs.readFileSync(path.join(__dirname, "index.ts"), "utf8");
    expect(index).toMatch(/startDatabaseSizeJob\(\)/);
  });
});
