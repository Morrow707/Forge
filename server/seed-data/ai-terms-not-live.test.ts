import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AI_TERMS_OF_USE } from "./ai-terms-of-use-draft";

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
    expect(seed).not.toContain("AI_TERMS_OF_USE");
    expect(read("server/routes.ts")).not.toContain("AI_TERMS_OF_USE");
  });

  it("no longer carries the four clauses that made the first version unusable", () => {
    // Fixed in the second revision. Asserted rather than remembered, because each one was a
    // contradiction of something Forge already tells people.

    // The entire-agreement clause names what survives it -- Forge's only two instruments where
    // somebody gives up a right or grants a consent are among them.
    for (const survivor of [
      "the Forge signup agreement",
      "the Assumption of Risk and Release",
      "the Video and Biometric Information Release",
      "the Privacy Policy",
    ]) {
      expect(AI_TERMS_OF_USE, survivor).toContain(survivor);
    }
    // No promise of a document nobody has written.
    expect(AI_TERMS_OF_USE).not.toMatch(/internal Data Protection Policy/);
    // The age rule is what tier1_under13 plus the guardian gate actually do.
    expect(AI_TERMS_OF_USE).toContain("An athlete under 13 may use the Service only through an account provisioned by their coach");
    // Output from a User's own data is theirs, or a coach sending an athlete their programme is
    // in breach of it.
    expect(AI_TERMS_OF_USE).toContain(
      "Output generated for a User derived from that User's own input data is owned by the User",
    );
  });

  it("matches the governing law and venue every other document names", () => {
    expect(AI_TERMS_OF_USE).toContain("laws of the State of Arizona");
    expect(AI_TERMS_OF_USE).toContain("Maricopa County, Arizona");
    expect(AI_TERMS_OF_USE).toContain("without giving effect to any choice or conflict of law");
  });

  it("is still missing the minor-rights carve-out the others carry", () => {
    // Documents the gap rather than hiding it: GOVERNING_LAW_CLAUSE ends "Nothing here waives a
    // right that cannot lawfully be waived, including a right belonging to a person under 18."
    // Beside an unqualified indemnification clause that sentence matters MORE, not less. When it
    // is added, flip this assertion -- do not delete the test.
    expect(AI_TERMS_OF_USE).not.toMatch(/cannot lawfully be waived/);
  });

  it("carries the three clauses it was generated for", () => {
    expect(AI_TERMS_OF_USE).toContain("Indemnification.");
    expect(AI_TERMS_OF_USE).toContain('provided on an "as is" basis');
    expect(AI_TERMS_OF_USE).toContain("Limitation of Liability");
  });

  it("names no dispute path that conflicts with the live documents", () => {
    // Mediation only. Binding arbitration and a class-action waiver are the two things a
    // platform with minors on it should not be quietly adopting from a template.
    expect(AI_TERMS_OF_USE).toContain("settle the dispute by mediation");
    expect(AI_TERMS_OF_USE).not.toMatch(/binding arbitration/i);
    expect(AI_TERMS_OF_USE).not.toMatch(/class action waiver|class-action waiver/i);
    // Mediation comes BEFORE litigation rather than instead of it -- nobody gives up a court.
    expect(AI_TERMS_OF_USE).toContain("before pursuing formal litigation");
  });
});
