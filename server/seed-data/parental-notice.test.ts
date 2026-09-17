import { describe, it, expect } from "vitest";
import { PARENTAL_NOTICE_DRAFT, nextParentalNotice } from "./legal-documents-draft";
import { PARENTAL_NOTICE_PRIOR_SHIPPED, sha256 } from "./shipped-versions";
import { GOVERNING_LAW_CLAUSE, FORGE_CONTACT_EMAIL } from "@shared/contact";
import { TIER1_VIDEO_RETENTION_DAYS, TIER2_VIDEO_RETENTION_DAYS } from "@shared/privacy-tiers";

/** THE ONLY DOCUMENT FORGE PUSHES AT SOMEBODY.
 *
 * Everything else is published for reading or accepted at a screen. This one is emailed to a
 * parent who did not go looking for it, is the only place they are told the account exists at
 * all, and -- for an athlete under 13 -- is what guardian_coppa_consent records as the thing
 * agreed to. Every inaccuracy in it lands on somebody with no other source.
 *
 * The version it replaced had three. It said "you don't need to do anything for the account to
 * keep working" while athleteGateStatus was blocking the athlete pending a guardian claim; it
 * addressed every minor's parent as the parent of a 13-to-17-year-old; and it told an under-13's
 * guardian how to turn OFF camera tracking that starts off and is theirs to turn ON. */
describe("the notice to parent or guardian", () => {
  it("leads with the thing the parent has to do", () => {
    // The old text's worst line reassured a parent there was nothing to do, which is how an
    // athlete ends up locked out by an email that would have unlocked them. The gate is real:
    // App.tsx shows GuardianPendingPage to any athlete under 18 with no guardian link.
    const firstSection = PARENTAL_NOTICE_DRAFT.slice(0, PARENTAL_NOTICE_DRAFT.indexOf("2. WHAT FORGE IS"));
    expect(firstSection).toMatch(/DOES NOT WORK UNTIL YOU CLAIM IT/);
    expect(firstSection).toMatch(/cannot use Forge until a parent or legal guardian/);
    expect(PARENTAL_NOTICE_DRAFT).not.toMatch(/don't need to do anything/i);
  });

  it("does not address every minor's parent as a teenager's parent", () => {
    // requiresGuardianNotice is set for tier !== adult, so this goes to an under-13's guardian too.
    expect(PARENTAL_NOTICE_DRAFT).toMatch(/An athlete under 18/);
    expect(PARENTAL_NOTICE_DRAFT).not.toMatch(/Your teen \(age 13-17\)/);
  });

  it("states the camera switch in the direction that is actually theirs", () => {
    // auth.ts sets trackingOptOut for tier1_under13, so for an under-13 it starts OFF and the
    // guardian is the one who would turn it on. Telling them how to disable it described a
    // decision that was not theirs and hid the one that was.
    expect(PARENTAL_NOTICE_DRAFT).toMatch(/UNDER 13, camera tracking starts OFF/);
    expect(PARENTAL_NOTICE_DRAFT).toMatch(/13 to 17, camera tracking starts ON/);
  });

  it("keeps the true claim the old text already made about video", () => {
    // The trackers save a clip only when the athlete ticks "save clip for coach" at review.
    expect(PARENTAL_NOTICE_DRAFT).toMatch(/save clip for coach/);
    expect(PARENTAL_NOTICE_DRAFT).toMatch(/A clip they do not save is not kept/);
  });

  it("gives the retention windows the code actually enforces", () => {
    expect(PARENTAL_NOTICE_DRAFT).toContain(`${TIER1_VIDEO_RETENTION_DAYS} days after the set`);
    expect(PARENTAL_NOTICE_DRAFT).toContain(`aged 13 to 17, ${TIER2_VIDEO_RETENTION_DAYS} days`);
  });

  it("reads like the rest of Forge's documents", () => {
    expect(PARENTAL_NOTICE_DRAFT).toMatch(/^FORGE -- NOTICE TO PARENT OR GUARDIAN/);
    expect(PARENTAL_NOTICE_DRAFT).toContain(GOVERNING_LAW_CLAUSE);
    expect(PARENTAL_NOTICE_DRAFT).toContain(FORGE_CONTACT_EMAIL);
    // It is a consent document for an under-13, so it carries the clause every other one does --
    // including the sentence about a right that cannot lawfully be waived.
    expect(PARENTAL_NOTICE_DRAFT).toMatch(/a right belonging to a person under 18/);
    expect(PARENTAL_NOTICE_DRAFT).not.toMatch(/DRAFT|\[Placeholder/);
  });

  it("says Forge supervises nothing, like every other document", () => {
    expect(PARENTAL_NOTICE_DRAFT).toMatch(/Forge supervises nothing/);
  });
});

describe("migrating a stored notice", () => {
  it("replaces every version it succeeded, not just the last one", () => {
    // It listed one hash, which stranded any installation seeded before that on a notice
    // carrying three false statements -- and this document is EMAILED to a minor's parent, so a
    // stranded copy is what the next parent reads. live-document-migration.test.ts replays the
    // file's whole history to keep this honest.
    expect(PARENTAL_NOTICE_PRIOR_SHIPPED.length).toBeGreaterThan(1);
    expect(PARENTAL_NOTICE_PRIOR_SHIPPED).not.toContain(sha256(PARENTAL_NOTICE_DRAFT));
    expect(new Set(PARENTAL_NOTICE_PRIOR_SHIPPED).size).toBe(PARENTAL_NOTICE_PRIOR_SHIPPED.length);
  });

  it("seeds a fresh install and is a no-op once current", () => {
    expect(nextParentalNotice(null)).toBe(PARENTAL_NOTICE_DRAFT);
    expect(nextParentalNotice(PARENTAL_NOTICE_DRAFT)).toBeNull();
  });

  it("leaves an admin's own wording alone", () => {
    // One character's difference and it is somebody's own notice, not a version Forge shipped.
    expect(nextParentalNotice(`${PARENTAL_NOTICE_DRAFT} `)).toBeNull();
    expect(nextParentalNotice("We wrote our own notice for our club.")).toBeNull();
  });
});
