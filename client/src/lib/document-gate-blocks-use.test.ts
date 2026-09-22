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

describe("the demo accounts are not locked out of the app they demonstrate", () => {
  it("seeds their required documents", () => {
    // Their addresses deliver nowhere and they have no physician to ask, so without this the
    // three seeded accounts could never clear the gate. Same shape as the device-trust
    // exemption: a fact about the software, not an operator's decision.
    expect(seed).toContain("for (const demo of [athlete, freeAgent])");
    expect(seed).toContain('reviewSource: "seed_demo_account"');
    expect(seed).toContain('reviewStatus: "accepted"');
    // And it never fabricates a file that claims to be a physician's clearance.
    expect(seed).toContain('fileUrl: "seed://demo-account-placeholder"');
  });
});
