import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BETA_DEFERRED_DOCUMENTS,
  REQUIRED_DOCUMENTS,
  documentAudienceFor,
  missingRequiredDocuments,
} from "@shared/required-documents";

const gate = readFileSync(join(__dirname, "..", "components", "document-gate.tsx"), "utf8");
const banner = readFileSync(
  join(__dirname, "..", "components", "documents-outstanding-banner.tsx"),
  "utf8",
);
const seed = readFileSync(join(process.cwd(), "server", "seed.ts"), "utf8");

/**
 * BROWSE, BUT NOT USE. Scott, 2026-09-22: "they can browse, but not use ... give them a warning
 * when they first login". The rule itself is pure and lives in shared/, so it is tested for real
 * rather than scanned for.
 */
describe("what the document gate actually blocks", () => {
  // The mechanism is exercised on an audience that still has required paperwork (a rostered
  // athlete's participation waiver). A Free Agent has NONE since 2026-11-17 and gets cases of
  // their own below.
  const freeAgent = documentAudienceFor({ role: "athlete", hasCoach: false });
  const rostered = documentAudienceFor({ role: "athlete", hasCoach: true });

  it("blocks a rostered account with nothing on file", () => {
    expect(missingRequiredDocuments(rostered, {}).map((d) => d.kind)).toEqual(["participation_waiver"]);
  });

  it("clears once every REQUIRED document is accepted", () => {
    const all = Object.fromEntries(
      REQUIRED_DOCUMENTS[rostered].map((d) => [d.kind, "accepted" as const]),
    );
    expect(missingRequiredDocuments(rostered, all)).toEqual([]);
  });

  it("does not block on a document nobody was asked for", () => {
    // Only required rows count. A recommended document nobody has is not a gap, and counting it
    // would lock every athlete out forever over a row they were never asked to satisfy.
    const requiredOnly = Object.fromEntries(
      REQUIRED_DOCUMENTS[rostered].filter((d) => d.required).map((d) => [d.kind, "accepted" as const]),
    );
    expect(missingRequiredDocuments(rostered, requiredOnly)).toEqual([]);
  });

  it("does not block while OUR review queue is the hold-up", () => {
    // They uploaded what was asked for. Blocking here punishes somebody for our backlog.
    const pending = Object.fromEntries(
      REQUIRED_DOCUMENTS[rostered].map((d) => [d.kind, "pending_review" as const]),
    );
    expect(missingRequiredDocuments(rostered, pending)).toEqual([]);
  });

  it("blocks again when a required document has expired", () => {
    const expired = Object.fromEntries(
      REQUIRED_DOCUMENTS[rostered].map((d) => [d.kind, "expired" as const]),
    );
    expect(missingRequiredDocuments(rostered, expired).map((d) => d.kind)).toEqual(["participation_waiver"]);
  });

  /* A MEDICAL CLEARANCE NEVER STOPS ANYBODY TRAINING. Scott, 2026-11-17, the week 1.0 went live:
   * a coworker signed up as a Free Agent and could not open a workout because the gate wanted a
   * physician's letter. "free agents, don't need a medical waiver ... that was more just a coaches
   * could upload to see it was there not necessarily a necessity." These used to assert the
   * opposite ("outside beta it blocks again"), which is the rule that walled him out. */
  it("never blocks a Free Agent: with nothing on file, expired, or rejected", () => {
    expect(REQUIRED_DOCUMENTS[freeAgent].filter((d) => d.required)).toEqual([]);
    expect(missingRequiredDocuments(freeAgent, {})).toEqual([]);
    for (const status of ["expired", "rejected", "missing"] as const) {
      const every = Object.fromEntries(REQUIRED_DOCUMENTS[freeAgent].map((d) => [d.kind, status]));
      expect(missingRequiredDocuments(freeAgent, every), status).toEqual([]);
    }
  });

  it("never blocks ANY athlete on the medical clearance, whatever its state", () => {
    for (const audience of [freeAgent, rostered]) {
      for (const status of ["missing", "expired", "rejected"] as const) {
        expect(
          missingRequiredDocuments(audience, { medical_clearance: status }).map((d) => d.kind),
          `${audience} ${status}`,
        ).not.toContain("medical_clearance");
      }
    }
  });

  it("keeps the medical clearance ON both athlete checklists, so one can still be filed and seen", () => {
    // Optional is not removed: the row is how an athlete uploads one and how a coach sees it.
    for (const kind of BETA_DEFERRED_DOCUMENTS) {
      expect(REQUIRED_DOCUMENTS[freeAgent].map((d) => d.kind)).toContain(kind);
      expect(REQUIRED_DOCUMENTS[rostered].map((d) => d.kind)).toContain(kind);
    }
  });
});

