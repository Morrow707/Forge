import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** WHERE A DOCUMENT CAN BE REACHED, CHECKED AGAINST WHAT THE SERVER SERVES.
 *
 * Three findings from the 2026-09-20 documents audit, each a surface that had quietly stopped
 * matching the routes behind it:
 *
 * - The AI Terms of Use were seeded, routed, public and admin-editable, and had no card on the
 *   admin Legal & Compliance page, so an admin could neither download nor email them. The Terms
 *   of Use card had no buttons at all, although the server resolved terms_of_service for both.
 * - The public legal pages showed a document with no way to keep a copy; only an admin could
 *   download one.
 * - Two pages told people the uploaded file was deleted after review. It has been kept since
 *   Scott's call on 2026-09-17 (see externalWaivers in shared/schema.ts).
 *
 * Each is a scan of the real source rather than a list, for the reason CLAUDE.md gives for every
 * other scan here: the next one will not be on anybody's list.
 */
const ROOT = join(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const routes = read("server/routes.ts");
const adminPage = read("client/src/pages/admin/documents.tsx");
const publicPage = read("client/src/pages/legal-document.tsx");

/** The string literals inside a `const NAME = [ ... ] as const;` array in routes.ts. */
function stringArray(source: string, name: string): string[] {
  const start = source.indexOf(`const ${name} = [`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("] as const;", start);
  const body = source
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return Array.from(body.matchAll(/"([a-z_]+)"/g), (m) => m[1]);
}

describe("the admin Legal & Compliance page", () => {
  it("offers download and email for every document type the server can resolve", () => {
    const types = stringArray(routes, "LEGAL_DOC_TYPES");
    expect(types.length).toBeGreaterThanOrEqual(7);
    for (const type of types) {
      // Either an editor (download + email + save) or the send-only row for the Terms, which
      // are edited in the signup agreement editor.
      expect(adminPage, type).toMatch(
        new RegExp(`<(LegalDocEditor|LegalDocSendRow) docType="${type}" />`),
      );
    }
  });

  it("does not claim a document is unreviewed", () => {
    // Per-card verdicts went stale the moment counsel answered. What is still open with counsel
    // lives in docs/legal-open-questions.md, where a reviewer reads it.
    expect(adminPage).not.toMatch(/not (yet )?reviewed by counsel/i);
    expect(adminPage).not.toMatch(/awaiting counsel/i);
    // The research card's own phrasings, from when it was a review packet: "neither has been
    // read by a lawyer", "both are drafts below", a DRAFT badge, and a warning not to send.
    expect(adminPage).not.toMatch(/read by a lawyer/i);
    expect(adminPage).not.toMatch(/are drafts/i);
    expect(adminPage).not.toMatch(/no extract should be sent/i);
    expect(adminPage).not.toMatch(/questions for counsel/i);
    expect(adminPage).not.toContain("<DraftBadge");
  });

  it("cites the export cell floor from the server rather than retyping it", () => {
    // RESEARCH_EXPORT_MIN_CELL lives in server/research-export.ts, which the client cannot
    // import. The public research_consent route reports it as exportMinCell; the card reads that.
    const card = adminPage.slice(
      adminPage.indexOf("function ResearchDataReviewCard"),
      adminPage.indexOf("export default function AdminDocuments"),
    );
    expect(card).toContain("exportMinCell");
    expect(card).not.toMatch(/\b10 athletes\b/);
    expect(card).not.toMatch(/floor of 10\b/);
    expect(routes).toMatch(/exportMinCell:\s*RESEARCH_EXPORT_MIN_CELL/);
    // And links to the page and the PDF it is describing.
    expect(card).toContain('href="/research-consent"');
    expect(card).toContain("/api/legal-documents/research_consent.pdf");
  });
});

describe("the public legal pages", () => {
  it("offer the same PDF the admin page does, from a public route", () => {
    expect(publicPage).toContain("/api/legal-documents/${docType}.pdf");
    expect(publicPage).toContain("<DownloadButton");
  });

  it("have that route registered ahead of the text route it would otherwise match", () => {
    // Express matches in registration order, and "privacy_policy.pdf" is a perfectly good :type.
    const pdf = routes.indexOf('app.get("/api/legal-documents/:type.pdf"');
    const text = routes.indexOf('app.get("/api/legal-documents/:type"');
    expect(pdf).toBeGreaterThanOrEqual(0);
    expect(text).toBeGreaterThanOrEqual(0);
    expect(pdf).toBeLessThan(text);
  });

  it("include the research consent, which is a constant and not a row", () => {
    // The one accepted text with no public page until 2026-09-20. It is served by an explicit
    // branch on both public routes and stays OUT of the enums, so it can never reach the admin
    // editor or the seed as a row somebody retypes.
    expect(publicPage).toContain('docType="research_consent"');
    expect(publicPage).toContain("export function ResearchConsentPage");
    expect(read("client/src/App.tsx")).toContain('path="/research-consent"');
    expect(read("client/src/pages/legal.tsx")).toContain('href: "/research-consent"');
    expect(stringArray(routes, "LEGAL_DOC_TYPES")).not.toContain("research_consent");
    expect(stringArray(routes, "PUBLIC_LEGAL_DOC_TYPES")).not.toContain("research_consent");
    const pdfRoute = routes.indexOf('app.get("/api/legal-documents/:type.pdf"');
    const branch = routes.indexOf("type === RESEARCH_CONSENT_DOC_TYPE", pdfRoute);
    const lookup = routes.indexOf("if (!isPublicLegalDocType(type))", pdfRoute);
    expect(branch).toBeGreaterThan(pdfRoute);
    expect(branch).toBeLessThan(lookup);
  });

  it("each have a page in App.tsx that renders through the one component with the download", () => {
    // Every exported page in legal-document.tsx is routed, and every one renders
    // LegalDocumentPage, which is where the DownloadButton lives -- so a new public page cannot
    // ship without a download.
    const app = read("client/src/App.tsx");
    const pages = Array.from(publicPage.matchAll(/export function (\w+Page)\(/g), (m) => m[1]);
    expect(pages.length).toBeGreaterThanOrEqual(7);
    for (const page of pages) {
      expect(app, page).toContain(`component={${page}}`);
      const body = publicPage.slice(publicPage.indexOf(`export function ${page}(`));
      expect(body.slice(0, body.indexOf("}\n")), page).toContain("<LegalDocumentPage");
    }
  });

  it("serve every public type from the same set the page can request", () => {
    const publicTypes = stringArray(routes, "PUBLIC_LEGAL_DOC_TYPES");
    for (const type of publicTypes) {
      expect(publicPage, type).toContain(`docType="${type}"`);
    }
  });

  /* THE ASSERTION ABOVE CHECKS ONE DIRECTION, AND THE OTHER ONE IS WHERE THE BUG WAS.
   *
   * "Every public type has a page" cannot see a document that is seeded, attorney-reviewed,
   * admin-editable and simply never made public -- the set it iterates does not contain it. On
   * 2026-10-08 a fetch of the live host found `parental_notice` 404ing on both public routes
   * where the other six served, and it had been missing since the public set was written. Seven
   * documents served and the eighth did not, and no test in this repo could tell.
   *
   * The Notice to Parent or Guardian is also the worst one to lose: it is the single document
   * addressed to somebody who may have no account and no reason to make one, so "it is emailed
   * to them" is the whole of its delivery, and a guardian who deleted that email had nowhere
   * to go. It is now public, and the two sets are exactly equal.
   *
   * Stated as an equality with a named-exemptions list rather than a subset, for the same
   * reason FITTED_OVERRIDES is empty in the camera tunables registry: the machinery for a
   * divergence exists, the list is empty, and putting something in it costs a sentence of
   * justification that shows up in a grep. A subset assertion in either direction alone is
   * what let this through.
   */
  const NOT_PUBLIC_ON_PURPOSE: { type: string; why: string }[] = [
    // Empty. institutional_agreement is NOT a candidate: it is absent from LEGAL_DOC_TYPES too
    // (a signed PDF a coach uploads, filled from shared/institutional-service-agreement.ts by
    // its own route), so it is outside both sets rather than exempt from one.
  ];

  it("make every document an admin can resolve publicly readable, with no silent exceptions", () => {
    const adminTypes = stringArray(routes, "LEGAL_DOC_TYPES");
    const publicTypes = stringArray(routes, "PUBLIC_LEGAL_DOC_TYPES");
    expect(adminTypes.length).toBeGreaterThanOrEqual(7);

    const exempt = new Set(NOT_PUBLIC_ON_PURPOSE.map((e) => e.type));
    for (const e of NOT_PUBLIC_ON_PURPOSE) {
      // An entry with no reason is the silence this assertion exists to break.
      expect(e.why.length, e.type).toBeGreaterThan(40);
      expect(adminTypes, e.type).toContain(e.type);
    }

    const missing = adminTypes.filter((t) => !publicTypes.includes(t) && !exempt.has(t));
    expect(missing, "seeded and reviewed, but has no public page or PDF").toEqual([]);

    // And the other way, so a type can never be served publicly without the admin side that
    // edits and emails it -- which is the surface an admin uses to correct a reviewed document.
    const orphaned = publicTypes.filter((t) => !adminTypes.includes(t));
    expect(orphaned, "publicly served with no admin editor behind it").toEqual([]);
  });

  it("gives the notice to a parent a page, a PDF and a link a guardian can find", () => {
    // Named explicitly beside the scan, so a rename cannot leave the scan passing over a set
    // that no longer contains this document. The three surfaces a guardian actually reaches:
    // the route, the index of public documents, and the consent record that says they agreed.
    expect(stringArray(routes, "PUBLIC_LEGAL_DOC_TYPES")).toContain("parental_notice");
    expect(read("client/src/App.tsx")).toContain('path="/parent-notice"');
    expect(read("client/src/pages/legal.tsx")).toContain('href: "/parent-notice"');
    // The consent-catalog entry carried page: null and pdfType: null while there was nothing to
    // point at, so "What you've agreed to" listed the one document addressed to the reader and
    // offered no way to reread it.
    const catalog = read("shared/consent-catalog.ts");
    const entry = catalog.slice(catalog.indexOf("parental_notice_ack: {"));
    const body = entry.slice(0, entry.indexOf("},"));
    expect(body).toContain('page: "/parent-notice"');
    expect(body).toContain('pdfType: "parental_notice"');
  });

  /* NOT "/guardian-notice", which is what this page was first called for one commit.
   *
   * robots.txt disallows the authed prefixes wholesale, "/guardian" among them, so a public page
   * under it would have sat in the sitemap and been blocked from crawling at the same time --
   * indexable by declaration and uncrawlable in fact. seo-head.test.ts caught it on the first
   * run, which is the whole reason that assertion exists; this pins the outcome so the path does
   * not drift back under a prefix on a later rename. */
  it("sits outside every robots-disallowed prefix", () => {
    const routesSrc = read("shared/public-routes.ts");
    expect(routesSrc).toContain('path: "/parent-notice"');
    expect(routesSrc).not.toContain('path: "/guardian-notice"');
    expect(read("client/src/App.tsx")).not.toContain('path="/guardian-notice"');
  });

  /* A JSX STRING ATTRIBUTE IS A LITERAL, AND TWO PUBLIC LEGAL PAGES SHIPPED PROOF OF IT.
   *
   * The AI Terms of Use and the Research Consent pages both carried
   * otherLabel="Privacy Policy \u2192", which renders those six characters on screen rather than
   * an arrow -- JSX does not process escapes inside a quoted attribute, only inside a {"..."}
   * expression. Found 2026-10-08 while adding a third page by copying one of them, which is how
   * this class spreads. The five older pages had the real character all along. */
  it("writes the arrow on a public legal page as a character, never as an escape", () => {
    expect(publicPage).not.toMatch(/otherLabel="[^"]*\\u/);
    expect(publicPage).not.toMatch(/title="[^"]*\\u/);
    const labels = Array.from(publicPage.matchAll(/otherLabel="([^"]*)"/g), (m) => m[1]);
    expect(labels.length).toBeGreaterThanOrEqual(7);
    for (const label of labels) {
      expect(label, label).toContain("\u2192");
    }
  });
});

describe("what people are told about an uploaded file", () => {
  it.each([
    "client/src/pages/documents.tsx",
    "client/src/pages/admin/waivers.tsx",
  ])("%s does not say the file is deleted after review", (rel) => {
    const source = read(rel);
    // The one legitimate mention is the "file deleted" label for rows decided under the OLD
    // behaviour, whose files genuinely are gone. It reads "file deleted" and nothing else.
    const withoutLabel = source.replace(/"file deleted"|>file deleted</g, "");
    expect(withoutLabel).not.toMatch(/file is deleted|deletes the file|destroyed on the spot|file was destroyed/i);
  });
});
