/**
 * The exact words shown to whoever grants research consent, kept here so
 * the same text reaches the person, the consent record, and any later
 * review of what was actually agreed to.
 *
 * A consent record that stores a version number and not the words is close
 * to worthless: nobody can reconstruct, a year later, what the person was
 * looking at when they said yes. Storing the full text is why
 * consent_records has a documentText column at all.
 *
 * Written to be read by a sixteen-year-old and their parent, not by a
 * lawyer. Five things it has to say plainly, because each one is a
 * question a reasonable person would ask and none of them are obvious:
 * what leaves, what does not, that saying no changes nothing about their
 * training, that withdrawing cannot reach into a report already sent, and
 * that deleting the account does not delete the group numbers -- with the
 * order to follow (withdraw first, then delete) if that is what they want.
 * The last one is the only place the product does something a person would
 * not guess, so leaving it out would make the whole document dishonest.
 */
/** 2026-09-20: one word. Section 6 said "age bracket"; the research store keeps age in
 * whole years, and an extract only ever shows it inside a group. Counsel, asked by Scott
 * the same day, approved "age". Everyone who consented under the 2026-09-19 text is asked
 * again (the text differs, so staleTerms is true), and their earlier yes still counts for
 * what it said, including the deletion-retention disclosure under the same heading. */
export const RESEARCH_CONSENT_VERSION = "2026-09-20";

/** The heading of the section that discloses retention after deletion in the
 * CURRENT text. Used to recognise the disclosure inside a STORED consent
 * record, so it has to stay byte-identical to the heading in
 * RESEARCH_CONSENT_TEXT below -- researchConsentDisclosesDeletionRetention is
 * asserted against that text. */
export const DELETION_RETENTION_HEADING = "6. RETENTION AND ACCOUNT DELETION";

/** Headings the same disclosure carried in EARLIER texts people agreed to.
 * A consent given under the 2026-09-17 wording told them exactly what the
 * current text tells them, so it still counts; only text with none of these
 * headings predates the disclosure. Append, never edit: a stored record
 * cannot be re-worded. */
export const PRIOR_DELETION_RETENTION_HEADINGS: readonly string[] = ["IF YOU DELETE YOUR ACCOUNT"];

/**
 * Whether the text somebody actually agreed to told them the scrubbed record
 * survives deleting their account.
 *
 * READS THE STORED TEXT, NOT A VERSION. consent_records.documentVersion is a
 * hash of the text, not a name anybody assigns, so there is no version string
 * to compare against; and the stored text is the better question anyway --
 * it is the document the person was looking at, prefix and all (a coach
 * relaying a guardian's answer prepends a line to it).
 *
 * WHY THIS GATE EXISTS. Retention after deletion is only defensible against
 * somebody who was told about it. Everyone who consented before this section
 * was written read a document whose "changing your mind" part named exactly
 * one limit -- a report already sent -- and said nothing about deletion. Their
 * account deletion still removes them from the mirror entirely. Nobody is
 * moved onto the new terms retroactively; they would have to consent again.
 */
export function researchConsentDisclosesDeletionRetention(documentText: string | null | undefined) {
  if (!documentText) return false;
  return (
    documentText.includes(DELETION_RETENTION_HEADING) ||
    PRIOR_DELETION_RETENTION_HEADINGS.some((h) => documentText.includes(h))
  );
}

/** REVIEWED BY COUNSEL, 2026-09-19. This is the text the attorney returned,
 * verbatim, replacing the 2026-09-17 plain-English draft that
 * docs/research-consent-for-counsel.md sent for review. Every factual claim
 * in it was checked against the code before it went live (that file records
 * the check). Changing a word here is changing a reviewed document, and it
 * re-asks every athlete and guardian who consented under the old wording. */
export const RESEARCH_CONSENT_TEXT = `FORGE -- RESEARCH CONSENT AND DATA USE AUTHORIZATION

1. PURPOSE OF AUTHORIZATION
Forge Performance Systems LLC ("Forge") is periodically requested to provide aggregated, de-identified athletic performance data to independent research organizations studying athletic training, biomechanics, and injury prevention. This document authorizes Forge to include the undersigned user's (the "Subject") de-identified training metrics in such research extracts.

2. VOLUNTARY PARTICIPATION
This authorization is strictly voluntary. Agreement to this document is not a condition of using the Forge application or receiving services. A decision to decline or withdraw this authorization will not affect the Subject's training programs, coaching access, account functionality, or subscription fees in any manner.

3. SCOPE OF AUTHORIZED DATA (WHAT IS SHARED)
The data provided for research shall consist exclusively of aggregated group statistics (e.g., "the average vertical jump of 240 seventeen-year-old football athletes was 28.4 inches"). The Subject's individual performance metrics shall only be shared as part of an aggregated dataset. Any aggregated group comprising fewer than ten (10) individuals shall be excluded from any extract provided to a researcher to prevent reverse-identification.

4. EXCLUDED DATA (WHAT IS NEVER SHARED)
Under no circumstances shall the following personally identifiable information (PII) be included in any research extract:
- Name, email address, physical address, or date of birth.
- Affiliated school, club, team, or specific coach identity.
- Raw video files, images, or media recordings.
- Free-text entries, notes, or written injury descriptions provided by the Subject or their coach.
- Specific calendar dates capable of correlating an event to a specific day.

The data provided to researchers is designed so that it cannot be traced back to the Subject. Forge does not maintain a cross-reference key or index that connects an aggregated research dataset back to an individual user's identifying profile.

5. WITHDRAWAL OF CONSENT
The Subject (or the Subject's parent/legal guardian) may revoke this authorization at any time by updating their preferences within the application settings. Upon withdrawal, the Subject's data shall be immediately removed from the designated research database and excluded from any future extracts. The Subject acknowledges that Forge cannot recall or retroactively modify statistical reports or datasets that were already compiled and delivered to researchers prior to the date of withdrawal.

6. RETENTION AND ACCOUNT DELETION
In the event the Subject deletes their Forge account, all personally identifiable information, video files, and account access shall be permanently removed in accordance with the Forge Privacy Policy. However, the de-identified, aggregated numeric data (including age, sport, position, and performance metrics) authorized under this document shall be retained for ongoing longitudinal research, as it contains no identifying linkages to the Subject.
- Opt-Out Procedure: If the Subject requires the permanent deletion of their de-identified numeric metrics from the research database, the Subject must expressly withdraw this authorization (as described in Section 5) prior to initiating the account deletion process.

7. MINOR SUBJECTS
If the Subject is under eighteen (18) years of age, this authorization must be granted by the Subject's parent or legal guardian. The parent or legal guardian retains the sole right to grant, manage, and withdraw this authorization on behalf of the minor Subject.`;
