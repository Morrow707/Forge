import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE COACH CAN SEND PAPERWORK FROM THE APP, AND IS TOLD WHAT LEFT.
 *
 * Two routes exist for it (server/coach-roster-document-emails.itest.ts proves them); this checks
 * the screen actually offers them. A route with no control is a feature nobody has, and a toast
 * that says "asked 3 athletes" when the mail never left is the silence the delivery report was
 * added to end.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "..", ...p), "utf8");
const page = read("client", "src", "pages", "coach", "athlete-documents.tsx");

describe("coach/athlete-documents.tsx", () => {
  it("offers 'send a document to your roster' against the sendable list, with a confirm step", () => {
    expect(page).toContain("Send a document to your roster");
    expect(page).toContain("/api/coach/legal-documents/sendable");
    expect(page).toContain("/api/coach/legal-documents/email-roster/recipients");
    expect(page).toMatch(/\/api\/coach\/legal-documents\/\$\{[a-zA-Z]+\}\/email-roster/);
    // The document list is never typed into the client.
    expect(page).not.toContain('"privacy_policy"');
    expect(page).not.toContain('"biometric_waiver"');
  });

  it("the request toast counts what was emailed and what was in-app only, with the reason", () => {
    expect(page).toContain("emailed`");
    expect(page).toContain("in-app only");
    expect(page).toContain("no email address");
    expect(page).toContain("not_configured");
    expect(page).toContain("send_failed");
  });

  it("reads through isError rather than defaulting a failed read to an empty list", () => {
    expect(page).toContain("sendableFailed");
    expect(page).toContain("countFailed");
    expect(page).toContain("<ReadFailed");
  });
});
