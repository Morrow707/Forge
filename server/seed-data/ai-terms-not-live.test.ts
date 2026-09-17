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
    // The age rule is what the guardian gate actually does, and it says the same thing section 3
    // of the live signup agreement says, because they describe the same gate. Two errors were
    // caught here: NOBODY under 18 uses Forge independently, and an under-13 CAN self-register
    // (the route stopped refusing them, or a twelve-year-old with no coach had no way in).
    expect(AI_TERMS_OF_USE).toContain("A User who is 18 or older may register and use the Service on their own");
    expect(AI_TERMS_OF_USE).toContain("held and cannot be used until that has happened");
    expect(AI_TERMS_OF_USE).not.toMatch(/at least 13 years or older/);
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

  it("carries the minor-rights carve-out the other documents carry", () => {
    // Was asserted as ABSENT in the second revision and flipped here, as that test said to do.
    // Beside an indemnification clause it matters more, not less.
    expect(AI_TERMS_OF_USE).toContain(
      "Nothing here waives a right that cannot lawfully be waived, including a right belonging to a person under 18.",
    );
  });

  it("does not put an indemnification obligation on a child", () => {
    // Several states limit or void one imposed on a minor. It falls on the guardian who
    // permitted the use, and only as far as the law allows.
    expect(AI_TERMS_OF_USE).toContain(
      "Where the User is under 18, this obligation is undertaken by the parent or legal guardian",
    );
    expect(AI_TERMS_OF_USE).toContain("only to the extent permitted by applicable law");
  });

  it("is a supplement to the signup agreement, not a rival to it", () => {
    // The whole reason the scope question mattered: an entire-agreement clause is only safe
    // while "the Service" is the AI features rather than the platform. Define it loosely and
    // this becomes a second general agreement competing with the one people actually accept.
    expect(AI_TERMS_OF_USE).toContain(
      '"Service" means the artificial intelligence features within the Forge platform',
    );
    expect(AI_TERMS_OF_USE).toContain(
      "Use of the Forge platform generally is governed by the Forge signup agreement",
    );
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

describe("the age rule, against the gate that enforces it", () => {
  const authSrc = read("server/auth.ts");

  it("does not claim under-13s are turned away at signup", () => {
    // They are not. The route used to refuse them and send them to find a coach, which left a
    // twelve-year-old without one no way in at all; a comment saying otherwise survived the
    // change and read as the rule.
    expect(authSrc).toContain("Under-13 athletes CAN sign themselves up");
    expect(authSrc).not.toMatch(/only tier2 reaches this: tier1 is\s*\n?\s*\/\/ already rejected above/);
  });

  it("agrees with what the live signup agreement tells people", () => {
    const signup = read("server/seed-data/signup-agreement.ts");
    // Both documents describe one gate. If they ever disagree, one of them is lying to somebody
    // about whether a child's account works.
    expect(signup).toContain("You may create an account for yourself if you are 18 or older.");
    expect(AI_TERMS_OF_USE).toContain("A User who is 18 or older may register and use the Service on their own");
    for (const doc of [signup, AI_TERMS_OF_USE]) {
      expect(doc).toMatch(/every athlete under 18 however they arrived/);
    }
  });
});
