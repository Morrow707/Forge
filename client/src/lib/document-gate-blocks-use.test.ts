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
  const freeAgent = documentAudienceFor({ role: "athlete", hasCoach: false });

  it("blocks an account with nothing on file", () => {
    expect(missingRequiredDocuments(freeAgent, {}).length).toBeGreaterThan(0);
  });

  it("clears once every REQUIRED document is accepted", () => {
    const all = Object.fromEntries(
      REQUIRED_DOCUMENTS[freeAgent].map((d) => [d.kind, "accepted" as const]),
    );
    expect(missingRequiredDocuments(freeAgent, all)).toEqual([]);
  });

  it("does not block on a document nobody was asked for", () => {
    // Only required rows count. A recommended document nobody has is not a gap, and counting it
    // would lock every athlete out forever over a row they were never asked to satisfy.
    const requiredOnly = Object.fromEntries(
      REQUIRED_DOCUMENTS[freeAgent].filter((d) => d.required).map((d) => [d.kind, "accepted" as const]),
    );
    expect(missingRequiredDocuments(freeAgent, requiredOnly)).toEqual([]);
  });

  it("does not block while OUR review queue is the hold-up", () => {
    // They uploaded what was asked for. Blocking here punishes somebody for our backlog.
    const pending = Object.fromEntries(
      REQUIRED_DOCUMENTS[freeAgent].map((d) => [d.kind, "pending_review" as const]),
    );
    expect(missingRequiredDocuments(freeAgent, pending)).toEqual([]);
  });

  it("does not hold up a beta tester over a document that needs a physician", () => {
    // Requiring a doctor's signature before anybody may open a workout is right on the day
    // Forge charges money and wrong today -- it would be an empty beta, not a gate.
    const nothing = {};
    expect(missingRequiredDocuments(freeAgent, nothing, { beta: true }).map((d) => d.kind))
      .not.toContain("medical_clearance");
    // ...and the deferral is exactly that, not a quiet removal: outside beta it blocks again.
    expect(missingRequiredDocuments(freeAgent, nothing).map((d) => d.kind))
      .toContain("medical_clearance");
  });

  it("keeps the deferred row ON the checklist", () => {
    // Hiding it would mean nobody uploads one until the day it suddenly locks them out.
    for (const kind of BETA_DEFERRED_DOCUMENTS) {
      expect(REQUIRED_DOCUMENTS[freeAgent].map((d) => d.kind)).toContain(kind);
    }
  });

  it("blocks again when a clearance has expired", () => {
    const expired = Object.fromEntries(
      REQUIRED_DOCUMENTS[freeAgent].map((d) => [d.kind, "expired" as const]),
    );
    expect(missingRequiredDocuments(freeAgent, expired).length).toBeGreaterThan(0);
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
