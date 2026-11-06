import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANVIL_SIGNAL_TABLES,
  NOT_A_SIGNAL_TABLE,
  PARTIALLY_CLASSIFIED_TABLES,
} from "./anvil-inputs";

/**
 * THE HALF `anvil-inputs.ts` SAID IT COULD NOT POLICE, AND WHY IT NOW HAS TO.
 *
 * That file's header reasoned that a new signal TABLE is a schema event a person is present for,
 * where a new column is a one-line diff reading as housekeeping -- so the column rule was enforced
 * and the table rule was left to judgement. Audited 2026-11-06: **42 athlete-scoped tables had
 * never been classified at the table level**, and `imported_testing_data` -- velocity and power
 * measured by an instrument that is not the camera, the only independent witness the slow channel
 * could have had -- had been sitting unread since the declaration was written.
 *
 * A person being present is not the same as a person looking.
 */

const SCHEMA = readFileSync(join(import.meta.dirname ?? __dirname, "schema.ts"), "utf8");

/** Every `pgTable("name", { ... })` with its body, brace-matched rather than windowed. */
function schemaTables(): Map<string, string> {
  const out = new Map<string, string>();
  const re = /pgTable\(\s*\n?\s*"([a-z0-9_]+)"/g;
  for (let m = re.exec(SCHEMA); m; m = re.exec(SCHEMA)) {
    const open = SCHEMA.indexOf("{", m.index + m[0].length);
    if (open < 0) continue;
    let depth = 0;
    let i = open;
    for (; i < SCHEMA.length; i++) {
      if (SCHEMA[i] === "{") depth++;
      else if (SCHEMA[i] === "}" && --depth === 0) break;
    }
    out.set(m[1], SCHEMA.slice(open, i));
  }
  return out;
}

/**
 * A table is the Anvil's business if it is keyed to a person. `athleteId` or `userId` -- the two
 * spellings Forge uses -- and nothing cleverer, because a rule that tried to guess which columns
 * were "physical" would be the judgement call this test exists to replace.
 */
function isAthleteScoped(body: string): boolean {
  return /\b(athleteId|userId)\b/.test(body);
}

const CLASSIFIED = new Set([
  ...Object.keys(ANVIL_SIGNAL_TABLES),
  ...Object.keys(PARTIALLY_CLASSIFIED_TABLES),
  ...Object.keys(NOT_A_SIGNAL_TABLE),
]);

describe("every athlete-scoped table in Forge is classified, one way or the other", () => {
  it("finds the schema's tables by brace-matching, not by a window", () => {
    const t = schemaTables();
    expect(t.size).toBeGreaterThan(100);
    expect(t.has("wellness_checkins")).toBe(true);
    expect(t.has("imported_testing_data")).toBe(true);
    // The body really is the body: a column of this table, and none of the next one's.
    expect(t.get("water_log_entries")).toMatch(/amountOz/);
    expect(t.get("water_log_entries")).not.toMatch(/velocityMps/);
  });

  it("leaves no athlete-scoped table unclassified", () => {
    const missing = [...schemaTables()]
      .filter(([name, body]) => isAthleteScoped(body) && !CLASSIFIED.has(name))
      .map(([name]) => name);
    expect(
      missing,
      "An athlete-scoped table exists that the Anvil has never considered. Put it in " +
        "ANVIL_SIGNAL_TABLES with its signals, or in NOT_A_SIGNAL_TABLE with the reason. This is " +
        "the check that found imported_testing_data, which held the only velocity in Forge the " +
        "camera did not produce.",
    ).toEqual([]);
  });

  it("classifies each table exactly once", () => {
    const seen = new Map<string, number>();
    for (const k of [
      ...Object.keys(ANVIL_SIGNAL_TABLES),
      ...Object.keys(PARTIALLY_CLASSIFIED_TABLES),
      ...Object.keys(NOT_A_SIGNAL_TABLE),
    ]) {
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
  });

  it("classifies no table that does not exist", () => {
    const real = schemaTables();
    const ghosts = [...CLASSIFIED].filter((t) => !real.has(t));
    expect(ghosts, "a classification for a table the schema does not have is a stale entry").toEqual(
      [],
    );
  });

  it("gives every refusal a real reason", () => {
    for (const [table, why] of Object.entries(NOT_A_SIGNAL_TABLE)) {
      expect(why.trim(), `${table} is refused with no reason`).not.toBe("");
      expect(why.length, `${table}'s reason is too short to be one`).toBeGreaterThan(14);
    }
  });

  it("keeps the four candidates marked as candidates, not as settled refusals", () => {
    // The distinction that stops a deliberate omission becoming an invisible one. Each of these
    // is a table somebody might reasonably put in, and the reason says why it is not in YET.
    for (const t of ["nutrition_targets", "goniometer_baselines", "skill_day_logs", "movement_screens"]) {
      expect(NOT_A_SIGNAL_TABLE[t], `${t} must stay classified`).toBeDefined();
      expect(NOT_A_SIGNAL_TABLE[t]).toContain("CANDIDATE");
    }
  });

  it("reads the outside instrument's velocity, which is the whole point of the audit", () => {
    expect(ANVIL_SIGNAL_TABLES.imported_testing_data).toBeDefined();
    expect(ANVIL_SIGNAL_TABLES.imported_testing_data).toMatch(/not the camera/i);
    expect(ANVIL_SIGNAL_TABLES.coach_athletes).toMatch(/PARKED/);
  });
});
