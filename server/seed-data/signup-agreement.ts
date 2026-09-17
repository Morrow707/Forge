// The clickwrap agreement actually shown at signup and snapshotted into every
// terms consent record (storage.getLegalAgreement, legalAgreement id=1).
//
// NOT REVIEWED BY A LAWYER. Every factual claim below was written from the
// code and is true of what Forge does today -- that is the part this file can
// guarantee, and the part a template cannot. Whether it is legally sufficient,
// and under which statute, is counsel's call; see the standing note at the top
// of shared/privacy-tiers.ts about not claiming compliance. What it replaces
// was worse in a way worth naming: text whose own first line read
// "PLACEHOLDER -- replace with your own reviewed terms before relying on this",
// snapshotted into every consent record on the platform as the thing each user
// agreed to.
//
// Deliberately NOT carrying the DRAFT_NOTICE banner that
// legal-documents-draft.ts puts on its five documents. Those are admin-editable
// drafts nobody has ever been shown; this one is live, and a consent record
// whose document announces itself as unreliable is the problem being fixed, not
// a caution being preserved.
//
// Two things this document deliberately does not do:
//   - It does not restate the video and biometric release. That is its own
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
// Keep this in sync with the code. A claim here that no longer matches
// behaviour is a bug in this file, the same rule docs/privacy-policy-facts.md
// states about itself.

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

These terms cover your use of the Forge app and website ("Forge"). By creating an account you agree to them. They are written to be read, not skimmed past, and they describe what the software actually does.

1. WHAT FORGE IS, AND WHAT IT IS NOT

Forge is a training and coaching tool. It holds programming, logs what you lift, analyses video of you training, and generates written feedback and suggestions.

Forge is not a medical device and does not provide medical advice, diagnosis, or treatment. Its measurements, analytics, and AI-generated suggestions are informational aids for coaches and athletes. They are never a substitute for the judgment of a physician, physical therapist, athletic trainer, dietitian, or coach. If something in Forge conflicts with what a qualified professional has told you, follow the professional.

Forge is not a clinical system of record and is not HIPAA compliant. If you are a licensed clinician, do not enter Protected Health Information or use Forge to document patient care. A fuller explanation for clinicians appears at the end of this document.

2. TRAINING CARRIES RISK

Strength training, jumping, sprinting, and skill work can cause injury, including serious injury. That risk exists whether or not software is involved, and Forge does not remove it.

You are responsible for deciding whether an exercise is appropriate for you, for using equipment correctly, and for stopping immediately if something causes pain or feels unsafe. Do not train through pain because a program says to. A prescribed weight, rep count, or progression in Forge is a suggestion generated from what you have logged; it is not an instruction from anyone who can see you.

If you coach athletes through Forge, supervising and modifying their training remains yours. Forge does not assess whether an athlete is ready for a movement.

Before starting or substantially changing a training program, and especially if you have a medical condition, an injury, or have been inactive, consult a physician.

3. WHO CAN USE FORGE

You may create an account for yourself if you are 18 or older.

An athlete under 18 may use Forge only with a parent or legal guardian who has their own linked Forge account and has agreed on the athlete's behalf. This is enforced by the software, not merely requested: a minor athlete's account is held and cannot be used until a guardian has claimed it and agreed. It applies to every athlete under 18 however they arrived -- signing up alone, invited by a coach, or moved between teams. An athlete whose date of birth is not on record is held the same way until it is supplied.

At the point of claiming, the guardian agrees separately to these terms, to the privacy policy, and to the video and biometric consent, and a confirmation is emailed to them describing what was agreed and how to withdraw it.

A guardian may withdraw that consent at any time. Doing so deletes every stored video on the athlete's account and returns the account to the held state; the athlete cannot use Forge again until a guardian consents afresh.

You are responsible for keeping your password to yourself and for what happens under your account. Tell us promptly if you believe someone else has access to it.

4. WHAT YOU ENTER, AND WHO SEES IT

Forge holds what you give it: your profile, your training, and -- if you use those features -- how you are sleeping and feeling, injuries you record, and what you eat.

Some of that is health information about you. You choose whether to enter it. If you do, your coaches and the staff of your organization can see it, because that is what makes it useful to them. A parent or guardian can see their own athlete's record, including training history, video, wellness and injury entries, nutrition and food log. Forge administrators can see it for support, auditing, and video management, and every time a coach or administrator opens an athlete's video it is written to an access log.

There is no public or general-audience visibility for athlete media anywhere in Forge.

Do not enter personal information about another person without their permission.

5. NUTRITION AND FOOD LOGGING

Forge's nutrition features -- calorie and macronutrient targets, food logging, and any dietary suggestion generated by an AI feature -- are general information, not dietetic or medical advice, and are not individually prescribed by a qualified professional.

They are not appropriate as a weight-loss program, and they are not designed for anyone with, or at risk of, a disordered relationship with food. Consult a physician or a registered dietitian before acting on them, and do so before applying any of it to an athlete under 18. Intake targets for a growing athlete are a clinical question, not a calculation.

If you are a coach or a guardian, guidance shown to a minor's account is your call to supervise.