describe("the wall and the way through it", () => {
  it("asks the server rather than deriving the answer", () => {
    expect(gate).toContain('queryKey: ["/api/account/document-compliance"]');
  });

  it("treats unknown as neither allowed nor blocked", () => {
    // Defaulting to blocked flashes a wall at somebody whose paperwork is fine; defaulting to
    // allowed lets the first tap through, which is the thing the gate exists to stop.
    expect(gate).toContain("if (blocked === undefined) return;");
    expect(gate).toContain("if (blocked === true) {");
  });

  it("names each missing document instead of saying 'some documents'", () => {
    expect(gate).toContain("{missing.map((doc) => (");
    expect(gate).toContain("{doc.label}");
    expect(gate).toContain("{doc.why}");
  });

  it("has a button that actually navigates", () => {
    // The ask was explicit: "click here to navigate to them, and make sure that button works".
    expect(gate).toContain('navigate("/documents")');
    expect(gate).toContain("Take me to my documents");
  });

  it("warns on the dashboard, and stays silent for an account in good standing", () => {
    expect(banner).toContain("if (blocked !== true) return null;");
    expect(banner).toContain("Your documents aren't done yet");
  });
});

describe("only the three demo accounts are papered past the gate by the seed", () => {
  // From 2026-10-11 to 2026-10-28 the seed papered nobody, because the demo accounts were
  // retired. They are back for social-media screenshots (DEMO_ACCOUNT_PASSWORDS on Render,
  // server/demo-accounts.ts) and come with accepted placeholder documents again, so a screenshot
  // does not carry a red warning about paperwork that cannot exist. The rule this pins is the
  // one that made the old block safe: a placeholder that claims to be a physician's clearance may
  // be filed ONLY against a demo address, inside the function that creates those accounts, and
  // must say in words that it is demo data.
  const stripComments = (src: string) =>
    src.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*\n?/gm, "").replace(/^[ \t]*\/\/[^\n]*\n?/gm, "");
  const code = stripComments(seed);
  const fnStart = code.indexOf("async function ensureDemoAccounts(");
  const fnEnd = code.indexOf("\nasync function ", fnStart + 1);
  const ensureDemoAccounts = code.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
  const outside = code.slice(0, fnStart) + code.slice(fnEnd === -1 ? code.length : fnEnd);

  it("files the placeholders inside ensureDemoAccounts, iterating the demo addresses only", () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(ensureDemoAccounts).toContain('reviewSource: "seed_demo_account"');
    expect(ensureDemoAccounts).toContain('fileUrl: "seed://demo-account-placeholder"');
    expect(ensureDemoAccounts).toMatch(/for \(const email of DEMO_ACCOUNT_EMAILS\)/);
    // The row it files against is the demo account just created, never a looked-up user.
    expect(ensureDemoAccounts).toMatch(/athleteId: rows\[email\]\.id/);
  });

  it("files them against nobody else", () => {
    expect(outside).not.toContain("seed_demo_account");
    expect(outside).not.toContain("seed://demo-account-placeholder");
    expect(outside).not.toContain("createExternalWaiver(");
  });

  it("says in words that the row is demo data, and only ever marks it accepted (never pending)", () => {
    expect(ensureDemoAccounts).toContain('issuingOrganization: "Forge demo data -- not a real document"');
    expect(ensureDemoAccounts).toContain('reviewStatus: "accepted"');
    expect(ensureDemoAccounts).not.toContain('reviewStatus: "pending_review"');
    expect(seed).toContain("removeSeededDemoAccounts");
  });
});
