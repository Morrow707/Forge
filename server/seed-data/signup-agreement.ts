// The clickwrap agreement actually shown at signup and snapshotted into every
// terms consent record (storage.getLegalAgreement, legalAgreement id=1).
//
// REVIEWED BY COUNSEL 2026-09-19. The text below is the attorney's rewrite,
// VERBATIM, with their five answers folded in: section 3 no longer promises
// software enforcement Forge does not perform, section 15 carries the $50
// liability floor and the gross-negligence carve-out, section 16 promises
// notice and re-acceptance on a material change (and section 1 states that
// these Terms govern over the publicly posted Terms of Service), section 18 is
// DMCA notice-and-takedown naming Forge's designated agent, and section 19 is
// severability and entire agreement.
//
// CHANGING THIS TEXT IS CHANGING A REVIEWED DOCUMENT. Not a copy edit: every
// user's consent record snapshots it, the re-acceptance gate compares against
// it (server/storage.ts getTermsAcceptanceStatus), and an edit therefore asks
// every account on the platform to agree again. Wording changes go back to
// counsel; the three shared constants below are interpolated only where the
// attorney's text was already byte-identical to them.
//
// Deliberately NOT carrying the DRAFT_NOTICE banner that
// legal-documents-draft.ts puts on its five documents. Those are admin-editable
// drafts nobody has ever been shown; this one is live, and a consent record
// whose document announces itself as unreliable is the problem being fixed, not
// a caution being preserved.
//
// Two things this document deliberately does not do:
//   - It does not restate the video and biometric consent. That is its own
//     instrument, agreed separately (adults at signup and at the camera, minors
//     by their guardian at claim time), and folding it in here would bury an
//     affirmative consent inside a general terms box.
//   - It does not quote the rolling video cap's numbers. Those move with
//     billing (VIDEO_RETENTION vs VIDEO_STORAGE_ADD_ON in
//     shared/video-retention.ts) and a document that goes stale is worse than
//     one that points at the app. The MINOR retention windows are quoted,
//     because those are a promise about a child's footage rather than a
//     product limit, and they do not move.
//
// Keep the CODE in sync with this, not the other way round: a claim here that
// no longer matches behaviour is now a discrepancy with a reviewed document.

import {
  FORGE_CONTACT_EMAIL,
  FORGE_POSTAL_ADDRESS,
  FORGE_LEGAL_ENTITY,
  GOVERNING_LAW_CLAUSE,
} from "@shared/contact";
import {
  shippedPrefixLength,
  SIGNUP_AGREEMENT_PRIOR_SHIPPED,
  SIGNUP_AGREEMENT_PRIOR_LENGTHS,
} from "./shipped-versions";

/** The exact text seeded before real terms existed. Kept verbatim and only for
 * the one-time migration in seed.ts to recognise -- an installation still
 * carrying this got the placeholder, an installation carrying anything else got
 * an admin's own edit and must not be touched. Do not reformat: an exact string
 * match is the whole mechanism. */
export const PLACEHOLDER_AGREEMENT = `PLACEHOLDER -- replace with your own reviewed terms before relying on this.

By creating an account, you agree to use Forge to support, not replace, sound judgment about your own or your athletes' training and health. Forge's tracking, analytics, and AI-generated suggestions are informational aids for coaches and athletes; they are never a substitute for professional medical, athletic training, or coaching judgment, and nothing in the app should be treated as medical advice.

You're responsible for the accuracy of what you or your athletes log, and for stopping any exercise that causes pain or feels unsafe. Coaches are responsible for appropriately supervising and modifying training for their own athletes.

Forge stores the training, health-status, and performance data you provide in order to run the features you use (programming, analytics, camera-based tracking, nutrition logging). Don't enter anyone else's personal information without their permission to do so.`;

