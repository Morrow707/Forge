import { FORGE_CONTACT_EMAIL, FORGE_POSTAL_ADDRESS, FORGE_LEGAL_ENTITY, GOVERNING_LAW_CLAUSE } from "@shared/contact";
import { isShippedVersion, BIOMETRIC_RELEASE_PRIOR_SHIPPED } from "./shipped-versions";

// The video and biometric release actually agreed to, and snapshotted into every
// biometric_waiver consent record (storage.recordBiometricRelease for an adult,
// logGuardianConsents for a minor's guardian at claim time).
//
// NOT REVIEWED BY A LAWYER, same standing caveat as the signup agreement beside
// it. What it replaces was not a safer version of that caveat -- it was
// BIOMETRIC_WAIVER_DRAFT, whose first line read "DRAFT -- not reviewed by a
// lawyer ... Do not treat it as legally sufficient", whose title ended in
// "(DRAFT)", which carried two bracketed counsel questions in its visible body,
// and whose closing line said signature capture "need[s] to be finalized with
// counsel BEFORE THIS IS USED TO COLLECT A REAL SIGNATURE". It was being used to
// collect real consent. A document that tells you not to use it this way, used
// this way, is worse evidence of agreement than no document.
//
// Three things it fixes beyond the banner, each a place the draft described
// software Forge does not run:
//   - "By signing" appeared twice. Nobody signs. Consent is a clickwrap, the
//     record stores the exact text plus timestamp, IP and user agent, and the
//     document now says that rather than implying a signature page exists.
//   - Withdrawal was described as "deleting the account". A guardian can now
//     withdraw without deleting anything (withdrawGuardianConsent), and an adult
//     can turn tracking off. Both are described here.
//   - Adults were told they had no video deletion window at all. The rolling
//     per-exercise cap applies to them whenever billing enforcement is on, so
//     that was true only by accident of the current switch.
//
// Carries the revisions already worked out in docs/legal-clause-revisions.md
// Part 1B: revocable rather than "absolute and irrevocable", no promotional use,
// and a right to review rather than a waiver of inspection -- all three because
// the guardian dashboard and the withdrawal path make the old wording describe
// software that does not exist.
//
// Keep in sync with the code. A claim here that no longer matches behaviour is a
// bug in this file.

/** The exact draft this replaced. Kept verbatim so the seed can recognise an
 * installation still carrying it, and ONLY for that -- see nextBiometricRelease.
 * Do not reformat; the exact match is the whole mechanism. Built the same way
 * the draft was (DRAFT_NOTICE, then the body) so it reproduces byte for byte. */
const DRAFT_NOTICE =
  "DRAFT -- not reviewed by a lawyer. This document is a starting point for legal review, not a finished, reliable Terms of Service. Do not treat it as legally sufficient until counsel has reviewed and approved it.";

