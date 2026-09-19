import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { INSTITUTIONAL_AGREEMENT_SECTIONS } from "@shared/institutional-service-agreement";

/**
 * SIGNING THE SERVICE AGREEMENT IN THE APP.
 *
 * A contract signed by typing a name is only worth anything if the thing on screen is the thing
 * that gets signed, and if the affirmations above the button say what they are supposed to say.
 * Both are text, and text is exactly what drifts silently -- so this scans the source rather than
 * trusting a component to keep its own copy honest.
 *
 * The sharpest of the four: the agreement body must come from INSTITUTIONAL_AGREEMENT_SECTIONS.
 * A pasted copy in the client is a SECOND contract, and the coach would sign the server's copy
 * while reading the client's.
 */

const CLIENT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(CLIENT, ...p), "utf8");

const COMPONENT = read("components", "institutional-agreement-signing.tsx");
const PAGE = read("pages", "documents.tsx");

describe("the agreement's affirmations are verbatim", () => {
  it("carries both checkbox sentences exactly", () => {
    expect(COMPONENT).toContain(
      "I am authorized to sign this agreement on behalf of the institution named above",
    );
    expect(COMPONENT).toContain("I have read the agreement and agree to it");
  });

  it("tells the signer that typing their name is the signature", () => {
    expect(COMPONENT).toContain(
      "Typing your name here is your electronic signature, the same as signing on paper",
    );
  });

  it("labels the signature field and the button", () => {
    expect(COMPONENT).toContain("Type your full name to sign");
    expect(COMPONENT).toContain("Sign agreement");
  });
});

describe("the sign button is gated", () => {
  it("requires both boxes, a matching name and valid details", () => {
    const gate = /const canSign =([\s\S]{0,240}?);/.exec(COMPONENT);
    expect(gate, "canSign condition not found").toBeTruthy();
    const condition = gate![1];
    expect(condition).toContain("authorizedToBind");
    expect(condition).toContain("agreed");
    expect(condition).toContain("nameMatches");
    expect(condition).toContain("detailsValid");
    // Gating anything but the button is decoration.
    expect(COMPONENT).toMatch(/disabled=\{!canSign\}/);
  });

  it("matches the typed name against signerName, trimmed and case-insensitively", () => {
    const match = /const nameMatches =([\s\S]{0,300}?);/.exec(COMPONENT);
    expect(match, "nameMatches condition not found").toBeTruthy();
    const condition = match![1];
    expect(condition).toContain("typedSignature");
    expect(condition).toContain("signerName");
    expect(condition).toContain("trim()");
    expect(condition).toContain("toLowerCase()");
  });
});

describe("the request says what was affirmed", () => {
  it("posts typedSignature and both affirmations to the sign route", () => {
    expect(COMPONENT).toContain("/api/coach/institutional-agreement/sign");
    const body = /body: JSON\.stringify\(\{[\s\S]{0,400}?typedSignature[\s\S]{0,400}?\}\)/.exec(
      COMPONENT,
    );
    expect(body, "sign request body not found").toBeTruthy();
    expect(body![0]).toContain("authorizedToBind: true");
    expect(body![0]).toContain("agreed: true");
  });

  it("refetches rather than erroring when the agreement is already signed", () => {
    expect(COMPONENT).toContain("res.status === 409");
  });
});

describe("the agreement on screen is the shared one", () => {
  it("renders from INSTITUTIONAL_AGREEMENT_SECTIONS", () => {
    expect(COMPONENT).toContain("INSTITUTIONAL_AGREEMENT_SECTIONS");
    expect(COMPONENT).toMatch(/INSTITUTIONAL_AGREEMENT_SECTIONS\.map/);
    expect(COMPONENT).toContain("@shared/institutional-service-agreement");
  });

  it("has no copy of the agreement's own words anywhere in client source", () => {
    // Every heading, plus the opening words of every clause. A paste would trip on one of them.
    const needles = INSTITUTIONAL_AGREEMENT_SECTIONS.flatMap((section) => [
      section.heading,
      ...section.paragraphs.map((p) => p.slice(0, 60)),
    ]);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|ts)$/.test(entry) && !entry.endsWith(".test.ts")) files.push(full);
      }
    };
    walk(CLIENT);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const needle of needles) {
        if (source.includes(needle)) offenders.push(`${file}: ${needle.slice(0, 40)}`);
      }
    }
    expect(offenders).toEqual([]);
    // Named explicitly too, so a renamed section cannot quietly empty the scan above.
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toContain("WHAT THIS AGREEMENT COVERS");
    }
  });
});

describe("the paper path survives", () => {
  it("keeps the download and the upload note behind a collapsed section", () => {
    expect(COMPONENT).toContain("Prefer to sign on paper?");
    expect(COMPONENT).toContain("/api/coach/institutional-agreement/download");
    expect(COMPONENT).toContain("Download a copy to read first");
  });

  it("offers the signed PDF once it is signed", () => {
    expect(COMPONENT).toContain("/api/coach/institutional-agreement/signed.pdf");
    expect(COMPONENT).toContain("Download signed copy");
  });

  it("is reached from the documents page, which no longer holds its own form", () => {
    expect(PAGE).toContain("InstitutionalAgreementSigning");
    expect(PAGE).not.toContain("Download agreement");
  });
});