export const SIGNUP_AGREEMENT = `FORGE -- TERMS OF USE

These Terms of Use ("Terms") govern your access to and use of the Forge application and website (collectively, the "Service" or "Forge"). By creating an account or otherwise accessing the Service, you agree to be bound by these Terms. In the event of any conflict between these Terms of Use and the publicly posted Terms of Service, these Terms of Use shall govern.

1. SCOPE OF SERVICES AND MEDICAL DISCLAIMER

Forge provides a software platform designed for athletic training and coaching. The Service hosts training programming, records user-logged performance data, analyzes training video, and generates written feedback and coaching suggestions.

Forge is not a medical device and does not provide medical advice, diagnosis, or treatment. The measurements, analytics, and AI-generated suggestions provided by the Service are informational aids intended for athletes and coaches; they are not a substitute for the professional judgment of a physician, physical therapist, athletic trainer, registered dietitian, or qualified coach. If any information provided by Forge conflicts with the guidance of a qualified medical or training professional, you must defer to the professional.

Forge is not a clinical system of record and is not compliant with the Health Insurance Portability and Accountability Act (HIPAA). Licensed clinicians must not enter Protected Health Information (PHI) or utilize Forge to document patient care.

2. ASSUMPTION OF RISK

The User acknowledges that athletic activities, including but not limited to strength training, jumping, sprinting, and skill work, carry inherent risks of injury, including serious and permanent bodily harm. This risk exists independently of the use of any software, and Forge does not mitigate or remove this risk.

You are solely responsible for determining whether a specific exercise is appropriate for you, for utilizing equipment correctly, and for ceasing activity immediately if you experience pain or feel unsafe. You must not train through pain merely because a program suggests doing so. Any prescribed weight, repetition count, or progression displayed in Forge is an automated suggestion generated from user-logged data; it is not an individualized instruction from a supervising professional.

Coaches utilizing Forge to program for athletes remain solely responsible for supervising and modifying their athletes' training. Forge does not independently assess an athlete's physical readiness for any movement. You must consult a physician prior to commencing or substantially altering any training program, particularly if you have a pre-existing medical condition, an injury, are pregnant, or have been previously inactive.

3. ELIGIBILITY AND MINOR GUARDIAN CONSENT

You may create an account for yourself only if you are eighteen (18) years of age or older.

An athlete under the age of 18 may utilize Forge only if a parent or legal guardian has created a linked guardian account and explicitly provided consent on the minor's behalf. A minor athlete's account will be suspended until a legal guardian has successfully claimed it and provided the requisite consent. This restriction applies to all minor athletes, regardless of whether they initiated registration independently, were invited by a coach, or were transferred between rosters. Accounts lacking a date of birth are similarly suspended until one is provided.

At the point of claiming, the guardian agrees separately to these terms, to the privacy policy, to the video and biometric consent, and to the assumption of risk and release, and a confirmation is emailed to them describing what was agreed and how to withdraw it.

A guardian retains the right to withdraw consent at any time. Withdrawal of consent results in the immediate deletion of all stored video associated with the minor's account and returns the account to a suspended state; the minor athlete may not resume use of the Service until a guardian provides new consent.

You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify Forge promptly if you suspect unauthorized access to your account.

4. USER-SUBMITTED DATA AND PRIVACY

Forge stores the data you submit, including your profile information, training logs, and -- at your discretion -- optional metrics such as sleep quality, wellness self-reports, recorded injuries, and dietary intake. If you turn on Health sync, Forge also reads from Apple Health: sleep, resting heart rate, heart rate variability, VO2 max, respiratory rate, weight, and heart rate around a training session. It uses them to pre-fill your daily check-in and never writes anything to Apple Health.

Certain submissions may constitute health-related information. By electing to enter this data, you acknowledge that your designated coaches and organizational staff will have access to it, as this visibility is necessary to provide the coaching functionality of the Service. A parent or legal guardian is granted full visibility into their minor athlete's records, including training history, video media, wellness entries, injury logs, and nutrition tracking. Forge administrators may access this data strictly for technical support, auditing, and video management purposes; every instance of an administrator or coach accessing an athlete's video is permanently recorded in a secure audit log.

Athlete media and performance data are never made visible to the general public through the Service. You must not enter personal information regarding any third party without obtaining their explicit prior consent.

5. NUTRITION AND DIETARY INFORMATION

Any nutrition-related functionality provided by Forge -- including caloric and macronutrient targets, food logging tools, and AI-generated dietary suggestions -- is strictly for general informational purposes. It does not constitute dietetic, medical, or nutritional advice, nor is it individually prescribed by a qualified healthcare professional.

These features are not designed as a weight-loss program and are not suitable for individuals diagnosed with, or at risk of, eating disorders. You must consult a physician or registered dietitian before implementing any dietary suggestions, and particularly before applying such guidance to a minor athlete. Nutritional intake targets for growing minors require clinical evaluation, not automated calculation. Coaches and guardians are solely responsible for supervising and evaluating any dietary guidance presented to a minor user's account.

6. CAMERA TRACKING AND BIOMETRIC DATA

If you utilize the video recording features, Forge captures media on your local device to measure biomechanical movement, including joint positioning over time, bar speed, range of motion, and jump height. Pose analysis is executed locally on your device; only the finalized video file and the resulting numeric metrics are transmitted to Forge's servers for storage.

Forge does not conduct facial recognition, does not scan fingerprints, and does not record audio. The video capture interface processes no audio input, and the application does not request device microphone permissions.

The collection and processing of this data are governed strictly by the separate Video and Biometric Consent, not by these Terms. Adult athletes must agree to that document independently; for minors, consent must be provided by the legal guardian. Camera-based tracking is entirely optional -- users may log training normally without it -- and a guardian may disable the feature for their minor athlete at any time.

7. DATA RETENTION POLICY FOR VIDEO

Raw video files depicting athletes under the age of 13 are permanently deleted thirty (30) days following the recorded set. Video files depicting athletes aged 13 to 17 are deleted ninety (90) days following the set. This retention policy is executed automatically and unconditionally.

For all athletes, Forge retains a limited quota of recent videos per exercise. Users may designate a select number of videos as "favorites," which exempts them from automatic deletion. The Service displays current retention limits and provides advance warning, including a link to the media, before any non-favorited video is deleted under this quota limit.

The deletion of a video file does not delete the numeric metrics derived from it. Range of motion, velocity, jump height, repetition counts, and personal records constitute your permanent training record and are retained. You may request the deletion of the training record separately, or permanently delete your entire account at any time.

8. ARTIFICIAL INTELLIGENCE (AI) FEATURES

When you utilize an AI-powered feature, Forge transmits the necessary data to a third-party AI model provider. For AI coaching and written feedback generation, this data includes your profile information and training data, including check-in values, some of which may have been pre-filled from Apple Health. For AI form-check analysis, the transmitted data also includes extracted still images from your submitted training video, alongside your height, physical build, and any movement restrictions or asymmetries noted in your profile. This requires images of the athlete to be processed outside of Forge's proprietary servers.

AI features are executed only upon the explicit request of the user or their coach. AI-generated outputs are produced by automated software and may contain errors or inaccuracies. The medical and safety disclaimers outlined in Section 1 apply entirely to all AI-generated content.

9. THIRD-PARTY SERVICE PROVIDERS

Forge does not sell, rent, or trade your personal information, nor does it sell biometric data. Information is shared strictly with the third-party service providers necessary to operate the Service, which include: application and database hosting, payment processing, app store billing, push notification delivery, transactional email infrastructure, an IP-based geolocation service utilized exclusively to identify the origin of a new device sign-in, an error-monitoring service that receives technical details when something in Forge fails, public food and nutrition databases for user-initiated search queries, and the designated AI model provider. Each provider receives only the minimum data necessary to execute their specific function.

Forge reserves the right to disclose information when required by law, to enforce its legal rights or property, or in emergency situations to protect the physical safety of any individual.

10. RESEARCH OPT-IN

Forge may share de-identified, aggregated data extracts with independent research organizations, but only regarding athletes who have explicitly opted in via a standalone authorization setting. This setting defaults to "off" and operates independently of all other account preferences. For minor athletes, this opt-in must be authorized by a legal guardian. Research extracts are generated from a pre-processed, de-identified mirror database rather than live user records; no demographic or performance group smaller than ten (10) individuals is included in any exported dataset, and withdrawal of consent immediately removes the athlete from the research mirror. If you opted in and later delete your account, the de-identified numbers already in the research store stay, unless you withdraw from research first; the research consent explains this.

11. PAYMENT TERMS

Paid subscription plans are billed through the specific payment processor or app store designated at checkout. Subscriptions are billed on the stated interval and renew automatically until formally cancelled. Cancellations must be processed through the original billing platform; purchases made via third-party app stores are governed solely by that store's management and refund policies, not by Forge. Forge reserves the right to modify pricing for future billing periods upon notice to the user.

Any payment processed by a parent or legal guardian on behalf of a minor athlete also serves as a recorded verification step within the guardian consent protocol.

12. INTELLECTUAL PROPERTY AND USER CONTENT

You retain ownership of all content you upload to the Service. By uploading content, you grant Forge the necessary licenses to store, process, and display said content to the authorized individuals outlined in Section 4 to facilitate the functionality of the Service. Forge will never utilize athlete video or imagery for marketing, advertising, or promotional purposes. The utilization of an athlete's physical likeness is governed exclusively by the separate Video and Biometric Consent.

All proprietary content provided by Forge -- including training programming, educational lessons, written materials, and the underlying software architecture -- remains the exclusive intellectual property of ${FORGE_LEGAL_ENTITY}.

13. ACCEPTABLE USE POLICY

Users shall not utilize Forge to harass or abuse any individual, upload content they do not possess the legal right to distribute, attempt unauthorized access to data belonging to other users, disrupt or interfere with the operation of the Service, or violate any applicable local, state, or federal law. Users are strictly prohibited from attempting to reverse-engineer or re-identify any individual from aggregated or de-identified datasets provided within the Service.

14. TERMINATION AND ACCOUNT DELETION

You may terminate this Agreement and delete your account at any time, which permanently removes the account and all video media associated with it; Section 10 describes the one thing that can remain.

Forge reserves the right to suspend or terminate any account found in breach of these Terms, and retains the right to discontinue specific platform features. In the event a legal guardian withdraws consent for a minor athlete, the minor's account will be suspended as outlined in Section 3.

15. DISCLAIMER OF WARRANTIES AND LIMITATION OF LIABILITY

The Service is provided strictly on an "as is" and "as available" basis. Forge makes no representations regarding uninterrupted availability, error-free operation, or the absolute accuracy of generated measurements. Camera-derived metrics are dependent on environmental filming conditions and constitute estimates, not clinical instrument readings. To the maximum extent permitted by applicable law, Forge expressly disclaims all warranties, whether express or implied, including but not limited to the implied warranties of merchantability and fitness for a particular purpose.

To the maximum extent permitted by applicable law, Forge shall not be liable for any indirect, incidental, special, consequential, or punitive damages. Forge's total cumulative liability arising from or relating to your use of the Service shall not exceed the total amount paid by you to Forge during the twelve (12) months immediately preceding the event giving rise to the claim, or fifty US dollars ($50.00), whichever is greater. Nothing in these Terms shall limit or exclude liability that cannot be lawfully limited, including liability for death or personal injury caused by gross negligence, or for fraudulent misrepresentation.

You expressly accept the physical risks outlined in Section 2 as inherent risks of athletic training that exist independently of the use of this software.

16. MODIFICATIONS TO TERMS

Forge may modify these Terms. The current, effective version of the Terms is consistently accessible within the application and displayed during the registration process, and the specific version of the Terms accepted by you is permanently logged alongside the timestamp of acceptance.

When Forge makes a material change to these Terms, Forge will give you notice and will ask you to review and accept the revised Terms within the application before you continue to use the Service. For a minor athlete, the notice goes to the parent or legal guardian, who accepts or declines on the athlete's behalf. If you do not accept the revised Terms, you may stop using the Service and delete your account, and the version you previously accepted continues to govern your use up to that point.

17. GOVERNING LAW AND DISPUTE RESOLUTION

This Agreement, and any dispute arising out of it or relating to your use of Forge, shall be governed by and construed in accordance with the laws of the State of Arizona, without regard to its conflict-of-laws provisions. In the event of a dispute, the parties agree to first attempt resolution through good-faith informal discussions. Any dispute not resolved informally shall be subject to the exclusive jurisdiction of the state and federal courts located in Maricopa County, Arizona, and both parties hereby consent to the personal jurisdiction of such courts. Nothing in this provision operates to waive any legal right that cannot be lawfully waived, including rights statutorily guaranteed to individuals under the age of 18.

18. COPYRIGHT COMPLAINTS

Forge respects the intellectual property of others and responds to notices of alleged copyright infringement that comply with the Digital Millennium Copyright Act (DMCA). If you believe that content uploaded to the Service infringes a copyright you own or control, send a written notice to Forge's designated copyright agent at ${FORGE_CONTACT_EMAIL} containing: identification of the copyrighted work; identification of the material claimed to be infringing and information sufficient to locate it within the Service; your name, address, telephone number, and email address; a statement that you have a good-faith belief that the use is not authorized by the copyright owner, its agent, or the law; a statement, under penalty of perjury, that the information in the notice is accurate and that you are the owner or authorized to act on the owner's behalf; and your physical or electronic signature. Forge will remove or disable access to material identified in a compliant notice, will notify the user who uploaded it, and will accept a counter-notice that complies with the DMCA. Forge may terminate the accounts of repeat infringers.

19. SEVERABILITY AND ENTIRE AGREEMENT

If any provision of these Terms is held to be invalid or unenforceable, that provision shall be enforced to the maximum extent permissible and the remaining provisions shall remain in full force and effect.

These Terms, together with the Privacy Policy, the Video and Biometric Consent, the Assumption of Risk and Release, the AI Terms of Use, and, where applicable, the Research Consent and Data Use Authorization and any Institutional Service Agreement, constitute the entire agreement between you and Forge regarding the Service and supersede any prior or contemporaneous agreements, communications, or understandings, whether written or oral, relating to the Service.

20. CONTACT INFORMATION

Forge is operated by ${FORGE_LEGAL_ENTITY}, located at ${FORGE_POSTAL_ADDRESS}.

For questions regarding these Terms, requests concerning data privacy, or to withdraw a previously granted consent, please contact: ${FORGE_CONTACT_EMAIL}.`;

