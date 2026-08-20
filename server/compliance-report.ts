import PDFDocument from "pdfkit";

const TIER_LABEL: Record<string, string> = {
  tier1_under13: "Tier 1 -- Under 13",
  tier2_teen_13_17: "Tier 2 -- Teen (13-17)",
  tier3_adult_18plus: "Tier 3 -- Adult (18+)",
  unknown: "Unknown (no date of birth on file)",
};

const CONSENT_LABEL: Record<string, string> = {
  terms_of_service: "Terms of Service",
  biometric_waiver: "Biometric Waiver",
  coach_coppa_consent: "Coach/Program Consent (Tier 1 agent)",
  parental_notice_ack: "Parental Notice Acknowledgment",
};

export type ComplianceReportData = {
  generatedAt: Date;
  tierCounts: { tier: string; count: number }[];
  retentionWindows: { tier: string; days: number }[];
  consentCounts: { consentType: string; count: number; mostRecent: Date | null }[];
  videosEligibleForPurgeNow: number;
  provisionedViaCoachConsentCount: number;
  requiresGuardianNoticeCount: number;
  notYetBuilt: string[];
};

/** Plain, unbranded printout of the current privacy-tier/consent-logging
 * state -- built for handing to a lawyer for review, not for an athlete or
 * a marketing use, so it skips the logo/color treatment every other PDF in
 * this codebase uses. Every section is real, queried data (see
 * storage.getComplianceReportData); nothing here asserts compliance with
 * any specific law -- that's stated on the page itself, not just in code
 * comments, since this document is meant to leave the codebase. */
export function buildComplianceReportPdf(data: ComplianceReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const heading = (text: string) => {
      doc.moveDown(1.2).font("Helvetica-Bold").fontSize(13).fillColor("#000000").text(text);
      doc.moveTo(doc.x, doc.y + 2).lineTo(doc.page.width - doc.page.margins.right, doc.y + 2).strokeColor("#000000").stroke();
      doc.moveDown(0.4);
    };
    const row = (label: string, value: string) => {
      doc.font("Helvetica").fontSize(10).fillColor("#000000");
      doc.text(`${label}:  ${value}`);
    };
    const bullet = (text: string) => {
      doc.font("Helvetica").fontSize(10).fillColor("#000000").text(`• ${text}`, { indent: 10 });
    };

    doc.font("Helvetica-Bold").fontSize(18).text("Forge -- Privacy & Compliance Data Snapshot");
    doc.font("Helvetica").fontSize(9).fillColor("#444444").text(`Generated ${data.generatedAt.toISOString()}`);
    doc.moveDown(0.4);
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor("#444444")
      .text(
        "This document reports the current state of Forge's age-tier and consent-logging system. " +
          "It is not a legal compliance certification. The specific thresholds, retention windows, and " +
          "consent mechanisms described below have not been reviewed by counsel -- see \"Not Yet Reviewed / Built\" below.",
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
      );

    heading("Privacy Tiers -- Current Roster Counts");
    for (const t of data.tierCounts) row(TIER_LABEL[t.tier] ?? t.tier, String(t.count));

    heading("Video Retention Windows (configured, not legally verified)");
    for (const r of data.retentionWindows) row(TIER_LABEL[r.tier] ?? r.tier, `${r.days} days`);
    doc.moveDown(0.2);
    row("Videos currently eligible for purge", String(data.videosEligibleForPurgeNow));

    heading("Consent Records on File (immutable audit log)");
    if (data.consentCounts.length === 0) {
      doc.font("Helvetica").fontSize(10).text("No consent records logged yet.");
    }
    for (const c of data.consentCounts) {
      row(
        CONSENT_LABEL[c.consentType] ?? c.consentType,
        `${c.count} record(s), most recent ${c.mostRecent ? new Date(c.mostRecent).toISOString().slice(0, 10) : "n/a"}`,
      );
    }

    heading("Provisioning");
    row("Accounts created via coach/program consent (claim-code flow)", String(data.provisionedViaCoachConsentCount));
    row("Accounts flagged as requiring a guardian notice (Tier 2)", String(data.requiresGuardianNoticeCount));

    heading("Not Yet Reviewed / Built");
    for (const item of data.notYetBuilt) bullet(item);

    doc.end();
  });
}