export const BIOMETRIC_RELEASE = `FORGE -- VIDEO AND BIOMETRIC CONSENT

This consent covers video of an athlete training and the measurements Forge takes from it. It is separate from, and in addition to, Forge's Terms of Use and Privacy Policy. An adult athlete agrees to it for themselves. For an athlete under 18 it is agreed by a parent or legal guardian.

1. WHAT IS RECORDED AND MEASURED

When an athlete films a set, Forge records video on the athlete's own device and measures their movement from it:

- The positions of their joints over time, frame by frame.
- Figures derived from those positions: bar or body path, range of motion, concentric and eccentric velocity, bar-path deviation, jump height, ground contact time, repetition counts, and figures such as power and velocity loss calculated from them.

Some of this is biometric information under Illinois' Biometric Information Privacy Act and comparable state laws.

The analysis runs on the athlete's own device, against a clip recorded locally. What reaches Forge's servers is the video file, where it is kept, and the resulting numbers.

Forge does not perform facial recognition. It does not read fingerprints. It records no audio at all -- the capture session has no audio input and the app requests no microphone permission. It does not use any of this to identify or verify who someone is.

2. WHY

To provide coaching: showing an athlete and their coach their own performance, tracking it over time, and flagging movement faults. Nothing here is used for any other purpose.

3. WHO CAN SEE IT

The athlete. Their parent or legal guardian, through the guardian dashboard. Their coaches and their organization's staff. Forge administrators, for support, auditing and video management -- and every time a coach or administrator opens an athlete's video, that access is written to a log. The service providers named in the Privacy Policy, only as needed to operate the Service.

There is no public or general-audience visibility for athlete media anywhere in Forge.

4. NO PROMOTIONAL USE, AND NO SALE

Forge does not use an athlete's video, image or likeness for advertising, marketing, promotion or any public-facing purpose. Forge does not sell, rent, lease or trade personal information, and does not sell biometric data.

De-identified group statistics may be shared with an outside organization, including for payment, but only where the athlete (or their guardian) has separately opted in to that specific use, and only as group figures with any group of fewer than ten people withheld -- no identifiers, no video, no free text.

5. HOW LONG VIDEO IS KEPT

Raw video of an athlete under 13 is deleted 30 days after the set. For an athlete aged 13 to 17, 90 days. This runs automatically.

For all athletes, Forge keeps a limited number of recent videos per exercise, some of which can be marked favourite and are never deleted automatically; the current limits are shown in the app, and a video is flagged in advance before it is removed under them.

Deleting a video does not delete the numbers derived from it. Range of motion, velocity, jump height, repetition counts, personal bests and similar figures are the athlete's training record and are kept until the account is deleted. Deleting the account permanently removes that account's stored video immediately, for every age.

6. THE RIGHT TO SEE IT, AND TO STOP IT

A parent or guardian may view their athlete's stored video and derived performance data at any time through the guardian dashboard, and may request the removal of any particular recording. There is no right of prior approval over the automated analysis itself, or over its technical output, which software produces at the time of upload.

Camera tracking is optional. An athlete can train and log sets normally without it. A guardian can switch it off for their athlete at any time, and doing so stops further collection from that point on.

7. WITHDRAWING THIS CONSENT

This consent may be withdrawn at any time, without giving a reason, and withdrawal does not require deleting the account.

- A parent or guardian withdraws from the guardian dashboard. Doing so permanently deletes every raw video stored for that athlete, records the date and what was withdrawn, and suspends the athlete's access to Forge until a parent or guardian consents again.
- An adult athlete withdraws by turning camera tracking off in their account, or by writing to the address below.

Withdrawal operates from the point it takes effect and does not undo processing that already happened. As in Section 5, the numeric training record survives; its deletion can be requested separately.

8. HOW THIS CONSENT IS GIVEN AND RECORDED

This consent is agreed in the app, by an affirmative action that is not pre-ticked and not bundled with any other agreement. Forge stores the exact text of this document as it stood at that moment, together with the date and time, the IP address and the browser or device it was agreed from. That record is the evidence of consent; there is no separate signature page.

Declining is a real choice and carries no penalty. Sets still log, with reps and weight, without the camera measurements.

9. GOVERNING LAW AND DISPUTES

${GOVERNING_LAW_CLAUSE}

10. CONTACT

Forge is operated by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.

Questions, a request about what Forge holds, or a withdrawal: ${FORGE_CONTACT_EMAIL}`;

/** THE ERASER, NOT THE DRAFT.
 *
 * The opening of the superseded draft -- its banner and its title line, exactly as the seed once
 * wrote them. Its only job is to RECOGNISE that draft in an installation that still stores it,
 * so the seed can replace it with the document Forge actually uses. Deleting this would not
 * remove the draft from anywhere; it would strand whoever still has it on a document headed
 * "DRAFT -- not reviewed by a lawyer", which is the text a guardian would then be agreeing to.
 *
 * It goes when production is confirmed to hold the current document and not this, and not before.
 *
 * The draft's full body used to live in legal-documents-draft.ts as the evidence that this
 * string really was its opening. That body is deleted; biometric-release.test.ts pins this
 * string's hash instead, which is the same guarantee without carrying a dead document around. */
export const BIOMETRIC_WAIVER_DRAFT_SNAPSHOT_PREFIX = `${DRAFT_NOTICE}

FORGE -- BIOMETRIC INFORMATION CONSENT AND RELEASE (DRAFT)`;

/** What the stored biometric release should become, given whatever is live.
 * `null` means leave it alone.
 *
 * Matches on the draft's opening rather than its entire body, unlike the signup
 * agreement's migration, and the difference is deliberate: that document had one
 * known form, while this one has already been edited in place once (the contact
 * address patch), so an exact whole-document match would miss the very
 * installations that took it. The opening is still specific enough that only a
 * document Forge seeded can match -- it names the draft banner AND a title
 * ending in "(DRAFT)". An admin who has written their own release does not have
 * either. */
export function nextBiometricRelease(current: string | null): string | null {
  if (current === null) return BIOMETRIC_RELEASE;
  if (current === BIOMETRIC_RELEASE) return null;
  if (isShippedVersion(current, BIOMETRIC_RELEASE_PRIOR_SHIPPED)) return BIOMETRIC_RELEASE;
  if (!current.startsWith(BIOMETRIC_WAIVER_DRAFT_SNAPSHOT_PREFIX)) return null;
  return BIOMETRIC_RELEASE;
}