/** What the signup agreement should become, given whatever is currently live.
 * `null` means leave it alone.
 *
 * Pure, and separated from the seed script for one reason: the interesting
 * behaviour here is which documents DON'T get overwritten, and asserting that
 * against a real database would mean standing one up to test a string
 * comparison. The seed script owns the reading and writing; this owns the
 * decision.
 *
 * @param current what storage.getLegalAgreement() returned -- including its
 *   "No agreement has been configured yet." fallback, which means the row is
 *   absent or empty rather than meaning a document says that.
 */
export function nextSignupAgreement(current: string): string | null {
  if (current === UNCONFIGURED_FALLBACK) return SIGNUP_AGREEMENT;
  if (current === SIGNUP_AGREEMENT) return null;
  // Whatever prefix this document was last shipped as, keeping anything appended after it. Two
  // separate cases, and both have to handle the append: the PLACEHOLDER this first replaced, and
  // an earlier version of the real terms -- see shipped-versions.ts for why the second exists.
  const shippedLen = shippedPrefixLength(
    current,
    SIGNUP_AGREEMENT_PRIOR_SHIPPED,
    SIGNUP_AGREEMENT_PRIOR_LENGTHS,
  );
  const prefixLen =
    shippedLen >= 0 ? shippedLen : current.startsWith(PLACEHOLDER_AGREEMENT) ? PLACEHOLDER_AGREEMENT.length : -1;
  if (prefixLen < 0) return null; // somebody's own wording
  const appended = current.slice(prefixLen).trim();
  return appended ? `${SIGNUP_AGREEMENT}\n\n${appended}` : SIGNUP_AGREEMENT;
}

