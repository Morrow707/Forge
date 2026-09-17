import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// A DOCUMENT YOU ARE ASKED TO AGREE TO HAS TO BE ONE YOU CAN OPEN.
//
// Every consent surface in this app linked its document with target="_blank".
// That works on the web and does nothing at all inside the native app:
// WKWebView has no tabs, and Capacitor opens no window for a _blank link
// unless an app explicitly wires one up. So on an iPhone -- which is the whole
// TestFlight audience -- the link under "Read the full video and biometric
// release" was inert, and the same was true of the assumption-of-risk release,
// the account menu's "Training risks" item, the athlete claim page's terms,
// and all four documents on the guardian claim form, which is the one a parent
// uses to consent on behalf of a child.
//
// Nothing caught it because every one of them was correct markup pointing at a
// real, working page. The defect was only ever visible from inside the app, and
// the one test that covered a link like this asserted its href string, which
// was right the whole time.
const CLIENT = join(__dirname, "..");

// Where someone is asked to agree to something, or to go back and re-read it.
const CONSENT_SURFACES = [
  "components/biometric-release-dialog.tsx",
  "components/assumption-of-risk-dialog.tsx",
  "components/app-shell.tsx",
  "pages/claim.tsx",
  "pages/guardian-claim.tsx",
];

// The in-app routes that render one of Forge's own legal documents. A link to
// one of these is the thing being tested; a link to a coach's uploaded video or
// an outside site is a genuine external link and none of this applies to it.
const LEGAL_ROUTES = [
  "/legal",
  "/terms",
  "/privacy",
  "/eula",
  "/biometric-release",
  "/assumption-of-risk",
  "/ai-terms",
];

describe("legal documents on a consent surface", () => {
  for (const file of CONSENT_SURFACES) {
    const source = readFileSync(join(CLIENT, file), "utf8");

    it(`${file} opens them somewhere WKWebView can follow`, () => {
      for (const route of LEGAL_ROUTES) {
        // An anchor to a legal route is allowed; one that asks for a new window
        // is not, because there is no window to open on native.
        const anchors = source.matchAll(
          new RegExp(`<a\\b[^>]*href="${route}"[^>]*>`, "gs"),
        );
        for (const [tag] of anchors) {
          expect(tag, `${file} -> ${route}`).not.toContain("_blank");
        }
        // Same for the attribute-order-independent multi-line form these are
        // actually written in: an <a ...> spanning lines with both on it.
        const multiline = source.matchAll(/<a\s[^>]*?>/gs);
        for (const [tag] of multiline) {
          if (tag.includes(`href="${route}"`)) {
            expect(tag, `${file} -> ${route}`).not.toContain("_blank");
          }
        }
      }
    });
  }

  // The reader these were replaced with fetches the real document rather than
  // restating it in the component, so a document edited by an admin is the one
  // the athlete is shown.
  it("reads the live document rather than a copy pasted into a component", () => {
    const reader = readFileSync(join(CLIENT, "components/legal-document-reader.tsx"), "utf8");
    expect(reader).toContain("/api/legal-documents/${docType}");
    expect(reader).toContain("/api/legal-agreement");
  });

  // Opening a document must not be capable of answering the question.
  //
  // The reader is a <button>, and a <button> inside a <label> activates that
  // label's control -- so dropping it inline where the old <a> sat would have
  // made "read the release" silently tick "I consent". Both claim forms put it
  // beside the label instead, and this is what keeps it there.
  it("never puts the reader inside the label that agrees to it", () => {
    for (const file of ["pages/claim.tsx", "pages/guardian-claim.tsx"]) {
      const source = readFileSync(join(CLIENT, file), "utf8");
      for (const [block] of source.matchAll(/<label\b[\s\S]*?<\/label>/g)) {
        expect(block, file).not.toContain("<LegalDocumentReader");
      }
    }
  });
});

// Guards the surfaces themselves: a new consent screen that links a legal
// document the old way would not be covered by the list above, because the
// list is hand-maintained. This finds them.
describe("consent surfaces this test does not know about", () => {
  it("has no _blank link to a legal document anywhere in the client", () => {
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".tsx")) {
          const source = readFileSync(full, "utf8");
          for (const [tag] of source.matchAll(/<a\s[^>]*?>/gs)) {
            if (!tag.includes("_blank")) continue;
            for (const route of LEGAL_ROUTES) {
              if (tag.includes(`href="${route}"`)) offenders.push(`${full} -> ${route}`);
            }
          }
        }
      }
    }
    walk(CLIENT);
    expect(offenders).toEqual([]);
  });
});
