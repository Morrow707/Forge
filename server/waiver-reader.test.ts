import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ACCEPTANCE IS INSTANT, WHICH MEANS THE BAR HAS TO BE EXPLICIT.
//
// A human queue was the wrong shape twice: slow for the parent, and it meant a member of staff
// opening a named child's signed medical form to confirm a signature exists. The model answers
// that and the file is destroyed, so the number of people who ever see it is zero.
//
// The cost of that is that nothing catches a wrong "yes" afterwards. So every condition for an
// automatic acceptance is pinned here, and anything the model cannot clear goes to a person --
// including the cases where the call never happened at all.
const reader = readFileSync(join(__dirname, "waiver-reader.ts"), "utf8");
const storage = readFileSync(join(__dirname, "storage.ts"), "utf8");
const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");

describe("what it takes to be accepted without a human", () => {
  it("requires all of: legible, right kind, signed, and confident", () => {
    const rule = reader.slice(reader.indexOf("const accept ="), reader.indexOf("if (accept)"));
    expect(rule).toContain("v.legible");
    expect(rule).toContain("v.matchesDeclaredKind");
    expect(rule).toContain("v.documentKind === input.declaredKind");
    expect(rule).toContain("v.isSigned");
    expect(rule).toMatch(/v\.confidence >= 0\.\d/);
  });

  it("treats a blank signature line as unsigned", () => {
    // The single most likely wrong "yes": every one of these forms has a signature line on it.
    expect(reader).toMatch(/A blank signature line is false/);
  });

  it("sends the cases where the model never answered to a person", () => {
    // Unconfigured, rate-limited, refused, malformed, too big, or a format the API cannot read.
    // None of these are an acceptance.
    for (const marker of [
      'if (raw == null)',
      'if (!parsed.success)',
      "MAX_AI_BYTES",
      "Can't read ${mime} automatically",
    ]) {
      expect(reader, marker).toContain(marker);
    }
    // And none of those paths can return "accepted".
    const bailouts = reader.split("decision: \"needs_human\"").length - 1;
    expect(bailouts).toBeGreaterThanOrEqual(5);
  });

  it("does not ask the model whether the document is legally valid", () => {
    // It cannot answer that from a scan and Forge does not claim it.
    expect(reader).toMatch(/You are a reader, not a lawyer/);
    expect(reader).toMatch(/NOT judging whether the document is legally valid/);
  });

  it("runs on the cheap model", () => {
    // Mechanical, once per upload -- CLAUDE.md's standing rule for per-item work.
    expect(reader).toContain("model: fastModel");
  });
});

// THE FILE IS KEPT. A release covers somebody only if it can be produced, and a row saying a
// document was seen, with no document behind it, proves nothing on the day it is asked for.
// (Scott, 2026-09-17. The previous rule destroyed the scan on every decision.)
describe("what happens to the file", () => {
  it("survives an automatic acceptance", () => {
    const fn = storage.slice(
      storage.indexOf("async acceptExternalWaiverFromAi"),
      storage.indexOf("async flagExternalWaiverForHuman"),
    );
    expect(fn).not.toContain("purgeExternalWaiverFile");
  });

  it("survives a human decision too, accept or reject", () => {
    // A rejection keeps it as well: it is what an appeal argues over, and a rejection can be
    // wrong.
    const fn = storage.slice(
      storage.indexOf("async reviewExternalWaiver"),
      storage.indexOf("async externalWaiverSummary"),
    );
    expect(fn).not.toContain("purgeExternalWaiverFile");
  });

  it("goes when the account goes, rather than outliving the row that points at it", () => {
    // external_waivers cascades away with the user, so a kept file whose row is gone can never
    // be produced for anyone and is simply disk nobody can reach.
    const fn = storage.slice(
      storage.indexOf("async deleteOwnAccount"),
      storage.indexOf("async deleteOwnAccount") + 12000,
    );
    expect(fn).toMatch(/externalWaivers\.fileUrl[\s\S]{0,400}deleteUploadedFile/);
  });

  it("refuses a stored path that tries to escape the uploads root", () => {
    const fn = storage.slice(
      storage.indexOf("async purgeExternalWaiverFile"),
      storage.indexOf("async acceptExternalWaiverFromAi"),
    );
    expect(fn).toContain('rel.includes("..")');
  });
});

describe("the upload route", () => {
  it("reads and decides inside the request rather than queueing", () => {
    const fn = routes.slice(routes.indexOf('app.post(\n    "/api/waivers/:athleteId"'));
    // Wide enough to reach past the kind-belongs-on-this-profile check added 2026-09-20.
    const body = fn.slice(0, 6000);
    expect(body).toContain("await readUploadedWaiver");
    expect(body).toContain("acceptExternalWaiverFromAi");
  });

  it("keeps the upload when the read itself falls over", () => {
    // The row is written before the read, so a failed read leaves a pending document rather
    // than losing the parent's form.
    expect(routes).toContain("waiver auto-read failed:");
  });
});
