import { describe, it, expect } from "vitest";
import {
  ANVIL_MINIMUM_AGE_YEARS,
  ageInYears,
  anvilEligibility,
  type AnvilSubject,
} from "./anvil-eligibility";
import {
  ANVIL_ACCURACY_CAVEAT,
  ANVIL_AGREEMENT,
  ANVIL_AGREEMENT_NEVER_CLAIMS,
  ANVIL_NOT_A_MEDICAL_TEST,
} from "./anvil-agreement";
import { ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST } from "./roles-that-film-their-own-training";

const TODAY = "2026-11-07";
const adult = (over: Partial<AnvilSubject> = {}): AnvilSubject => ({
  role: "athlete",
  dateOfBirth: "1995-03-04",
  hasAnvilConsent: true,
  trackingOptOut: false,
  ...over,
});

describe("no minor takes the Anvil, and that is not a configuration", () => {
  it("refuses a 17-year-old who has done everything else right", () => {
    const v = anvilEligibility(adult({ dateOfBirth: "2009-01-01" }), TODAY);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("minor_pending_counsel");
  });

  it("refuses them the DAY BEFORE their eighteenth and allows them on it", () => {
    const dob = "2008-11-07";
    expect(anvilEligibility(adult({ dateOfBirth: dob }), "2026-11-06").allowed).toBe(false);
    expect(anvilEligibility(adult({ dateOfBirth: dob }), "2026-11-07").allowed).toBe(true);
  });

  it("checks age BEFORE consent, so a minor is never asked to tick something we would refuse", () => {
    const v = anvilEligibility(
      adult({ dateOfBirth: "2012-05-05", hasAnvilConsent: false }),
      TODAY,
    );
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("minor_pending_counsel");
  });

  it("refuses an account with no date of birth rather than guessing", () => {
    const v = anvilEligibility(adult({ dateOfBirth: null }), TODAY);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("age_unknown");
  });

  it("holds the age at the majority line, not at COPPA's", () => {
    // The four blocked counsel questions are about minors as a class, not about under-13s.
    expect(ANVIL_MINIMUM_AGE_YEARS).toBe(18);
  });
});

describe("who it is for", () => {
  it("offers it to every role that films its own training, read from the set", () => {
    for (const role of ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST) {
      expect(anvilEligibility(adult({ role }), TODAY).allowed, role).toBe(true);
    }
  });

  it("does not offer it to a guardian", () => {
    const v = anvilEligibility(adult({ role: "guardian" }), TODAY);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("role_does_not_train");
  });

  it("honours the camera opt-out", () => {
    const v = anvilEligibility(adult({ trackingOptOut: true }), TODAY);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("tracking_opted_out");
  });

  it("asks an adult for the Anvil's own agreement", () => {
    const v = anvilEligibility(adult({ hasAnvilConsent: false }), TODAY);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("needs_the_anvil_agreement");
  });

  it("gives every refusal a sentence a screen can render", () => {
    const refusals = [
      adult({ role: "guardian" }),
      adult({ dateOfBirth: null }),
      adult({ dateOfBirth: "2012-01-01" }),
      adult({ trackingOptOut: true }),
      adult({ hasAnvilConsent: false }),
    ].map((s) => anvilEligibility(s, TODAY));
    for (const v of refusals) {
      expect(v.allowed).toBe(false);
      if (!v.allowed) {
        expect(v.says.length).toBeGreaterThan(20);
        expect(v.says).toMatch(/\.$/);
      }
    }
    expect(new Set(refusals.map((v) => (v.allowed ? "" : v.reason))).size).toBe(5);
  });
});

describe("ageInYears is arithmetic and has no clock", () => {
  it("counts whole years across a birthday", () => {
    expect(ageInYears("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageInYears("2000-02-29", "2026-03-01")).toBe(26);
    expect(ageInYears("2008-11-07", "2026-11-07")).toBe(18);
  });

  it("returns null rather than a negative age for a future or unparseable date", () => {
    expect(ageInYears("2030-01-01", TODAY)).toBeNull();
    expect(ageInYears("not a date", TODAY)).toBeNull();
  });
});

describe("the agreement says what the software does and claims nothing else", () => {
  it("refuses the words the vocabulary module forbids on a screen", () => {
    const body = ANVIL_AGREEMENT.toLowerCase();
    // The agreement is the first thing a person reads about the Anvil, so it is the worst place
    // for a word that is a health claim. "concussion" appears only in the sentence refusing it.
    for (const w of ["readiness", "recovery", "freshness", "neuro-fatigue", "neural fatigue"]) {
      expect(body, `the agreement must not say "${w}"`).not.toContain(w);
    }
  });

  it("really contains every refusal it declares", () => {
    // The declaration earns the module its exemption from the never-models scan, so it must not
    // be able to drift from the text: deleting the sentence that refuses concussion fails here.
    const body = ANVIL_AGREEMENT.toLowerCase();
    for (const claim of ANVIL_AGREEMENT_NEVER_CLAIMS) {
      expect(body, `the agreement declares it refuses "${claim}" and must say so`).toContain(claim);
    }
    expect(ANVIL_AGREEMENT_NEVER_CLAIMS).toContain("concussion");
  });

  it("carries the two sentences every other surface renders, so they cannot drift", () => {
    // Both are constants because they are read in more than one place -- the agreement itself,
    // the weekly printout, and whatever screen comes next -- and both say something that stops
    // being true the day a threshold is checked against a reference instrument. A surface that
    // re-typed either would be a second wording for counsel to review under question 18, and
    // the vocabulary sweep over an Anvil surface is what catches a re-typed copy.
    expect(ANVIL_AGREEMENT).toContain(ANVIL_ACCURACY_CAVEAT);
    expect(ANVIL_AGREEMENT).toContain(ANVIL_NOT_A_MEDICAL_TEST);
    // And each says the thing it exists to say, so neither can be hollowed out to a blank that
    // still satisfies the containment above.
    expect(ANVIL_ACCURACY_CAVEAT.toLowerCase()).toContain("not calibrated");
    expect(ANVIL_NOT_A_MEDICAL_TEST.toLowerCase()).toContain("not a concussion test");
  });

  it("states the four things a reader needs and the one they must not assume", () => {
    const body = ANVIL_AGREEMENT.toLowerCase();
    expect(body).toContain("not a medical test");
    expect(body).toContain("not a concussion test");
    expect(body).toContain("not calibrated");
    expect(body).toContain("your coach sees");
    expect(body).toContain("18 and over");
  });
});
