/**
 * THE BOOT-TIME VACUUM FULL: once, only when the offload is done, and what it writes in the log.
 *
 * Added 2026-10-24 beside server/set-entries-vacuum-full.ts. The real rewrite is proven against
 * Postgres in set-entries-vacuum-full.itest.ts; what is covered HERE is the decision in front of
 * it, driven with a faked db so `npm test` needs no database (CLAUDE.md, Tests): a marker already
 * written means nothing runs; frames still inline means SKIP WITHOUT THE MARKER (so the next boot
 * tries again -- a marker written on a skip would make this a one-shot that never fired); a live
 * size too big to rewrite at boot skips the same way; and only the pass that actually ran VACUUM
 * FULL writes the marker. Plus the sentence in the Render log: sizes and counts, never a value.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("./db", () => ({ db: { execute } }));
vi.mock("./job-lock", () => ({ scheduleDailyJob: vi.fn(), runWithJobLock: vi.fn() }));
vi.mock("./job-errors", () => ({ reportJobFailure: vi.fn() }));
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import {
  formatVacuumFull,
  MAX_LIVE_BYTES_FOR_BOOT_VACUUM,
  SET_ENTRIES_VACUUM_FULL_MARKER,
  vacuumFullSetEntriesOnce,
} from "./set-entries-vacuum-full";

/** The SQL text of a drizzle `sql` tag, for routing the fake. */
const dialect = new PgDialect();
function textOf(q: unknown): string {
  return dialect.sqlToQuery(q as SQL).sql;
}

type Facts = { applied: number; frames: number; live: number; bytes: number; dead: number; bytesAfter: number };

function fakeDb(f: Facts) {
  const ran: string[] = [];
  execute.mockImplementation(async (q: unknown) => {
    const t = textOf(q);
    ran.push(t.replace(/\s+/g, " ").trim());
    if (t.includes("FROM applied_backfills WHERE key")) return { rows: [{ n: f.applied }] };
    if (t.includes("pg_stat_user_tables")) return { rows: [{ n: f.dead }] };
    if (t.includes("AS frames")) return { rows: [{ frames: f.frames, live: f.live, bytes: f.bytes }] };
    if (t.includes("VACUUM")) return { rows: [] };
    if (t.includes("pg_total_relation_size") ) return { rows: [{ bytes: f.bytesAfter }] };
    if (t.includes("INSERT INTO applied_backfills")) return { rows: [] };
    throw new Error(`unexpected statement: ${t}`);
  });
  return ran;
}

const MB = 1024 * 1024;

beforeEach(() => {
  execute.mockReset();
});

describe("vacuumFullSetEntriesOnce", () => {
  it("vacuums, measures, and writes the marker when the offload has finished and the table is small", async () => {
    const ran = fakeDb({ applied: 0, frames: 0, live: 114, bytes: 447 * MB, dead: 17_500, bytesAfter: 1 * MB });
    const o = await vacuumFullSetEntriesOnce();
    expect(o.status).toBe("vacuumed");
    expect(o.bytesBefore).toBe(447 * MB);
    expect(o.bytesAfter).toBe(1 * MB);
    expect(ran.some((s) => /VACUUM \(FULL, ANALYZE\) workout_set_entries/.test(s))).toBe(true);
    expect(ran.some((s) => s.includes("INSERT INTO applied_backfills"))).toBe(true);
    // The marker goes on AFTER the vacuum, so a crash mid-rewrite leaves it unwritten.
    const vac = ran.findIndex((s) => s.includes("VACUUM"));
    const mark = ran.findIndex((s) => s.includes("INSERT INTO applied_backfills"));
    expect(vac).toBeLessThan(mark);
  });

  it("does nothing once the marker is there -- a redeploy is silent", async () => {
    const ran = fakeDb({ applied: 1, frames: 0, live: 114, bytes: 447 * MB, dead: 0, bytesAfter: 0 });
    const o = await vacuumFullSetEntriesOnce();
    expect(o.status).toBe("already_applied");
    expect(ran.some((s) => s.includes("VACUUM"))).toBe(false);
    expect(ran.some((s) => s.includes("INSERT INTO"))).toBe(false);
  });

  it("skips WITHOUT the marker while rows still hold frames inline, so the next boot tries again", async () => {
    const ran = fakeDb({ applied: 0, frames: 37, live: 1200, bytes: 447 * MB, dead: 0, bytesAfter: 0 });
    const o = await vacuumFullSetEntriesOnce();
    expect(o.status).toBe("skipped_frames_remain");
    expect(o.framesStillInline).toBe(37);
    expect(ran.some((s) => s.includes("VACUUM"))).toBe(false);
    expect(ran.some((s) => s.includes("INSERT INTO applied_backfills"))).toBe(false);
  });

  it("skips WITHOUT the marker when the live rows are too big to rewrite at boot", async () => {
    // Every row live, none dead: the live estimate IS the relation size.
    const ran = fakeDb({ applied: 0, frames: 0, live: 20_000, bytes: 450 * MB, dead: 0, bytesAfter: 0 });
    const o = await vacuumFullSetEntriesOnce();
    expect(o.status).toBe("skipped_too_large");
    expect(o.note).toContain("by hand");
    expect(ran.some((s) => s.includes("VACUUM"))).toBe(false);
    expect(ran.some((s) => s.includes("INSERT INTO applied_backfills"))).toBe(false);
    expect(MAX_LIVE_BYTES_FOR_BOOT_VACUUM).toBe(50 * MB);
  });
});

describe("the log line", () => {
  it("carries sizes and counts and the verdict, and nothing else", () => {
    const line = formatVacuumFull({
      status: "vacuumed",
      framesStillInline: 0,
      liveRowsEstimate: 114,
      bytesBefore: 447 * MB,
      bytesAfter: 1 * MB,
      note: "the pages are back with the operating system; Render's disk-usage number should fall within its next sample",
    });
    expect(line).toContain("447.0 MB -> 1.0 MB");
    expect(line).toContain("446.0 MB returned to the disk");
    expect(line).toContain("~114 live rows");
    // The three things this log may never carry (database-size-job.test.ts has the rule).
    expect(line).not.toMatch(/@/);
    expect(line).not.toMatch(/skeleton_frames_path|\/uploads\//);
  });

  it("is dated as a one-shot, so the next table to need this is a new key", () => {
    expect(SET_ENTRIES_VACUUM_FULL_MARKER).toMatch(/_2026_10_24$/);
  });

  it("is wired at boot after the offload job, and never scheduled daily", () => {
    const index = fs.readFileSync(path.join(__dirname, "index.ts"), "utf8");
    const offload = index.indexOf("startSetTraceOffloadJob();");
    const vacuum = index.indexOf("startSetEntriesVacuumFull();");
    expect(offload).toBeGreaterThan(0);
    expect(vacuum).toBeGreaterThan(offload);
    const src = fs.readFileSync(path.join(__dirname, "set-entries-vacuum-full.ts"), "utf8");
    expect(src).not.toContain("scheduleDailyJob(");
  });
});
