import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONSENT_CATALOG } from "@shared/consent-catalog";
import { consentTypeEnum } from "@shared/schema";

/**
 * "WHAT YOU'VE AGREED TO" IS ON THE PAGE, AND THE GUARDIAN CAN REACH IT.
 *
 * The routes are proved in server/account-consents.itest.ts. This checks the two surfaces that
 * show them: the documents page renders the card for the viewer's own account and for
 * /documents/:athleteId through the guardian and coach routes, and the guardian dashboard
 * summarises the child's rows and links to that page -- which is also the guardian's only nav
 * entry to the child's documents.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "..", ...p), "utf8");
const documents = read("client", "src", "pages", "documents.tsx");
const guardian = read("client", "src", "pages", "guardian-dashboard.tsx");

describe("documents.tsx", () => {
  it("renders the agreed-to card from all three consents routes", () => {
    expect(documents).toContain("What you've agreed to");
    expect(documents).toContain('"/api/account/consents"');
    expect(documents).toMatch(/\/api\/guardian\/athletes\/\$\{[a-zA-Z]+\}\/consents/);
    expect(documents).toMatch(/\/api\/coach\/roster\/\$\{[a-zA-Z]+\}\/consents/);
  });

  it("links every row to its page and its PDF from the server's row, never a client-side map", () => {
    expect(documents).toContain("row.page");
    expect(documents).toContain("row.pdfUrl");
    expect(documents).not.toContain('"/biometric-release"');
  });

  it("shows stale and withdrawn as their own states, and fails a read out loud", () => {
    expect(documents).toContain("Needs re-accepting");
    expect(documents).toContain("Withdrawn");
    expect(documents).toMatch(/AgreedToCard[\s\S]*isError[\s\S]*<ReadFailed/);
  });
});

describe("guardian-dashboard.tsx", () => {
  it("summarises the child's agreements and links to /documents/:athleteId", () => {
    expect(guardian).toMatch(/\/api\/guardian\/athletes\/\$\{[a-zA-Z]+\}\/consents/);
    expect(guardian).toMatch(/href=\{`\/documents\/\$\{athleteId\}`\}/);
    expect(guardian).toContain("re-accepting");
  });
});

describe("shared/consent-catalog.ts", () => {
  it("names every consent type the schema knows, with a page for every document a person signs", () => {
    for (const type of consentTypeEnum.enumValues) {
      expect(CONSENT_CATALOG[type]?.label, type).toBeTruthy();
    }
    // The ones with a public page in App.tsx: a row that says "you agreed to this" must open it.
    const app = read("client", "src", "App.tsx");
    for (const [type, entry] of Object.entries(CONSENT_CATALOG)) {
      if (!entry.page || entry.page === "/documents") continue;
      expect(app, `${type} -> ${entry.page}`).toContain(`path="${entry.page}"`);
    }
  });
});