/** storage.getLegalAgreement()'s stand-in for an absent or empty row. Duplicated
 * from there deliberately: this module must not import storage (and the
 * database connection behind it) to be testable. A mismatch would make the
 * fresh-install branch above dead, so a test asserts the two agree. */
export const UNCONFIGURED_FALLBACK = "No agreement has been configured yet.";

/** First line of the HIPAA/clinician notice seed.ts appends to whatever agreement is live.
 * Exported so that seed.ts, the migration above and the re-acceptance check all recognise the
 * same string -- three copies of it would drift, and a drift here reads as "the terms changed"
 * to every user on the platform. */
export const HEALTHCARE_NOTICE_MARKER =
  "A note for physical therapists, physicians, and other licensed clinicians";

/** The agreement WITHOUT anything appended after it.
 *
 * The comparison the re-acceptance gate makes is "are these the same terms", and the stored
 * document is never the shipped text on its own (see shippedPrefixLength). Appending the
 * clinician notice, or any later append, is not a new set of terms to re-accept -- so both sides
 * of the comparison are reduced to the part before the marker. Anything appended BEFORE the
 * marker existed is kept, which is the safe direction: at worst somebody is asked once.
 */
export function coreAgreementText(text: string): string {
  const at = text.indexOf(HEALTHCARE_NOTICE_MARKER);
  return (at >= 0 ? text.slice(0, at) : text).trim();
}