6. CAMERA TRACKING AND BIOMETRIC DATA

If you film a set, Forge records video on your device and measures your movement from it -- the positions of your joints over time, and figures derived from them such as bar speed, range of motion, and jump height. The pose analysis runs on your own device against a clip recorded locally; what reaches Forge's servers is the video file, where it is kept, and the numbers.

Forge does not perform facial recognition, does not read fingerprints, and records no audio. The capture session has no audio input and the app requests no microphone permission.

Collection of this data is governed by a separate video and biometric consent, not by this document. An adult athlete agrees to it in their own right; for an athlete under 18 it comes from their guardian. Camera tracking is optional -- you can train and log normally without it -- and a guardian can switch it off for their athlete at any time.

7. HOW LONG VIDEO IS KEPT

Raw video of an athlete under 13 is deleted 30 days after the set. For an athlete aged 13 to 17, 90 days. This runs automatically and unconditionally.

For all athletes, Forge also keeps a limited number of recent videos per exercise, of which a few can be marked favourite and are never deleted automatically. The current limits are shown in the app. Before a video is deleted under this limit you are warned in advance, with a link to the clip.

Deleting a video does not delete the numbers derived from it. Range of motion, velocity, jump height, repetition counts, personal bests, and similar figures are your training record and are kept. Deletion of the training record itself can be requested separately, and you can delete your whole account at any time.

8. AI FEATURES

Where you use an AI feature, Forge sends what that feature needs to a third-party AI model provider. For AI coaching and written feedback, that is your training data and profile information.

For an AI form check, it also includes still images taken from the training video you submitted, together with your height, build, and any movement restriction or asymmetry recorded in your profile. That means images of the athlete leave Forge. AI features run only when you or your coach ask for them.

AI output is generated by software and can be wrong. Section 1 applies to all of it.

9. OTHER SERVICES FORGE RELIES ON

Forge does not sell, rent, or trade your personal information, and does not sell biometric data. It shares information only with the providers that operate the service: application and database hosting, payment processing, app store billing and push notification delivery, transactional email, a geolocation lookup on the IP address of a sign-in so a new-device alert can name where it came from, food and nutrition databases for the terms you search, and the AI model provider described above. Each receives only what it needs for that function.

Forge may disclose information where required by law, to protect its rights or property, or in an emergency to protect someone's safety.

10. RESEARCH

Forge may share de-identified, aggregated extracts with outside parties, but only for athletes who have separately opted in -- it is off unless chosen, and separate from any other setting. For a minor the answer comes from a guardian. Extracts are built from a mirror written ahead of time rather than from live athlete records, no group smaller than ten people is described in anything that leaves, and withdrawal removes the athlete from the mirror.

11. PAYING FOR FORGE

Paid plans are billed through the payment processor or app store shown at checkout, on the interval stated there, and renew until cancelled. Cancel through the same place you subscribed; app store purchases are managed and refunded under that store's rules, not by Forge. Prices can change with notice for future billing periods.

A payment made by a parent or guardian on a minor's behalf is also recorded as a verification step in the guardian consent process.

12. YOUR CONTENT

What you upload stays yours. You give Forge the permission it needs to store it, process it, and show it to the people described in section 4 so that the features work. Forge does not use athlete video or images for advertising or promotion. Use of an athlete's likeness is governed by the separate video and biometric consent.

Forge's own content -- programming, lessons, written material, and the software -- stays Forge's.

13. ACCEPTABLE USE

Do not use Forge to harass anyone, to upload content you have no right to upload, to reach data belonging to someone else, to disrupt the service, or to break the law. Do not attempt to re-identify an individual from any aggregated or de-identified figure Forge shows you.

14. ENDING IT

You can delete your account at any time, which removes it and the videos tied to it.

Forge may suspend or close an account that breaches these terms, and may discontinue features. Where a guardian withdraws consent, the athlete's account is held as described in section 3.

15. NO WARRANTY, AND LIMITS ON LIABILITY

Forge is provided as is. It may be unavailable, may contain errors, and its measurements may be inaccurate -- camera-derived figures in particular depend on filming conditions and are estimates, not instrument readings. To the fullest extent the law allows, Forge disclaims all warranties, express or implied, including fitness for a particular purpose.

To the fullest extent the law allows, Forge is not liable for indirect, incidental, or consequential damages, and its total liability arising out of your use of the service is limited to the amount you paid for it in the twelve months before the claim. Nothing here limits liability that cannot lawfully be limited, including for death or personal injury caused by negligence, or for fraud.

You accept the risks described in section 2 as risks of training, which exist independently of this software.

16. CHANGES

These terms can change. The current version is always the one shown at signup and available in the app, and the exact version you agreed to is recorded with the date you agreed to it, so you can always establish what you accepted and when.

Forge does not currently send a notice when these terms change. Rather than promise one it does not send, this says so: check this page for the current version. Continuing to use Forge means the current version applies.

17. GOVERNING LAW AND DISPUTES

${GOVERNING_LAW_CLAUSE}

18. CONTACT

Forge is operated by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.

Questions about these terms, a request about your data, or a request to withdraw a consent: ${FORGE_CONTACT_EMAIL}`;

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
