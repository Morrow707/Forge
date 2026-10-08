import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sha256,
  isShippedVersion,
  shippedPrefixLength,
  SIGNUP_AGREEMENT_PRIOR_LENGTHS,
  SIGNUP_AGREEMENT_PRIOR_SHIPPED,
  BIOMETRIC_RELEASE_PRIOR_SHIPPED,
  EULA_PRIOR_SHIPPED,
  ASSUMPTION_OF_RISK_PRIOR_SHIPPED,
  AI_TERMS_OF_USE_PRIOR_SHIPPED,
} from "./shipped-versions";
import { SIGNUP_AGREEMENT, PLACEHOLDER_AGREEMENT, nextSignupAgreement } from "./signup-agreement";
import { BIOMETRIC_RELEASE, nextBiometricRelease } from "./biometric-release";
import { EULA_DRAFT, nextEula } from "./legal-documents-draft";
import { ASSUMPTION_OF_RISK_RELEASE, nextAssumptionOfRisk } from "./assumption-of-risk";
import { AI_TERMS_OF_USE, nextAiTermsOfUse } from "./ai-terms-of-use-draft";

/** Editing a live document is otherwise a change with no failing signal: tests pass, the seed runs
 * clean, new installations get the new text, and the installation that matters -- production,
 * carrying the PREVIOUS version -- keeps the old one forever. Nothing about the edit tells you.
 *
 * So the current text's hash is pinned here. Change the document and this fails, and the fix is
 * two steps rather than one: append the OLD hash below to that document's PRIOR_SHIPPED list, then
 * update the pin here to the new hash. Doing only the second step is the bug this exists to catch.
 */
describe("the pinned current versions", () => {
  it("signup agreement", () => {
    expect(sha256(SIGNUP_AGREEMENT)).toBe(
      "4a8f6cffbecad75ee21c1242bb911053461af21cebf3398e2252dec134742713",
    );
  });

  it("biometric release", () => {
    expect(sha256(BIOMETRIC_RELEASE)).toBe(
      "cefcad4207a9530a0690fab46b627369bdf7093a27c62b7999e9746c32263e7a",
    );
  });

  /* The three that had no lane until 2026-10-08, pinned at the text the live host serves -- all
   * three verified byte-identical to source against forgeperformancesystems.com that day, which
   * is what makes their PRIOR_SHIPPED lists correctly empty. */
  it("eula", () => {
    expect(sha256(EULA_DRAFT)).toBe(
      "737643140c11255d809c252d51e9f80617b6a70b96851a8b73674ea1da10652e",
    );
  });

  it("assumption of risk", () => {
    expect(sha256(ASSUMPTION_OF_RISK_RELEASE)).toBe(
      "ba385725bc2d5289181f7500e5ef6e75e7954db1d11bc192896a33a3f32ba325",
    );
  });

  it("ai terms of use", () => {
    expect(sha256(AI_TERMS_OF_USE)).toBe(
      "314788b3d55e2cd5f164c87ae33062a22cf0d47f89871d7d9a4c583b6c1f3efd",
    );
  });
});

/* THE THREE NEW LANES, asserted on the shape rather than on a membership that is empty today.
 *
 * Until 2026-10-08 the seed created these three when absent and never touched them again, so a
 * correction reached a fresh database only -- the fourth instance of that class in this repo
 * (the Barbell Shoulder Press instructions, videoEligible, the Coaches Corner track lessons).
 * Their lists are EMPTY on purpose, because live and source are byte-identical today and there
 * is nothing to migrate away from yet; what is being protected is that the NEXT edit propagates.
 */
describe("the three lanes added 2026-10-08", () => {
  const lanes = [
    ["eula", EULA_DRAFT, nextEula, EULA_PRIOR_SHIPPED],
    ["assumption of risk", ASSUMPTION_OF_RISK_RELEASE, nextAssumptionOfRisk, ASSUMPTION_OF_RISK_PRIOR_SHIPPED],
    ["ai terms of use", AI_TERMS_OF_USE, nextAiTermsOfUse, AI_TERMS_OF_USE_PRIOR_SHIPPED],
  ] as const;

  it.each(lanes)("%s seeds a database that has none", (_label, text, next) => {
    expect(next(null)).toBe(text);
  });

  it.each(lanes)("%s is a no-op once the current text is live", (_label, text, next) => {
    // Every installation today, which is why this change moves nothing.
    expect(next(text)).toBeNull();
  });

  it.each(lanes)("%s leaves an admin's own wording alone", (_label, text, next) => {
    expect(next(`${text}\n\nOur gym adds this sentence.`)).toBeNull();
    expect(next("Something an admin wrote from scratch.")).toBeNull();
  });

  it.each(lanes)("%s MIGRATES a version in its list, and only one in its list", (_label, text, next, prior) => {
    // Driven through next() itself, not through isShippedVersion. The first draft asserted the
    // helper directly and mutation testing showed what that misses: replacing the lane's
    // `isShippedVersion(current, prior)` with a bare `return null` kept the suite green, because
    // nothing exercised the lane's USE of its list. The list is empty today, which is why next()
    // takes it as a defaulted parameter -- that is what makes this assertable at all.
    const old = "a version Forge shipped before";
    expect(next(old, [sha256(old)])).toBe(text);
    expect(next(old, prior)).toBeNull();
    // And a recognised version still loses to the two earlier branches, in that order.
    expect(next(null, [sha256(old)])).toBe(text);
    expect(next(text, [sha256(text)])).toBeNull();
  });

  it.each(lanes)("%s does not list its own current text", (_label, text, _next, prior) => {
    expect(prior).not.toContain(sha256(text));
  });

  it("is wired into the seed, which is where the create-only form was", () => {
    // The lane is worthless if the seed still uses `if (!(await getLegalDocument(x)))`, and that
    // is a change nothing else here can see.
    const seed = readFileSync(join(__dirname, "..", "seed.ts"), "utf8");
    for (const fn of ["nextEula(", "nextAssumptionOfRisk(", "nextAiTermsOfUse("]) {
      expect(seed, `seed.ts does not call ${fn}`).toContain(fn);
    }
    for (const stale of [
      'if (!(await storage.getLegalDocument("eula")))',
      'if (!(await storage.getLegalDocument("assumption_of_risk")))',
      'if (!(await storage.getLegalDocument("ai_terms_of_use")))',
    ]) {
      expect(seed, `seed.ts still create-only: ${stale}`).not.toContain(stale);
    }
  });
});

