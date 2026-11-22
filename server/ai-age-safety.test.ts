import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The coaching AI is told the athlete's real age (from the birthdate, never the
// stale users.age column), and is told that loading is decided by weight-room
// proficiency, never by that age. Scott, 2026-11-22: "age doesn't matter in the
// weight room, its about weight room proficiency, a 12 year old can back squat
// the bar if a) they are strong enough to hold 45lbs on their backs, and b) they
// can show that they can do a back squat correctly and safely".
const stripComments = (src: string) =>
  src
    // Block comments: "/* a */" goes; "a / b" has none.
    // https://regex101.com/?regex=%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&flags=g&testString=x%20%2F*%20a%20*%2F%20y
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Line comments not inside a URL or a string opener: "x // y" loses "// y"; "http://a" keeps it.
    // https://regex101.com/?regex=(%5E%7C%5B%5E%3A%22'%60%5D)%5C%2F%5C%2F.*%24&flags=gm&testString=x%20%2F%2F%20y%0Ahttp%3A%2F%2Fa
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const storage = stripComments(readFileSync(join(__dirname, "storage.ts"), "utf8"));

const constant = (name: string) => {
  const at = storage.indexOf(`const ${name} = \``);
  expect(at, name).toBeGreaterThan(-1);
  return storage.slice(at, storage.indexOf("`;", at));
};

describe("the coaching AI is told how old the athlete actually is", () => {
  it("builds the profile age line from the birthdate, not the stale column", () => {
    expect(storage).toContain("- Age: ${ageLineForAi(user.dateOfBirth, user.age)}");
    expect(storage).not.toContain('- Age: ${user.age != null ? user.age : "not set"}');
  });

  it("does the same for the readiness briefing", () => {
    expect(storage).toContain("ageLineForAi(athlete.dateOfBirth, athlete.age)");
  });
});

/** The two skill prompts that load the skill rules: the draft and the chat builder. */
const SKILL_PROMPTS = 2;

describe("readiness to load is proficiency, never age", () => {
  it("the barbell rules name the two conditions and refuse an age limit", () => {
    const rules = constant("TRAINING_READINESS_PRINCIPLES");
    expect(rules).toContain("weight-room proficiency, never by age");
    expect(rules).toContain("correctly and safely");
    expect(rules).toContain("never write an age limit into a program");
  });

  it("no age band survives in either rule set", () => {
    // The removed bands: "Children (not yet showing signs of puberty ...)" and "Adolescents".
    [constant("TRAINING_READINESS_PRINCIPLES"), constant("SKILL_READINESS_PRINCIPLES")].forEach((rules) => {
      expect(rules).not.toContain("Children (");
      expect(rules).not.toContain("Adolescents (");
      // The word "minor" on its own: matches "a minor"; rejects "a minority of sessions".
      // https://regex101.com/?regex=%5Cbminors%3F%5Cb&flags=i&testString=a%20minority%20of%20sessions
      expect(rules).not.toMatch(/\bminors?\b/i);
    });
  });

  it("every prompt that loads the rules applies them to every athlete", () => {
    expect(storage).not.toContain("Age-appropriate training rules");
    expect(storage).not.toContain("Age-appropriate skill rules");
    expect(storage).not.toContain("AGE_APPROPRIATE_");
    // The skill rules interpolated into a prompt: matches "${SKILL_READINESS_PRINCIPLES}"; rejects
    // "const SKILL_READINESS_PRINCIPLES".
    // https://regex101.com/?regex=%5C%24%5C%7BSKILL_READINESS_PRINCIPLES%5C%7D&flags=g&testString=%24%7BSKILL_READINESS_PRINCIPLES%7D
    const uses = storage.match(/\$\{SKILL_READINESS_PRINCIPLES\}/g) ?? [];
    expect(uses).toHaveLength(SKILL_PROMPTS);
  });

  it("keeps the skills rules separate from the barbell ones", () => {
    // The barbell constant is written in %1RM and rep ranges that mean nothing for drill work.
    const skill = constant("SKILL_READINESS_PRINCIPLES");
    expect(skill).not.toContain("1RM");
    expect(skill.toLowerCase()).toContain("overuse");
  });
});
