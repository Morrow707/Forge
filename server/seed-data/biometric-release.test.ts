import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  BIOMETRIC_RELEASE,
  BIOMETRIC_WAIVER_DRAFT_SNAPSHOT_PREFIX,
  nextBiometricRelease,
} from "./biometric-release";
import { BIOMETRIC_WAIVER_DRAFT } from "./legal-documents-draft";
import { FORGE_CONTACT_EMAIL, GOVERNING_LAW_CLAUSE } from "@shared/contact";

describe("migrating the stored biometric release", () => {
  it("recognises the draft that shipped", () => {
    // The prefix is reassembled independently of legal-documents-draft.ts, so if that file's
    // banner or title is ever reworded the migration would stop matching and an installation
    // would keep the draft forever. Asserted rather than assumed.
    expect(BIOMETRIC_WAIVER_DRAFT.startsWith(BIOMETRIC_WAIVER_DRAFT_SNAPSHOT_PREFIX)).toBe(true);
    expect(nextBiometricRelease(BIOMETRIC_WAIVER_DRAFT)).toBe(BIOMETRIC_RELEASE);
  });

  it("recognises the draft after the contact-address patch edited it in place", () => {
    // This document has already been edited once by a previous seed migration, which is exactly
    // why the match is on the opening rather than the whole body.
    const patched = BIOMETRIC_WAIVER_DRAFT.replace(
      "[Placeholder -- confirm this matches what BIPA",
      `Either request can be made at ${FORGE_CONTACT_EMAIL}. [Placeholder -- confirm this matches what BIPA`,
    );
    expect(patched).not.toBe(BIOMETRIC_WAIVER_DRAFT);
    expect(nextBiometricRelease(patched)).toBe(BIOMETRIC_RELEASE);
  });

  it("seeds on a fresh install", () => {
    expect(nextBiometricRelease(null)).toBe(BIOMETRIC_RELEASE);
  });

  it("leaves an admin's own release alone", () => {
    expect(nextBiometricRelease("FORGE -- OUR OWN RELEASE\n\nWritten by counsel.")).toBeNull();
  });

  it("is idempotent", () => {
    expect(nextBiometricRelease(BIOMETRIC_RELEASE)).toBeNull();
  });
});

