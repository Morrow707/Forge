import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A HUMAN CHANGING THE TERMS HAS TO SEND THE GUARDIAN HALF OF THE NOTICE.
 *
 * Counsel's rule is actual notice plus a chance to accept or reject. The adult half needs
 * nothing wired: storage.getTermsAcceptanceStatus compares the live document with the
 * snapshot on the account, so a changed document puts itself in front of every adult at
 * their next request. The guardian half is an EMAIL and has to be called for -- a minor
 * cannot answer, and the person who must may not open the app for weeks.
 *
 * notifyGuardiansOfTermsChange was wired to the seed alone, and the seed only ever upgrades
 * a document it still recognises as a version Forge shipped (nextSignupAgreement returns
 * null for an admin's own wording). So from 2026-09-19 an edit made through the admin editor
 * re-asked every adult on the platform and emailed no guardian at all: the half that works by
 * itself worked, and the half that needs a call was never called. The same class as the
 * Coaches Corner lesson re-sync and the Barbell Shoulder Press instructions -- a correction
 * that only ever landed on a path nobody takes.
 *
 * So this scans rather than asserting one route: the failure is a WRITE PATH with no notice
 * beside it, and the next such path will not be on anybody's list. server/terms-reacceptance
 * .itest.ts drives the real route end to end; these are the two things a text scan can see
 * and an itest cannot -- that no OTHER route writes this document silently, and the order the
 * one that does reads and writes it in.
 */

const SERVER_DIR = resolve(import.meta.dirname);
const WRITES_THE_AGREEMENT = "storage.updateLegalAgreement(";
const NOTIFIER = "notifyGuardiansOfTermsChange";

/** Every server source file, so a route moved into its own module is still covered. Tests are
 * excluded: a test writing the agreement directly is the fixture doing its job. */
function serverSources(): Array<{ name: string; text: string }> {
  return readdirSync(SERVER_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .filter((e) => !e.name.includes(".test.") && !e.name.includes(".itest."))
    .map((e) => ({ name: e.name, text: readFileSync(resolve(SERVER_DIR, e.name), "utf8") }));
}

/** The body of the handler registered at `path`, from the registration to the line that closes
 * it. Scoping to the handler is the point: the file containing the notifier somewhere is not
 * the same claim as this route calling it. */
function handlerBody(text: string, path: string): string {
  const at = text.indexOf(`"${path}"`);
  expect(at).toBeGreaterThan(-1);
  const end = text.indexOf("\n  });", at);
  expect(end).toBeGreaterThan(at);
  return text.slice(at, end);
}

describe("every route that rewrites the live terms", () => {
  it("has the guardian notice in the same file", () => {
    // The seed writes this document too, three times, and deliberately notifies for only one of
    // them -- the other two append or patch the clinician notice, which every reader of the
    // document strips, so they are not a change of terms. That is why this asks for the notifier
    // to be PRESENT in a writing file rather than beside each write: the seed's own guard is a
    // condition, not a line next to the call.
    const offenders = serverSources()
      .filter((f) => f.text.includes(WRITES_THE_AGREEMENT))
      .filter((f) => !f.text.includes(NOTIFIER))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it("is one of the two paths that exist, so a third cannot arrive unnoticed", () => {
    const writers = serverSources()
      .filter((f) => f.text.includes(WRITES_THE_AGREEMENT))
      .map((f) => f.name)
      .sort();
    // seed.ts is the deploy path (a version Forge shipped); routes.ts is the admin editor.
    expect(writers).toEqual(["routes.ts", "seed.ts"]);
  });
});

describe("the admin editor's own route", () => {
  const routes = readFileSync(resolve(SERVER_DIR, "routes.ts"), "utf8");
  const body = handlerBody(routes, "/api/admin/legal-agreement");

  it("imports the notifier it calls", () => {
    expect(routes).toContain(`from "./terms-change-notice"`);
    expect(routes).toContain(`from "./seed-data/signup-agreement"`);
  });

  it("calls the notifier after saving", () => {
    expect(body).toContain(NOTIFIER);
    expect(body.indexOf(WRITES_THE_AGREEMENT)).toBeLessThan(body.indexOf(NOTIFIER));
  });

  it("reads the old document BEFORE overwriting it", () => {
    // Read it after the save and the comparison is between the new text and itself, which is
    // never a change -- the notifier would then never fire and every case below would still pass.
    const read = body.indexOf("storage.getLegalAgreement()");
    const write = body.indexOf(WRITES_THE_AGREEMENT);
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(write);
  });

  it("notifies only on a real change, judged by the same reduction the acceptance check uses", () => {
    expect(body).toContain("coreAgreementText");
    // The call is inside a conditional, not run on every save: a no-op re-save of the live
    // document must not email a single guardian, and the clinician notice the seed appends is
    // not a change of terms.
    const guard = body.indexOf("coreAgreementText(content) !==");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf(NOTIFIER));
  });

  it("cannot lose the saved document to a mail failure", () => {
    // The save is what this route is for. The notifier is per-guardian best-effort internally;
    // this catch is for the notifier itself throwing.
    const notify = body.indexOf(NOTIFIER);
    const tried = body.lastIndexOf("try {", notify);
    const caught = body.indexOf("} catch", notify);
    expect(tried).toBeGreaterThan(-1);
    expect(caught).toBeGreaterThan(notify);
  });

  it("tells the admin what the save did", () => {
    // An admin pressing Save is entitled to know that every account was just re-asked and how
    // many guardians were written to, rather than hearing about it from the platform.
    const response = body.slice(body.indexOf("res.json("));
    expect(response).toContain("termsChanged");
    expect(response).toContain("guardiansEmailed");
  });
});
