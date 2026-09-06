import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The youth-training content in this file is well-researched and was wired to
// a trigger that rarely fired: the rules applied "whenever the request gives
// any signal the athlete isn't a physically mature adult", while the profile
// block said "Age: not set" for every self-signed-up athlete, because
// users.age is never written at signup and the real birthdate sat unused one
// column over. A 14-year-old was programmed as an adult.
const storage = readFileSync(join(__dirname, "storage.ts"), "utf8");

describe("the coaching AI is told how old the athlete actually is", () => {
  it("builds the profile age line from the birthdate, not the stale column", () => {
    expect(storage).toContain("- Age: ${ageLineForAi(user.dateOfBirth, user.age)}");
    // The bare read is what caused this.
    expect(storage).not.toContain('- Age: ${user.age != null ? user.age : "not set"}');
  });

  it("does the same for the readiness briefing", () => {
    expect(storage).toContain("ageLineForAi(athlete.dateOfBirth, athlete.age)");
  });
});

describe("age rules reach every programming path", () => {
  it("applies the strength rules from the profile, not just the request", () => {
    const trigger = storage.slice(storage.indexOf("Age-appropriate training rules"));
    expect(trigger.slice(0, 400)).toContain("athlete profile gives an age under 18");
    expect(trigger.slice(0, 400)).toContain("mandatory");
  });

  it("no longer defaults to adult when a profile age exists", () => {
    expect(storage).toContain("Only when there is no profile age AND no maturity signal");
  });

  it("gives the skills programs age rules of their own", () => {
    // Both skill prompts -- the draft and the chat builder -- loaded only
    // SKILL_PROGRAM_DESIGN_PRINCIPLES, which is entirely about practice
    // structure. Sprint, jump and throwing programming for a 13-year-old ran
    // under an adult's constraints.
    expect(storage).toContain("const AGE_APPROPRIATE_SKILL_PRINCIPLES");
    const uses = storage.match(/\$\{AGE_APPROPRIATE_SKILL_PRINCIPLES\}/g) ?? [];
    expect(uses).toHaveLength(2);
  });

  it("keeps the skills rules separate from the barbell ones", () => {
    // The resistance-training constant is written in %1RM and rep ranges that
    // mean nothing for drill work; pasting it into a skills prompt would be
    // noise rather than guidance.
    const skillConst = storage.slice(
      storage.indexOf("const AGE_APPROPRIATE_SKILL_PRINCIPLES"),
      storage.indexOf("const AGE_APPROPRIATE_TRAINING_PRINCIPLES"),
    );
    expect(skillConst).not.toContain("1RM");
    expect(skillConst.toLowerCase()).toContain("overuse");
  });
});