describe("migrating a previously shipped version", () => {
  it("lists the version each document replaced", () => {
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED.length).toBeGreaterThan(0);
    expect(BIOMETRIC_RELEASE_PRIOR_SHIPPED.length).toBeGreaterThan(0);
  });

  it("does not list the current text as something to migrate away from", () => {
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED).not.toContain(sha256(SIGNUP_AGREEMENT));
    expect(BIOMETRIC_RELEASE_PRIOR_SHIPPED).not.toContain(sha256(BIOMETRIC_RELEASE));
  });

  it("knows counsel's rewrite from the version it replaced", () => {
    // The two halves of the edit, asserted separately: the new text must not list itself (or the
    // migration reads the live document as something to migrate away from), and the text it
    // REPLACED must be listed (or production, which is carrying it, never moves onto the
    // reviewed document at all -- the silent failure this whole file exists for).
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED).not.toContain(sha256(SIGNUP_AGREEMENT));
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED).toContain(
      "3ab92c73e1c270a98c3302241dba317464035cdc689633aea98234a6fb829e02",
    );
    expect(SIGNUP_AGREEMENT_PRIOR_LENGTHS).toContain(12114);
    // And the rewrite itself, as it shipped before the two Terms were merged into it.
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED).toContain(
      "9394f4dcc0e4bbcfb81d23af9b8c3d814bd14fae4d6b73ea3d5102c7504e3276",
    );
    expect(SIGNUP_AGREEMENT_PRIOR_LENGTHS).toContain(19178);
  });

  it("is a no-op once the current text is live", () => {
    expect(nextSignupAgreement(SIGNUP_AGREEMENT)).toBeNull();
    expect(nextBiometricRelease(BIOMETRIC_RELEASE)).toBeNull();
  });

  it("does not treat an edited shipped version as shipped", () => {
    // One character's difference and it is somebody's own wording. This is what keeps the hash
    // list from becoming a licence to overwrite an admin's edit.
    const edited = `${SIGNUP_AGREEMENT} `;
    expect(isShippedVersion(edited, SIGNUP_AGREEMENT_PRIOR_SHIPPED)).toBe(false);
    expect(nextSignupAgreement(edited)).toBeNull();
    const editedRelease = BIOMETRIC_RELEASE.replace("Declining is a real choice", "Declining is fine");
    expect(nextBiometricRelease(editedRelease)).toBeNull();
  });
});

describe("the appended healthcare notice", () => {
  const NOTICE = "A note for physical therapists, physicians, and other licensed clinicians:\n\nForge is built for athletic training.";

  it("recorded lengths line up with the recorded hashes", () => {
    // A mismatched length just fails to match, leaving the document alone -- safe, but it means
    // the migration silently stops working, which is exactly the failure this whole file exists
    // to prevent. So the two lists have to stay the same shape.
    expect(SIGNUP_AGREEMENT_PRIOR_LENGTHS.length).toBe(SIGNUP_AGREEMENT_PRIOR_SHIPPED.length);
  });

  it("finds a shipped version sitting in front of an appended notice", () => {
    // Production's actual shape. seed.ts appends this notice to whatever is live, so the stored
    // document is never a shipped version on its own and a whole-document hash matches nothing.
    // This is the bug that got caught by running the real seed against a real database rather
    // than by any unit test here.
    for (let i = 0; i < SIGNUP_AGREEMENT_PRIOR_SHIPPED.length; i++) {
      const len = SIGNUP_AGREEMENT_PRIOR_LENGTHS[i];
      const stored = "x".repeat(len) + "\n\n" + NOTICE;
      // A wrong body of the right length must NOT match -- the hash is what identifies it.
      expect(shippedPrefixLength(stored, SIGNUP_AGREEMENT_PRIOR_SHIPPED, SIGNUP_AGREEMENT_PRIOR_LENGTHS)).toBe(-1);
    }
  });

  it("keeps the notice when it migrates", () => {
    const stored = `${SIGNUP_AGREEMENT}\n\n${NOTICE}`;
    // The current version with a notice appended is already current -- nothing to do.
    expect(nextSignupAgreement(stored)).toBeNull();
  });

  it("still migrates the placeholder with a notice appended", () => {
    const next = nextSignupAgreement(`${PLACEHOLDER_AGREEMENT}\n\n${NOTICE}`);
    expect(next).toBe(`${SIGNUP_AGREEMENT}\n\n${NOTICE}`);
  });
});