/** The unfilled contact placeholders that shipped in the drafted legal documents, paired with
 * what each should now say.
 *
 * These live in the database once seeded, and the seed only writes a draft when one is ABSENT --
 * so correcting the source text in legal-documents-draft.ts fixes new installations and leaves
 * every existing one carrying "[Placeholder -- add a real contact email once one exists.]" in the
 * copy an admin actually edits and prints. Same shape as the placeholder-agreement migration
 * above and the Sentry correction in seed.ts: match exactly, replace in place, touch nothing
 * else, and be a permanent no-op afterwards.
 *
 * The counsel-question placeholders in those documents are deliberate and stay until counsel
 * answers them; a patch here is for something that is simply WRONG in a stored copy.
 *
 * This started as the address placeholders alone, which is what the old name
 * (CONTACT_PLACEHOLDER_PATCHES) described. It now also removes the dropped arbitration proposal
 * and corrects a document's name, so it is named for what it is: the one place a live document
 * gets corrected in an installation that already has it. Adding to it is the price of editing a
 * document that has already shipped -- the alternative is a fix that reaches new installations
 * and quietly misses every existing one, which is the failure this whole mechanism exists for. */
export const LIVE_DOCUMENT_PATCHES: ReadonlyArray<readonly [string, string]> = [
  // The address went out without its unit number. Narrow and exact: only the wrong form of
  // Forge's own address is touched, so a document quoting an address for any other reason is
  // unaffected. Must come FIRST -- the patches below write the corrected address, and a document
  // that already has it must not then be matched by this one.
  [
    "5145 North 7th Street, Phoenix, Arizona 85014",
    "5145 North 7th Street, D-237, Phoenix, Arizona 85014",
  ],
  // --- The business address and governing law, added once the software licence agreement
  // supplied both. Same exact-match discipline as the contact patches below: these replace text
  // Forge seeded, and an admin who has rewritten the sentence keeps their version.
  [
    `Questions about these Terms, or about your account: ${FORGE_CONTACT_EMAIL}`,
    `Forge is operated by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.\n\nQuestions about these Terms, or about your account: ${FORGE_CONTACT_EMAIL}`,
  ],
  [
    `Questions about this Policy, or to make a request about your data: ${FORGE_CONTACT_EMAIL}`,
    `Forge is operated by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.\n\nQuestions about this Policy, or to make a request about your data: ${FORGE_CONTACT_EMAIL}`,
  ],
  [
    `Questions about this Agreement: ${FORGE_CONTACT_EMAIL}`,
    `This Application is provided by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.\n\nQuestions about this Agreement: ${FORGE_CONTACT_EMAIL}`,
  ],
  [
    "[Placeholder -- counsel to specify the governing law and venue, and to confirm they are consistent with the Terms of Service's dispute-resolution section, including that section's carve-out for athletes under 18.]",
    `${GOVERNING_LAW_CLAUSE}\n\nThe Terms of Service propose binding arbitration with a class-action waiver for disputes about the Service. That proposal has not been adopted and does not apply to this Agreement; if it is ever adopted, this section and that one are to be read together and this Agreement updated to match.`,
  ],
  [
    "These Terms and any action related to them are governed by the laws of the State of Arizona, without regard to its conflict-of-laws provisions. Exclusive jurisdiction and venue for any dispute not subject to arbitration under Section 15 lie in the state and federal courts located in Maricopa County, Arizona.",
    `${GOVERNING_LAW_CLAUSE}\n\n[Placeholder -- Section 15's arbitration and class-action waiver are a PROPOSAL and are not in the live signup agreement, which carries the paragraph above and nothing more. Two live documents describing two different dispute paths is ambiguity a counterparty gets to pick between, so either Section 15 is adopted and added to the live agreement, or it is dropped. It should not stay half-applied.]`,
  ],
  // THESE TWO WRITE THE ADDRESS AS WELL AS THE EMAIL, and they have to.
  //
  // The address patches above prepend the business address to a contact SENTENCE. An installation
  // old enough to still hold "[Placeholder -- add a real support/contact email...]" has no such
  // sentence yet, so those patches find nothing, skip, and the patch below then writes the
  // sentence -- after the only thing that would have given it an address has already run. The
  // result was a document seeded before 2026-09-02 carrying the right email and no postal
  // address, in the section whose entire job is telling somebody how to reach Forge. Producing
  // the finished form in one step is what makes it independent of where either patch sits in
  // this list.
  [
    "[Placeholder -- add a real support/contact email once one exists.]",
    `Forge is operated by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.\n\nQuestions about these Terms, or about your account: ${FORGE_CONTACT_EMAIL}`,
  ],
  [
    "[Placeholder -- add a real privacy-contact email once one exists.]",
    `Forge is operated by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.\n\nQuestions about this Policy, or to make a request about your data: ${FORGE_CONTACT_EMAIL}`,
  ],
  [
    "[Placeholder -- add a real contact email once one exists, the same one referenced in the Terms of Service and Privacy Policy.]",
    `Questions, or to act on anything described above: ${FORGE_CONTACT_EMAIL}`,
  ],
  // --- The "this is a draft" notice, removed from the four documents people are shown.
  //
  // Every one of these opened with "DRAFT -- not reviewed by a lawyer ... do not treat it as
  // legally sufficient", and three of them are served on PUBLIC pages: /terms, /privacy and
  // /eula, the last of which is the licence URL App Store Connect points at. So Forge's own
  // answer to "are these terms any good" was printed above the terms, by Forge, where every
  // reader and every counterparty could quote it back. A disclaimer like that does not make an
  // unreviewed document safer; it makes a document that would otherwise be relied on into one
  // its author has publicly disavowed, which is the opposite of what it was there to do.
  //
  // The documents themselves are unchanged apart from the notice and the title suffix. They are
  // still awaiting review -- that fact now lives in docs/legal-open-questions.md, where a
  // reviewer reads it and a user does not.
  //
  // NOT the institutional agreement, which says something different and true: that it was never
  // drafted at all, only assembled from patterns as an outline. Stripping that one would dress
  // an outline up as a contract for a school to sign. It keeps its warning until it is real.
  [
    `DRAFT -- not reviewed by a lawyer. This document is a starting point for legal review, not a finished, reliable Terms of Service. Do not treat it as legally sufficient until counsel has reviewed and approved it.

FORGE -- TERMS OF SERVICE (DRAFT)`,
    "FORGE -- TERMS OF SERVICE",
  ],
  [
    `DRAFT -- not reviewed by a lawyer. This document is a starting point for legal review, not a finished, reliable Terms of Service. Do not treat it as legally sufficient until counsel has reviewed and approved it.

FORGE -- PRIVACY POLICY (DRAFT)`,
    "FORGE -- PRIVACY POLICY",
  ],
  [
    `DRAFT -- not reviewed by a lawyer. This document is a starting point for legal review, not a finished, reliable Terms of Service. Do not treat it as legally sufficient until counsel has reviewed and approved it.

FORGE -- NOTICE TO PARENT OR GUARDIAN (DRAFT)`,
    "FORGE -- NOTICE TO PARENT OR GUARDIAN",
  ],
  [
    `DRAFT -- not reviewed by a lawyer. This document is a starting point for legal review, not a finished, reliable Terms of Service. Do not treat it as legally sufficient until counsel has reviewed and approved it.

FORGE -- END USER LICENSE AGREEMENT (DRAFT)`,
    "FORGE -- END USER LICENSE AGREEMENT",
  ],
  // ANCHORED ON THE SENTENCE, NOT ON THE SECTION NUMBER AFTER IT, which is what it used to be.
  // The number moves: the arbitration removal shifts GOVERNING LAW from 16 to 15, and the
  // intellectual-property section shifts it back to 16. A patch that names a neighbouring
  // heading only fires when the list happens to run after whichever patch last renumbered it,
  // and an installation that skipped a release arrives with the numbering of neither. Matching
  // the placeholder alone is true whatever section it ends up sitting in.
  [
    " [Placeholder -- confirm with counsel whether and how this section can apply where the person being asked to indemnify is a minor athlete or their parent/guardian; several states limit or void an indemnification obligation imposed on a minor.]",
    "",
  ],
  // The institutional agreement names the biometric document twice. It is ACCEPTED by a coach on
  // an org plan, so a stored copy is a document somebody agreed to and gets corrected in place
  // like any other.
  [
    "(see the Terms of Service and Biometric Waiver for what that involves)",
    "(see the Terms of Service and the Video and Biometric Consent for what that involves)",
  ],
  [
    "is governed by the Privacy Policy and Biometric Waiver, unchanged by this Agreement",
    "is governed by the Privacy Policy and the Video and Biometric Consent, unchanged by this Agreement",
  ],
  // --- The video and biometric document's name, after it was retitled from a release to a
  // consent. A document that points the reader at another document has to call it by the name
  // that document actually carries, or the reader cannot tell whether the thing they were shown
  // is the thing being referred to. The assumption-of-risk release has no shipped-version lane of
  // its own -- seed.ts writes it once and never again -- so this patch is how an installation
  // that already stored it gets the corrected sentence.
  [
    "the Privacy Policy and the Video and Biometric Consent and Release rather than by this document.",
    "the Privacy Policy and the Video and Biometric Consent rather than by this document.",
  ],
  // --- The arbitration proposal, dropped rather than adopted.
  //
  // Section 15 of the terms draft proposed binding arbitration and a class-action waiver, with
  // its own note that either it gets adopted into the live agreement or it gets dropped, and
  // that it should not stay half-applied. Half-applied is what it was: /terms is now a PUBLIC
  // page serving this document, so the note's own premise -- "a proposal in a document nobody
  // has been shown" -- stopped being true the day that route shipped. Since then a reader of
  // /terms was told disputes go to arbitration while every other Forge document, including the
  // one they actually accept at signup, said Maricopa County courts. A counterparty gets to
  // pick between two live documents that disagree, so this is the direction the contradiction
  // gets resolved in: drop it, because adopting a consumer's waiver of court access and of
  // class participation -- on a platform whose users include minors -- is counsel's call, not
  // a consistency edit. Adopting it later means adding it to BOTH documents at once.
  //
  // The text below is the text being removed, so it is spelled out here rather than imported:
  // the drafts no longer contain it, and an installation that took the old version does.
  [
    `15. DISPUTE RESOLUTION AND BINDING ARBITRATION
Except as set out below, any dispute, claim, or controversy arising out of or relating to these Terms or your use of the Service will be resolved by binding arbitration administered by the American Arbitration Association under its Consumer Arbitration Rules, instead of in court, except that either party may bring an individual claim in small-claims court where eligible. You and Forge each waive any right to a jury trial.

Class Action Waiver: Any arbitration or proceeding will be conducted only on an individual basis, not as a class, collective, or representative action, to the fullest extent the law allows.

Minors: This arbitration and class-action-waiver section applies only to a user who is 18 or older at the time a dispute arises. For a dispute involving an athlete under 18, this section does not apply, and the dispute may instead be brought in a court of competent jurisdiction, unless a parent or legal guardian separately and knowingly agrees to arbitration on the athlete's behalf in a signed writing. [Placeholder -- confirm this carve-out with counsel; state law on arbitration involving minors varies and this approach has not been reviewed.]

16. GOVERNING LAW
${GOVERNING_LAW_CLAUSE}

[Placeholder -- Section 15's arbitration and class-action waiver are a PROPOSAL and are not in the live signup agreement, which carries the paragraph above and nothing more. Two live documents describing two different dispute paths is ambiguity a counterparty gets to pick between, so either Section 15 is adopted and added to the live agreement, or it is dropped. It should not stay half-applied.]

17. CHANGES TO THESE TERMS
We may update these Terms; continued use after an update means you accept the revised Terms. Material changes will be reflected in the version an athlete is asked to accept at signup.

18. CONTACT`,
    `15. GOVERNING LAW
${GOVERNING_LAW_CLAUSE}

16. CHANGES TO THESE TERMS
We may update these Terms; continued use after an update means you accept the revised Terms. Material changes will be reflected in the version an athlete is asked to accept at signup.

17. CONTACT`,
  ],
  // The EULA and the licence agreement each carried a paragraph explaining that the terms
  // PROPOSE arbitration and that the proposal does not apply here. With the proposal gone there
  // is nothing to disclaim, and a paragraph describing a section that no longer exists is worse
  // than no paragraph at all.
  [
    `${GOVERNING_LAW_CLAUSE}

The Terms of Service propose binding arbitration with a class-action waiver for disputes about the Service. That proposal has not been adopted and does not apply to this Agreement; if it is ever adopted, this section and that one are to be read together and this Agreement updated to match.`,
    GOVERNING_LAW_CLAUSE,
  ],
  [
    "unless a specific request for further deletion is made. [Placeholder -- confirm this matches what BIPA",
    `unless a specific request for further deletion is made. Either request can be made at ${FORGE_CONTACT_EMAIL}. [Placeholder -- confirm this matches what BIPA`,
  ],
  // --- The terms gained an intellectual-property and automated-access section.
  //
  // Seventeen sections and not one of them said the software, the exercise library or the site
  // content belonged to Forge, or that harvesting it was not allowed. The gap mattered more here
  // than for most products: the thing worth scraping is the coaching library, which is an asset
  // rather than marketing copy. Section 1 already bound a visitor who never signs up ("or using
  // the Forge app or website"), so what was missing was the substance, not the reach.
  //
  // ONE PATCH FOR THE WHOLE TAIL rather than eight renumbering patches. Renumbering in pieces
  // cascades: rename 10 to 11 and the next patch looking for 11 finds the heading just created.
  // A single exact match cannot half-apply.
  [
    "10. TERMINATION\nWe may suspend or terminate an account that violates these Terms. You may stop using Forge and delete your account at any time.\n\n11. DISCLAIMER OF WARRANTIES\nThe Service is provided \"as is,\" without warranties of any kind, to the fullest extent the law allows.\n\n12. LIMITATION OF LIABILITY\nTo the fullest extent the law allows, Forge Performance Systems LLC is not liable for indirect, incidental, or consequential damages arising from use of the Service, including injuries arising from training activity -- athletic training carries inherent physical risk that using this app does not create or increase.\n\n13. ASSUMPTION OF RISK\nAthletic training -- including weightlifting, sprinting, jumping, and other movements tracked or programmed through Forge -- carries inherent risks of physical injury, up to and including severe injury or death. By using the Service, you expressly acknowledge and assume these risks. As stated in Section 3, Forge's camera-based tracking, AI-generated suggestions, and form-fault flags are informational aids only; they do not guarantee safety, correct execution of any movement, or the absence of injury. A coach using the Service remains responsible for appropriately supervising and modifying training for their own athletes.\n\n14. INDEMNIFICATION\nYou agree to defend, indemnify, and hold harmless Forge Performance Systems LLC, its affiliates, officers, and employees from any claim, damage, liability, or expense (including reasonable attorneys' fees) arising from: (a) your use of the Service, (b) your violation of these Terms, or (c) injury or harm arising from athletic training you directed, supervised, or performed. This section does not extend to a claim arising from Forge's own gross negligence or willful misconduct.\n\n15. GOVERNING LAW\nThis agreement, and any dispute arising out of it or out of your use of Forge, is governed by the laws of the State of Arizona, without regard to its conflict-of-laws provisions. The parties will first try to resolve any dispute by talking to each other. Anything not resolved that way lies in the state and federal courts located in Maricopa County, Arizona, and both sides consent to the jurisdiction of those courts. Nothing here waives a right that cannot lawfully be waived, including a right belonging to a person under 18.\n\n16. CHANGES TO THESE TERMS\nWe may update these Terms; continued use after an update means you accept the revised Terms. Material changes will be reflected in the version an athlete is asked to accept at signup.\n\n17. CONTACT\nForge is operated by Forge Performance Systems LLC, 5145 North 7th Street, D-237, Phoenix, Arizona 85014.\n\nQuestions about these Terms, or about your account: forgeperformancesystems@outlook.com",
    "10. INTELLECTUAL PROPERTY AND AUTOMATED ACCESS\nForge, its software, its exercise and coaching library, and the content of its website are Forge's property. You may use them through the Service as it is intended to be used. You may not copy, scrape, or harvest them, access the Service by automated means, or reverse-engineer the software, except where the law says otherwise. This does not affect your own content, which is covered by Section 6.\n\n11. TERMINATION\nWe may suspend or terminate an account that violates these Terms. You may stop using Forge and delete your account at any time.\n\n12. DISCLAIMER OF WARRANTIES\nThe Service is provided \"as is,\" without warranties of any kind, to the fullest extent the law allows.\n\n13. LIMITATION OF LIABILITY\nTo the fullest extent the law allows, Forge Performance Systems LLC is not liable for indirect, incidental, or consequential damages arising from use of the Service, including injuries arising from training activity -- athletic training carries inherent physical risk that using this app does not create or increase.\n\n14. ASSUMPTION OF RISK\nAthletic training -- including weightlifting, sprinting, jumping, and other movements tracked or programmed through Forge -- carries inherent risks of physical injury, up to and including severe injury or death. By using the Service, you expressly acknowledge and assume these risks. As stated in Section 3, Forge's camera-based tracking, AI-generated suggestions, and form-fault flags are informational aids only; they do not guarantee safety, correct execution of any movement, or the absence of injury. A coach using the Service remains responsible for appropriately supervising and modifying training for their own athletes.\n\n15. INDEMNIFICATION\nYou agree to defend, indemnify, and hold harmless Forge Performance Systems LLC, its affiliates, officers, and employees from any claim, damage, liability, or expense (including reasonable attorneys' fees) arising from: (a) your use of the Service, (b) your violation of these Terms, or (c) injury or harm arising from athletic training you directed, supervised, or performed. This section does not extend to a claim arising from Forge's own gross negligence or willful misconduct.\n\n16. GOVERNING LAW\nThis agreement, and any dispute arising out of it or out of your use of Forge, is governed by the laws of the State of Arizona, without regard to its conflict-of-laws provisions. The parties will first try to resolve any dispute by talking to each other. Anything not resolved that way lies in the state and federal courts located in Maricopa County, Arizona, and both sides consent to the jurisdiction of those courts. Nothing here waives a right that cannot lawfully be waived, including a right belonging to a person under 18.\n\n17. CHANGES TO THESE TERMS\nWe may update these Terms; continued use after an update means you accept the revised Terms. Material changes will be reflected in the version an athlete is asked to accept at signup.\n\n18. CONTACT\nForge is operated by Forge Performance Systems LLC, 5145 North 7th Street, D-237, Phoenix, Arizona 85014.\n\nQuestions about these Terms, or about your account: forgeperformancesystems@outlook.com",
  ],
];

/** Applies the patches above to one stored document. Returns null when nothing changed. */
export function patchLiveDocuments(content: string): string | null {
  let next = content;
  for (const [from, to] of LIVE_DOCUMENT_PATCHES) {
    // Skip a patch whose result is already there. Several of these replacements CONTAIN the text
    // they match on -- prepending an address line to a contact sentence leaves that sentence
    // intact -- so a naive replace applies again on the next deploy and stacks the address up
    // once per run. Checked here rather than by rewriting the patterns to be self-excluding,
    // because that only has to be got wrong once to corrupt a live document.
    // ...but only for a patch whose RESULT still matches its own pattern. A patch that REMOVES
    // text -- the arbitration ones above -- has a result that is a piece of what it matched, so
    // the stored document contains `to` before the patch runs and this guard would skip it
    // forever. Those are self-guarding instead: once the removal has happened, `from` is no
    // longer in the document and the replace is a no-op.
    if (to.includes(from) && next.includes(to)) continue;
    next = next.split(from).join(to);
  }
  return next === content ? null : next;
}
