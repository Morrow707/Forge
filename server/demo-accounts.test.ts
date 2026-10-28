/** The three demo accounts: one declaration, one switch, and three aggregates they stay out of.
 * See server/demo-accounts.ts. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { DEMO_ACCOUNT_EMAILS, DEMO_ACCOUNT_EMAILS_SQL_LIST, demoAccountPasswordsFromEnv } from "./demo-accounts";

const stripComments = (src: string) =>
  src.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*\n?/gm, "").replace(/^[ \t]*\/\/[^\n]*\n?/gm, "").replace(/^\s*--[^\n]*\n?/gm, "");
const read = (f: string) => stripComments(readFileSync(resolve(__dirname, f), "utf-8"));

const good = {
  "coach@forge.app": "a-password-of-twelve-plus",
  "athlete@forge.app": "another-long-password!",
  "freeagent@forge.app": "third-long-password-2026",
};

describe("demoAccountPasswordsFromEnv", () => {
  it("is off when the variable is unset or blank", () => {
    expect(demoAccountPasswordsFromEnv({}, () => {})).toBeNull();
    expect(demoAccountPasswordsFromEnv({ DEMO_ACCOUNT_PASSWORDS: "   " }, () => {})).toBeNull();
  });
  it("accepts a JSON object with all three addresses", () => {
    expect(demoAccountPasswordsFromEnv({ DEMO_ACCOUNT_PASSWORDS: JSON.stringify(good) }, () => {})).toEqual(good);
  });
  it("refuses the whole value on a typo, a missing address or a short password, and says which without the value", () => {
    const problems: string[] = [];
    const note = (m: string) => problems.push(m);
    expect(demoAccountPasswordsFromEnv({ DEMO_ACCOUNT_PASSWORDS: "{not json" }, note)).toBeNull();
    expect(demoAccountPasswordsFromEnv({ DEMO_ACCOUNT_PASSWORDS: JSON.stringify(["x"]) }, note)).toBeNull();
    const { "freeagent@forge.app": _dropped, ...twoOfThree } = good;
    expect(demoAccountPasswordsFromEnv({ DEMO_ACCOUNT_PASSWORDS: JSON.stringify(twoOfThree) }, note)).toBeNull();
    expect(demoAccountPasswordsFromEnv({ DEMO_ACCOUNT_PASSWORDS: JSON.stringify({ ...good, "coach@forge.app": "short" }) }, note)).toBeNull();
    expect(problems).toHaveLength(4);
    for (const m of problems) {
      expect(m).toContain("DEMO_ACCOUNT_PASSWORDS");
      for (const value of Object.values(good)) expect(m).not.toContain(value);
    }
    expect(problems[2]).toContain("freeagent@forge.app");
  });
});

describe("the aggregates the demo accounts stay out of", () => {
  it("the nightly cohort norms rebuild excludes them by address", () => {
    const norms = read("cohort-norms.ts");
    expect(norms).toMatch(/AND email NOT IN \(\$\{DEMO_ACCOUNT_EMAILS_SQL_LIST\}\)/);
  });
  it("the strength percentile's peer query excludes them by address", () => {
    const storage = read("storage.ts");
    expect(storage).toMatch(/AND u\.email NOT IN \(\$\{sql\.raw\(DEMO_ACCOUNT_EMAILS_SQL_LIST\)\}\)/);
  });
  it("the SQL list is the three quoted addresses and nothing else", () => {
    expect(DEMO_ACCOUNT_EMAILS_SQL_LIST).toBe("'coach@forge.app', 'athlete@forge.app', 'freeagent@forge.app'");
    expect(DEMO_ACCOUNT_EMAILS).toHaveLength(3);
  });
});

describe("the seed invents nothing for them", () => {
  const seed = read("seed.ts");
  it("creates no assignment, logged set, class grant or ownership transfer keyed on a demo account", () => {
    expect(seed).not.toMatch(/submitWorkoutLog\(athlete\.id/);
    expect(seed).not.toMatch(/createAssignment\(\s*coach\.id/);
    expect(seed).not.toMatch(/grantFullClassAccessToAthlete\(freeAgent\.id/);
    expect(seed).not.toMatch(/transferExerciseOwnership\(coach\.id/);
  });
  it("creates the three only from the switch and retires them without it", () => {
    expect(seed).toMatch(/if \(demoAccountPasswords\) await ensureDemoAccounts\(demoAccountPasswords\);/);
    expect(seed).toMatch(/await removeSeededDemoAccounts\(demoAccountPasswords !== null\);/);
  });
});
