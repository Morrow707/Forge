import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INSTITUTIONAL_AGREEMENT_PREAMBLE,
  INSTITUTIONAL_AGREEMENT_SECTIONS,
  INSTITUTIONAL_AGREEMENT_TITLE,
  institutionalAgreementFormSchema,
  renderInstitutionalAgreementText,
} from "./institutional-service-agreement";

const DOC_PATH = "docs/institutional-service-agreement.md";
const doc = readFileSync(DOC_PATH, "utf8");

/** TWO COPIES OF A CONTRACT ARE ONE CONTRACT AND ONE MISTAKE.
 *
 * The doc file is what a human reads and what an attorney was sent; the constant is what a school
 * actually downloads and signs. Nothing stops somebody fixing a clause in whichever one they had
 * open, and a divergence here is not a rendering bug -- it is a school signing text nobody
 * reviewed. So the doc must contain every clause of the constant verbatim.
 */
describe("the agreement text and the doc file", () => {
  it("has the doc carrying every section of the constant verbatim", () => {
    const missing: string[] = [];
    for (const section of INSTITUTIONAL_AGREEMENT_SECTIONS) {
      if (!doc.includes(section.heading)) missing.push(section.heading);
      for (const paragraph of section.paragraphs) {
        if (!doc.includes(paragraph)) missing.push(paragraph.slice(0, 60));
      }
    }
    expect(missing).toEqual([]);
  });

  it("has the doc carrying the title and preamble verbatim", () => {
    expect(doc).toContain(INSTITUTIONAL_AGREEMENT_TITLE);
    expect(doc).toContain(INSTITUTIONAL_AGREEMENT_PREAMBLE);
  });

  it("covers all sixteen sections", () => {
    expect(INSTITUTIONAL_AGREEMENT_SECTIONS).toHaveLength(16);
  });
});

/** The marks were addressed to Scott and to the attorney. A school that reads one is reading
 * somebody else's margin notes, and a blank is a contract that was sent out unfinished. */
describe("the school-facing text", () => {
  const everything = [
    INSTITUTIONAL_AGREEMENT_TITLE,
    INSTITUTIONAL_AGREEMENT_PREAMBLE,
    ...INSTITUTIONAL_AGREEMENT_SECTIONS.flatMap((s) => [s.heading, ...s.paragraphs]),
  ].join("\n");

  it("carries no review marks and no blanks", () => {
    expect(everything).not.toContain("[FOR SCOTT");
    expect(everything).not.toContain("[FOR COUNSEL");
    expect(everything).not.toContain("[BLANK");
  });

  it("keeps the three defaults the review marks were about", () => {
    // Stripping the note must not strip the term: 72-hour incident notice, 30-day export window,
    // $1,000 cap. These are the agreement's actual commitments.
    expect(everything).toContain("within 72 hours of confirming it");
    expect(everything).toContain("available for export for 30 days");
    expect(everything).toContain("one thousand US dollars");
  });

  it("renders a complete agreement with no marks left in it", () => {
    const text = renderInstitutionalAgreementText(
      {
        institutionName: "Ironwood Ridge High School",
        address: "2475 W Naranja Dr, Oro Valley, AZ 85742",
        signerName: "Dana Whitfield",
        signerTitle: "Athletic Director",
        noticeEmail: "ad@ironwood.example",
      },
      { signerName: "Scott Morrow", signerTitle: "Founder", effectiveDate: "September 19, 2026" },
    );
    expect(text).not.toContain("[BLANK");
    expect(text).not.toContain("[FOR ");
    expect(text).toContain("INSTITUTION: Ironwood Ridge High School");
    expect(text).toContain("AUTHORIZED REPRESENTATIVE: Dana Whitfield, Athletic Director");
    expect(text).toContain("EFFECTIVE DATE: September 19, 2026");
    expect(text).toContain("PLAN: as selected in the Service from time to time");
    expect(text).toContain("Name: Scott Morrow");
    expect(text).toContain("Title: Founder");
  });
});

describe("the form a coach fills in", () => {
  const good = {
    institutionName: "Ironwood Ridge High School",
    address: "2475 W Naranja Dr, Oro Valley, AZ 85742",
    signerName: "Dana Whitfield",
    signerTitle: "Athletic Director",
    noticeEmail: "ad@ironwood.example",
  };

  it("accepts a filled-in form and trims what it keeps", () => {
    const parsed = institutionalAgreementFormSchema.parse({
      ...good,
      institutionName: "  Ironwood Ridge High School  ",
      noticeEmail: " ad@ironwood.example ",
    });
    expect(parsed.institutionName).toBe("Ironwood Ridge High School");
    expect(parsed.noticeEmail).toBe("ad@ironwood.example");
  });

  it("refuses whitespace as a name -- trimming happens before the length check", () => {
    const res = institutionalAgreementFormSchema.safeParse({ ...good, institutionName: "   " });
    expect(res.success).toBe(false);
  });

  it("refuses an address that is not an address and an email that is not an email", () => {
    expect(institutionalAgreementFormSchema.safeParse({ ...good, address: "AZ" }).success).toBe(false);
    expect(
      institutionalAgreementFormSchema.safeParse({ ...good, noticeEmail: "ad-at-ironwood" }).success,
    ).toBe(false);
  });

  it("explains itself in words a coach can act on", () => {
    // Every message has to name what to type. "String must contain at least 2 character(s)" is
    // the default and is useless to the person filling this in on a phone in a weight room.
    const res = institutionalAgreementFormSchema.safeParse({
      institutionName: "",
      address: "",
      signerName: "",
      signerTitle: "",
      noticeEmail: "nope",
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    for (const issue of res.error.issues) {
      expect(issue.message).not.toMatch(/String must contain|Invalid input|Required/);
      expect(issue.message.length).toBeGreaterThan(20);
    }
  });
});
