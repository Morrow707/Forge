import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_DOCUMENTS,
  DOCUMENT_LABEL,
  documentAudienceFor,
} from "@shared/required-documents";
import { externalWaiverKindEnum, roleEnum } from "@shared/schema";
import { ROLES_THAT_FILM_THEIR_OWN_TRAINING } from "@shared/roles-that-film-their-own-training";

// ONE FLOW, THREE PEOPLE BEING ASKED DIFFERENT QUESTIONS.
//
// The upload mechanics are identical -- a file, an issuer, an expiry, a review -- and the
// paperwork is not. Flattening them into one checklist asks a free agent for a school waiver
// nobody ever issued them, and asks a coach for medical clearance to participate in training
// they do not do. A row a person can never satisfy teaches them to ignore every other row.
describe("who is asked for what", () => {
  it("asks a rostered athlete for the school's waiver and a free agent for nothing of the kind", () => {
    const rostered = REQUIRED_DOCUMENTS.athlete_rostered.map((d) => d.kind);
    const freeAgent = REQUIRED_DOCUMENTS.athlete_free_agent.map((d) => d.kind);
    expect(rostered).toContain("participation_waiver");
    // There is no institution to have issued one.
    expect(freeAgent).not.toContain("participation_waiver");
    // What still matters when you train alone: whether training is safe for you does not depend
    // on who, if anyone, is watching.
    expect(freeAgent).toContain("medical_clearance");
  });

  it("asks a coach about supervising, never about participating", () => {
    const coach = REQUIRED_DOCUMENTS.coach.map((d) => d.kind);
    expect(coach).toContain("background_check");
    expect(coach).toContain("cpr_first_aid");
    // A coach is not being cleared to train.
    expect(coach).not.toContain("participation_waiver");
    expect(coach).not.toContain("medical_clearance");
  });

  it("routes an athlete by whether anyone actually coaches them", () => {
    expect(documentAudienceFor({ role: "athlete", hasCoach: true })).toBe("athlete_rostered");
    expect(documentAudienceFor({ role: "athlete", hasCoach: false })).toBe("athlete_free_agent");
    expect(documentAudienceFor({ role: "coach", hasCoach: false })).toBe("coach");
  });

  // EVERY ROLE THE DATABASE CAN STORE IS ONE THIS HELPER HAS BEEN TOLD ABOUT.
  //
  // The three cases above enumerate the profiles somebody thought of, which is exactly how the
  // guardian was missed for three weeks: `documentAudienceFor` tested two role strings, the
  // pgEnum has four, and the untested one fell through to the ATHLETE branch -- so /documents
  // told a parent in red that they owed their school's participation waiver and a physician's
  // clearance to train. A fall-through to a training checklist is silent by construction: there
  // is no error, just the wrong list.
  //
  // So this discovers the roles from `roleEnum` instead of listing them, and states what is
  // FORBIDDEN: no role may land on an ATHLETE audience unless it actually trains.
  it("NO ROLE FALLS THROUGH TO AN ATHLETE'S CHECKLIST UNLESS IT TRAINS", () => {
    const athleteAudiences = new Set(["athlete_rostered", "athlete_free_agent"]);
    for (const role of roleEnum.enumValues) {
      for (const hasCoach of [true, false]) {
        const audience = documentAudienceFor({ role, hasCoach });
        // Every answer has to be a declared audience -- a typo would otherwise index
        // REQUIRED_DOCUMENTS to undefined and render an empty page that reads as a failed load.
        expect(REQUIRED_DOCUMENTS[audience], `${role} resolved to an unknown audience`).toBeDefined();
        if (athleteAudiences.has(audience)) {
          expect(
            ROLES_THAT_FILM_THEIR_OWN_TRAINING.has(role),
            `${role} is served an athlete's checklist -- participation waiver, medical clearance ` +
              `-- and does not train on Forge. That is the guardian defect of 2026-10-22.`,
          ).toBe(true);
        }
      }
    }
  });

  it("a guardian is asked for NOTHING, and the emptiness is the answer", () => {
    // Asserted as the rule rather than as "length is 0", so a future change that gives a
    // guardian a row has to say which row and why: nothing on this list may be about the
    // holder's own training or their supervising through Forge, and those are the only two
    // things this checklist is for.
    expect(documentAudienceFor({ role: "guardian", hasCoach: false })).toBe("guardian");
    expect(documentAudienceFor({ role: "guardian", hasCoach: true })).toBe("guardian");
    expect(REQUIRED_DOCUMENTS.guardian).toEqual([]);
    // And the two rows the fall-through used to show them, named so a regression is legible.
    const guardianKinds = REQUIRED_DOCUMENTS.guardian.map((d) => d.kind);
    expect(guardianKinds).not.toContain("participation_waiver");
    expect(guardianKinds).not.toContain("medical_clearance");
  });

  it("every audience in the type has a list, and every list an audience", () => {
    // The two halves held EQUAL rather than one iterating the other: a subset assertion is
    // blind to exactly the omission it looks like it covers, which is the lesson the public
    // legal documents paid for when `parental_notice` 404'd for as long as the set existed.
    const declared = Object.keys(REQUIRED_DOCUMENTS).sort();
    expect(declared).toEqual(["athlete_free_agent", "athlete_rostered", "coach", "guardian"]);
  });

  it("every kind the database accepts has a label", () => {
    // A kind added to the enum and not here renders as a blank row rather than failing, which
    // is the quiet way a checklist starts lying.
    for (const kind of externalWaiverKindEnum.enumValues) {
      expect(DOCUMENT_LABEL[kind], kind).toBeTruthy();
    }
  });

  it("every required document is one the enum can actually store", () => {
    const valid = new Set<string>(externalWaiverKindEnum.enumValues);
    for (const docs of Object.values(REQUIRED_DOCUMENTS)) {
      for (const doc of docs) expect(valid.has(doc.kind), doc.kind).toBe(true);
    }
  });

  it("says why each one is being asked for", () => {
    // A checklist that only names documents gets abandoned; one that says what each is for
    // gets filled in.
    for (const docs of Object.values(REQUIRED_DOCUMENTS)) {
      for (const doc of docs) expect(doc.why.length, doc.kind).toBeGreaterThan(20);
    }
  });
});

describe("the page these feed", () => {
  const page = readFileSync(join(__dirname, "..", "pages", "documents.tsx"), "utf8");

  it("is one page for every role rather than three", () => {
    expect(page).toContain("documentAudienceFor");
    expect(page).toContain("REQUIRED_DOCUMENTS[audience]");
  });

  it("makes a red cross a link to the fix, not a dead icon", () => {
    // The point of a checklist is to be one tap from the thing it is complaining about.
    expect(page).toContain("onClick={() => startUpload(doc.kind)}");
    expect(page).toContain("scrollIntoView");
  });

  it("does not claim an uploaded form covers Forge", () => {
    expect(page).toMatch(/can't confirm a form signed with someone else covers Forge/);
  });
});
