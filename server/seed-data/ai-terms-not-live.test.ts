import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AI_TERMS_OF_USE_ROCKET_LAWYER } from "./ai-terms-of-use-draft";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** The Rocket Lawyer AI terms are ON RECORD, NOT IN FORCE.
 *
 * Four clauses in it contradict what Forge already tells people, and one of them -- the
 * entire-agreement clause -- carves out only the data and privacy policies, so a user accepting
 * it could argue it superseded the assumption-of-risk release and the biometric release. Those
 * are the only two documents where somebody gives up a right or grants a consent.
 *
 * So this pins the gap between "we have the text" and "people have agreed to it". Wiring it up
 * is a deliberate act that has to break this test first.
 */
describe("the generated AI terms", () => {
  it("is not seeded, shown, or accepted anywhere", () => {
    const seed = read("server/seed.ts");
    expect(seed).not.toContain("AI_TERMS_OF_USE_ROCKET_LAWYER");
    expect(read("server/routes.ts")).not.toContain("AI_TERMS_OF_USE_ROCKET_LAWYER");
  });

  it("still carries the clauses that make it unusable as-is", () => {
    // If one of these ever stops matching, the document was edited -- at which point it is no
    // longer the received text, and the header's account of what is wrong with it is stale.
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).toContain("supersedes all prior or contemporaneous");
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).toContain("internal Data Protection Policy");
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).toContain("at least 13 years or older");
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).toContain(
      "Ownership and intellectual property rights of the Output belong to the Company",
    );
  });

  it("carries the three clauses it was generated for", () => {
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).toContain("Indemnification.");
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).toContain('provided on an "as is" basis');
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).toContain("Limitation of Liability");
  });

  it("names no dispute path that conflicts with the live documents", () => {
    // Mediation only. Binding arbitration and a class-action waiver are the two things a
    // platform with minors on it should not be quietly adopting from a template.
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).toContain("settle the dispute by mediation");
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).not.toMatch(/binding arbitration/i);
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).not.toMatch(/class action waiver|class-action waiver/i);
    expect(AI_TERMS_OF_USE_ROCKET_LAWYER).toContain("laws of Arizona");
  });
});