describe("the release text", () => {
  it("does not tell its reader not to rely on it", () => {
    // The draft's first line said "Do not treat it as legally sufficient" and its closing line
    // said signature capture must be finalised "before this is used to collect a real
    // signature" -- while being used to collect real consent.
    expect(BIOMETRIC_RELEASE).not.toMatch(/\bDRAFT\b/);
    expect(BIOMETRIC_RELEASE).not.toContain("[Placeholder");
    expect(BIOMETRIC_RELEASE).not.toMatch(/before this is used to collect a real signature/);
  });

  it("does not claim a signature nobody gives", () => {
    // Consent is a clickwrap. The draft said "by signing" twice, which described a signature
    // page that has never existed.
    expect(BIOMETRIC_RELEASE).not.toMatch(/\bBy signing\b/i);
    expect(BIOMETRIC_RELEASE).toMatch(/there is no separate signature page/);
  });

  it("describes withdrawal as the product actually implements it", () => {
    // The draft said consent lasts "until consent is withdrawn by deleting the account".
    // withdrawGuardianConsent deletes no account, and an adult can switch tracking off.
    expect(BIOMETRIC_RELEASE).toMatch(/withdrawal does not require deleting the account/);
    expect(BIOMETRIC_RELEASE).toMatch(/guardian dashboard/);
  });

  it("carries the Part 1B revisions rather than the wording they replaced", () => {
    // docs/legal-clause-revisions.md: revocable not "absolute and irrevocable", no promotional
    // use, and a right to review instead of a waiver of inspection.
    expect(BIOMETRIC_RELEASE).not.toMatch(/irrevocable/i);
    expect(BIOMETRIC_RELEASE).not.toMatch(/waives any right/i);
    expect(BIOMETRIC_RELEASE).toMatch(/does not use an athlete's video, image or likeness for advertising/);
    expect(BIOMETRIC_RELEASE).toMatch(/may view the athlete's stored video|may view their athlete's stored video/);
  });

  it("states what the capture does and does not collect", () => {
    expect(BIOMETRIC_RELEASE).toMatch(/does not perform facial recognition/);
    expect(BIOMETRIC_RELEASE).toMatch(/records no audio at all/);
    expect(BIOMETRIC_RELEASE).toMatch(/runs on the athlete's own device/);
    expect(BIOMETRIC_RELEASE).toContain("30 days");
    expect(BIOMETRIC_RELEASE).toContain("90 days");
  });

  it("says declining is allowed, matching what the prompt does", () => {
    // biometric-release-dialog.tsx's "Not now" leaves the set logging normally. A release that
    // did not say so would contradict the one screen it is reached from.
    expect(BIOMETRIC_RELEASE).toMatch(/Declining is a real choice and carries no penalty/);
  });
});

describe("every document a user is asked to accept is reachable", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  it("serves the release publicly, because the guardian claim has no session", () => {
    expect(read("server/routes.ts")).toMatch(
      /PUBLIC_LEGAL_DOC_TYPES = \[[^\]]*"biometric_waiver"/,
    );
  });

  it("routes every public document to a page", () => {
    const app = read("client/src/App.tsx");
    for (const route of ["/terms", "/privacy", "/eula", "/biometric-release"]) {
      expect(app, `no route for ${route}`).toContain(`path="${route}"`);
    }
  });

  it("points the capture-time prompt at the release rather than the signup agreement", () => {
    // The regression: the dialog said "Read the full video and biometric consent" and linked
    // /legal, which renders only the clickwrap. It then linked the right document in a new
    // window, which opens nothing on native -- so the document is read in place now.
    const dialog = read("client/src/components/biometric-release-dialog.tsx");
    expect(dialog).toContain('docType="biometric_waiver"');
    expect(dialog).not.toContain('href="/legal"');
  });

  it("gives each guardian-claim checkbox its own document", () => {
    // Three consent records, each snapshotting different text, used to offer one link between
    // them.
    const claim = read("client/src/pages/guardian-claim.tsx");
    expect(claim).toContain('docType="terms_of_service"');
    expect(claim).toContain('docType="privacy_policy"');
    expect(claim).toContain('docType="biometric_waiver"');
    expect(claim).not.toContain('href="/legal"');
  });
});

describe("what the document is, and is not", () => {
  it("does not call itself a release", () => {
    // It was titled "CONSENT AND RELEASE" and released nothing -- nine sections of consent, no
    // claim given up, nothing surrendered. Forge has exactly ONE document that asks somebody to
    // surrender a right, and that separation is deliberate: see assumption-of-risk.ts's header.
    // A consent that calls itself a release invites the question of whether a guardian can
    // release a child's claim, which this document does not ask and cannot answer.
    expect(BIOMETRIC_RELEASE).toContain("FORGE -- VIDEO AND BIOMETRIC CONSENT");
    expect(BIOMETRIC_RELEASE).not.toContain("CONSENT AND RELEASE");
    expect(BIOMETRIC_RELEASE).toContain("This consent covers video of an athlete training");
  });

  it("carries the governing law clause the other documents carry", () => {
    // It was the ONLY user-facing document without one -- and it is the document a parent agrees
    // to about camera capture of their child. The last sentence is the one that was missing.
    expect(BIOMETRIC_RELEASE).toContain(GOVERNING_LAW_CLAUSE);
    expect(BIOMETRIC_RELEASE).toContain(
      "Nothing here waives a right that cannot lawfully be waived, including a right belonging to a person under 18.",
    );
  });

  it("still says the true things about the software", () => {
    // The sections a template could not have written. Each matches the code, and that is the
    // part of this document worth protecting through any rewording of it.
    expect(BIOMETRIC_RELEASE).toContain("It records no audio at all");
    expect(BIOMETRIC_RELEASE).toContain("that access is written to a log");
    expect(BIOMETRIC_RELEASE).toContain("any group of fewer than ten people withheld");
    expect(BIOMETRIC_RELEASE).toContain("there is no separate signature page");
    expect(BIOMETRIC_RELEASE).toContain("Declining is a real choice and carries no penalty");
  });
  it("is what the counsel review packet actually shows a lawyer", () => {
    // docs/biometric-release-for-counsel.md embeds a copy of this document. A copy goes stale
    // silently -- it did, twice over, still carrying the old "CONSENT AND RELEASE" title and
    // missing the governing-law section added with it -- and a reviewer has no way to tell they
    // are reading a version the product never shipped. The packet is what gets sent outside the
    // building, so the copy in it is asserted rather than remembered.
    const packet = readFileSync(
      join(import.meta.dirname, "../../docs/biometric-release-for-counsel.md"),
      "utf8",
    );
    expect(packet).toContain(BIOMETRIC_RELEASE);
  });
});
