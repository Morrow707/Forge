// The admin-editable Privacy Policy, EULA, and Parental Notice (see
// shared/schema.ts legalDocuments). Grounded in what Forge actually does
// today -- camera-based tracking, the AI features, the wellness/nutrition/
// injury data it collects, the age-tier system -- not generic boilerplate.
//
// REVIEWED BY COUNSEL. Drafted by a lawyer, corrected against the code on
// 2026-09-19 (see git log for this file), and confirmed reviewed as they
// stand by Scott on 2026-09-20: "yes the others are attorney reviewed".
// The _DRAFT suffixes are historical variable names, not banners. Changing
// a word here is changing a reviewed document: the Privacy Policy and the
// Notice carry prior-shipped hashes (shipped-versions.ts) so an edit is
// registered as a new version rather than silently overwriting the text an
// installation stored.

import { TIER1_VIDEO_RETENTION_DAYS, TIER2_VIDEO_RETENTION_DAYS } from "@shared/privacy-tiers";
import {
  FORGE_CONTACT_EMAIL,
  FORGE_POSTAL_ADDRESS,
  FORGE_LEGAL_ENTITY,
  GOVERNING_LAW_CLAUSE,
} from "@shared/contact";
import {
  isShippedVersion,
  PARENTAL_NOTICE_PRIOR_SHIPPED,
  PRIVACY_POLICY_PRIOR_SHIPPED,
} from "./shipped-versions";

const DRAFT_NOTICE =
  "DRAFT -- not reviewed by a lawyer. This document is a starting point for legal review, not a finished, reliable Terms of Service. Do not treat it as legally sufficient until counsel has reviewed and approved it.";

/* TERMS_OF_SERVICE_DRAFT WAS HERE, AND IS DELETED ON PURPOSE.
 *
 * Scott, 2026-09-19: "merge them, just one less document that gets in the way".
 * Forge had two Terms -- this admin-editable public one, which nobody ever
 * accepted, and the signup clickwrap people actually agree to. There is now one:
 * SIGNUP_AGREEMENT in ./signup-agreement.ts, titled "Terms of Use", accepted at
 * signup, served at /terms, and read on the guardian claim page. The six clauses
 * this document said that the other one did not were carried over in its own
 * words; signup-agreement.ts's header lists them.
 *
 * WHAT HAPPENS TO AN EXISTING legal_documents ROW OF TYPE terms_of_service: it is
 * LEFT WHERE IT IS AND NEVER READ. Not deleted, unlike the institutional outline
 * below -- that one was a document nobody was allowed to send, one click from
 * being emailed to a school, so leaving it was the risk. This one is inert the
 * moment nothing renders it: GET /api/legal-documents/terms_of_service serves the
 * signup agreement now, there is no editor for it on the admin documents page, and
 * an admin's own edits to it are somebody's work that a retirement is no reason to
 * destroy. Deleting it would also make "what did /terms say in March" unanswerable.
 *
 * The legal_document_type enum keeps its "terms_of_service" value (Postgres cannot
 * drop one, and it is also a consent_type naming real acceptance records), and so
 * does the route path, so every stored URL and every consent record still resolves.
 * Only the TEXT behind them changed.
 *
 * No migration lane, and TERMS_OF_SERVICE_PRIOR_SHIPPED went with the document: a
 * lane exists to move an installation from an old version of a document onto a new
 * one, and there is no new version of this document to move anyone onto. The hashes
 * answered one question -- "may this stored text be overwritten?" -- and nothing
 * overwrites it any more.
 */

export const PRIVACY_POLICY_DRAFT = `FORGE -- PRIVACY POLICY

1. OVERVIEW
This Privacy Policy describes what Forge Performance Systems LLC ("Forge") collects through the Forge app and website, why, and what control you have over it.

2. INFORMATION WE COLLECT
- Account/profile: name, email, role, sport, position, age/date of birth, height, weight, season phase.
- Performance data captured via on-device camera tracking: bar-path velocity, range of motion, jump height, sprint splits, joint angles, and similar biomechanical metrics, computed from video processed on the athlete's own device.
- Video: form-check clips an athlete chooses to save, and skill-drill clips, both opt-in per recording.
- Wellness and health-adjacent data: daily sleep/soreness/stress/hydration self-reports, injury history, goniometer joint-mobility readings, movement-screen results.
- Nutrition data an athlete chooses to log, including photos of meals when using photo-based logging.
- Apple Health data, only if you turn on Health sync: sleep, resting heart rate, heart rate variability, VO2 max, respiratory rate, weight, and heart rate around a training session, used to pre-fill your daily check-in and to estimate recovery. Forge reads this data and never writes to Apple Health.
- Usage data: login timestamps, device/app version, and similar technical data needed to operate and secure the Service.

3. HOW WE USE INFORMATION
To provide the Service: running programs, showing tracked metrics and trends to an athlete and their coach, generating AI program/coaching suggestions, sending notifications an athlete or coach has opted into, and platform-level aggregate analytics (always with names, emails, and team affiliation removed -- see Section 7).

4. BIOMETRIC INFORMATION
The camera-tracked performance metrics and joint-angle data above are derived from video processed on-device; raw video is uploaded only when an athlete explicitly chooses to save a clip. We do not sell biometric information. Where state law treats this data as biometric information (for example, Illinois' Biometric Information Privacy Act), we collect it only after you, or your parent or guardian if you are under 18, have accepted our separate Video and Biometric Consent, we keep it only for the periods set out in that consent and in Section 6 below, and we never sell it or share it outside your own program.

5. CHILDREN'S PRIVACY
Forge sorts accounts by age into three tiers. An athlete under 18 cannot use Forge until a parent or legal guardian has claimed a linked guardian account and given consent; for an athlete under 13, that claim is the parental consent required by federal law, and camera tracking stays off until the guardian turns it on. Raw video for accounts under 18 is automatically deleted after the retention periods in Section 6 (numeric performance data is not). Athletes aged 13 to 17 get privacy-protective defaults. This structure is designed to meet the Children's Online Privacy Protection Act. A parent or guardian's consent is obtained and recorded before any child under 13 can use the Service.

6. HOW LONG WE KEEP INFORMATION
Raw video of an athlete under 13 is deleted ${TIER1_VIDEO_RETENTION_DAYS} days after it was recorded; for an athlete aged 13 to 17, ${TIER2_VIDEO_RETENTION_DAYS} days. A program may set a shorter limit for its own athletes. The numeric metrics derived from a video are kept as part of the athlete's training record until the account is deleted. Other account data is kept until an account is deleted, at which point it is permanently removed (see Section 9).

7. HOW WE SHARE INFORMATION
We do not sell personal information. We share information with:
- Service providers who process data on our behalf to run the Service: our AI provider (Anthropic) for AI-generated features, which receives the text of a request at the moment it is made and does not retain it to train models; our email provider (Resend) for account and notification emails; public food-database lookups (Open Food Facts, USDA FoodData Central) for nutrition logging; Stripe for payment processing on the website; Sentry for error reporting so we can fix crashes, which receives technical details of the failure and an account identifier; and an IP geolocation service, which receives the IP address of a sign-in so we can show you an approximate location for your own sessions and alert you to a sign-in from a new device.
- Wellness check-in values, including any that were pre-filled from Apple Health, are included in the information sent to our AI provider when generating coaching suggestions. Apple Health data is never used for advertising and is never sold or shared for any purpose other than providing the Service to you.
- Apple and Google, as required to operate push notifications and distribute the app through their platforms.
- A coach, for their own roster athletes' data, as the core function of the Service.
- Platform-wide aggregate analytics an admin can view are stripped of name, email, and team before an admin ever sees them. Individual-level rows carry a code that changes between queries and that nothing maps back to an account, so one query's results cannot be joined to another's or resolved to a person.
- De-identified group statistics with a research organisation, ONLY for athletes whose guardian, or who themselves if 18 or over, has separately and affirmatively agreed to it. This is off by default and is not part of any membership. Declining changes nothing about the Service or what you pay.

  What such a report contains: group figures only, for example the average vertical jump of a named number of athletes in an age and sport band. Any figure describing fewer than ten athletes is withheld rather than shown.

  What it never contains: names, email addresses, dates of birth, addresses, schools, teams, coaches, video, anything you or your coach typed in your own words including injury descriptions, or any date that could place an event on a particular day. Nothing in such a report can be traced back to an individual, and we do not keep a key that would allow it.

  Consent can be withdrawn at any time, and that athlete is left out of everything prepared afterwards. A report already delivered cannot be recalled.

  We do not sell access to information that identifies an individual. Where a research organisation pays for a de-identified dataset, what they receive is the group statistics described above.

8. DATA SECURITY
We use industry-standard measures (encrypted connections, access controls, audit logging of staff access to individual athlete video/records) to protect your information, but no system is perfectly secure.

9. YOUR RIGHTS AND CHOICES
You can review and correct your profile information in the app, and permanently delete your account (and, for athletes, its video files) at any time from within the app. Depending on where you live, you may have additional rights under applicable state privacy law; contact us to exercise them.

10. CHANGES TO THIS POLICY
We may update this Policy as the Service changes. Each version carries its effective date, and the exact text you accepted is recorded with your consent. We will notify you in the app of a material change.

11. CONTACT
Forge is operated by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.

Questions about this Policy, or to make a request about your data: ${FORGE_CONTACT_EMAIL}`;

// THE BIOMETRIC DRAFT IS GONE. The document Forge uses is BIOMETRIC_RELEASE in
// biometric-release.ts -- the one Scott supplied, which replaced this draft entirely.
//
// What used to sit here was that draft's full text, kept as evidence that
// BIOMETRIC_WAIVER_DRAFT_SNAPSHOT_PREFIX really is its opening. The prefix is pinned by
// its own hash now, so the body was carrying nothing. The prefix itself stays where it is
// and is not the draft -- it is what RECOGNISES the draft in an installation that still
// stores it, so that seed can replace it. Deleting that would not remove the draft from
// anywhere; it would strand it.

// Addressed to a parent/guardian, not the athlete -- distinct from every
// other document in this file, which speaks to whoever's using the app.
// This is what shared/privacy-tiers.ts's GUARDIAN_NOTICE_LIVE flag and
// users.requiresGuardianNotice exist to eventually deliver: real content
// for the "notice" half of "parental notice," which the compliance report
// has flagged as unwritten until now. Scoped to Tier 2 (13-17, who can
// self-register today) -- Tier 1 (under 13) never reaches this document at
// all, since that tier can't self-register in the first place and goes
// through coach_coppa_consent instead, given by the registering coach as
// the athlete's agent. [Placeholder -- confirm with counsel that Tier 2
// even needs a document called a "parental notice" in the first place, as
// opposed to just the existing self-registration flow; the age at which a
// state expects parental involvement for a minor's data varies, and this
// draft assumes 13-17 warrants one without that having been confirmed
// against real law.]
export const PARENTAL_NOTICE_DRAFT = `FORGE -- NOTICE TO PARENT OR GUARDIAN

An athlete under 18 has been listed on Forge with you as their parent or legal guardian. This notice tells you what that account is, what it collects, and what you need to do. For an athlete under 13, this notice is also the document your consent is recorded against.

1. THE ACCOUNT DOES NOT WORK UNTIL YOU CLAIM IT

This is the part that needs doing. An athlete under 18 cannot use Forge until a parent or legal guardian has their own linked Forge account. Until then the athlete can sign in and see nothing but a screen telling them to wait for you.

Use the link in the email this notice came with. It takes a few minutes and it is what turns the account on. Claiming the account is how you give the consent that federal law requires before a child under 13 can use an online service. We send a second email afterwards confirming that you did.

Depending on their age, the athlete either made the account themselves or a coach created a slot for them and handed them a code. Either way the account is held until you claim it.

2. WHAT FORGE IS

An athletic training platform. Coaches write training programmes, athletes log what they lift, and the app can measure movement from video the athlete records on their own phone -- bar path, range of motion, velocity, jump height, sprint times and similar figures.

Forge supervises nothing. Nobody employed by Forge is present at a session, watches a lift, or is responsible for how an athlete trains.

3. WHAT IS COLLECTED

- Account and profile details: name, email, date of birth, sport, position, height and weight.
- Training the coach assigns and the athlete logs.
- Wellness self-reports the athlete chooses to fill in: sleep, soreness, stress.
- Nutrition the athlete chooses to log, including meal photos.
- If the athlete turns on Apple Health sync on their own phone: sleep, heart rate and related recovery readings, used to pre-fill their check-in. Forge never writes to Apple Health.
- Where camera tracking is on: the measurements above, and the video itself only when the athlete ticks "save clip for coach" after a set. A clip they do not save is not kept.

Some of what is measured from video is biometric information under Illinois' Biometric Information Privacy Act and comparable state laws. It is covered by a separate document, the Video and Biometric Consent, which you agree to when you claim the account.

4. CAMERA TRACKING, AND WHICH WAY THE SWITCH STARTS

For an athlete UNDER 13, camera tracking starts OFF. Nobody with authority has agreed to it yet, so nothing is measured from video until you turn it on yourself from your guardian dashboard. You do not have to. Training and logging work normally without it.

For an athlete aged 13 to 17, camera tracking starts ON, and you can turn it off at any time from your guardian dashboard. Turning it off stops further collection from that point.

5. WHO CAN SEE IT

The athlete. You, through the guardian dashboard. Their own coach and their organisation's staff, which is what coaching is. Forge administrators, for support, auditing and video management -- and every time a coach or administrator opens an athlete's video, that access is written to a log.

No other athlete, and no coach outside their own, can see any of it. There is no public or general-audience visibility for athlete media anywhere in Forge.

6. HOW LONG VIDEO IS KEPT

Raw video of an athlete under 13 is deleted 30 days after the set. For an athlete aged 13 to 17, 90 days. This runs automatically. A program may set a shorter limit for its own athletes.

Deleting a video does not delete the numbers taken from it. Those are the athlete's training record and are kept until the account is deleted.

7. WHAT YOU CAN DO, AT ANY TIME

- See everything on file for your athlete, through the guardian dashboard.
- Turn camera tracking on or off.
- Ask for a particular recording to be removed.
- Withdraw consent. This permanently deletes every raw video stored for the athlete, records what was withdrawn and when, and suspends the athlete's access until a parent or guardian consents again.
- Delete the account, which permanently removes its stored video immediately.

Any of these can also be done by writing to the address below.

8. GOVERNING LAW AND DISPUTES

${GOVERNING_LAW_CLAUSE}

9. CONTACT

Forge is operated by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.

Questions, a request about what Forge holds, or a withdrawal: ${FORGE_CONTACT_EMAIL}`;

/* INSTITUTIONAL_AGREEMENT_DRAFT WAS HERE, AND IS DELETED ON PURPOSE.
 *
 * It was never a lawyer's work -- its own banner said so: "assembled from
 * patterns in Forge's own consumer Terms of Service as a starting outline
 * only. Do not send this to a real institutional customer." It has been
 * superseded by a Service Agreement drafted through Rocket Lawyer, which
 * Forge and the institution sign outside the app; a coach uploads the signed
 * copy and it is stored as an external waiver of kind
 * "institutional_agreement" (shared/schema.ts), which is a DIFFERENT thing
 * that shares the name and is not going anywhere.
 *
 * A document nobody may send is worse than no document: it sat in the admin
 * documents list looking like the institutional contract, one careless click
 * from being emailed to a school.
 *
 * The legal_document_type enum keeps its "institutional_agreement" value --
 * Postgres cannot drop one, and an installation's history may reference it --
 * but nothing seeds it any more and reconcile-schema deletes the stored row.
 * server/seed-data/institutional-agreement-retired.test.ts holds this shut.
 */

export const EULA_DRAFT = `FORGE -- END USER LICENSE AGREEMENT

This Agreement is between you and Forge Performance Systems LLC ("Forge"). It covers the Forge application software (the "Application"). Your use of the Forge service, your account, and your data is governed separately by the Terms of Use and the Privacy Policy.

1. THIS AGREEMENT IS WITH FORGE, NOT APPLE
You acknowledge that this Agreement is between you and Forge alone, and not with Apple Inc. Forge, not Apple, is solely responsible for the Application and its content. This Agreement does not provide for usage rules for the Application that conflict with the Apple Media Services Terms and Conditions; in the event of a conflict, those terms govern to the extent of the conflict.

2. LICENSE GRANTED
Forge grants you a personal, limited, non-exclusive, non-transferable, revocable licence to use the Application on any Apple-branded device that you own or control, as permitted by the Usage Rules in the Apple Media Services Terms and Conditions, or on any other device for which the Application is distributed. The Application is licensed to you, not sold.

3. WHAT YOU MAY NOT DO
You may not copy, modify, reverse engineer, decompile, or disassemble the Application except where that restriction is prohibited by applicable law; rent, lease, lend, sell, or sublicense it; remove any proprietary notice from it; use it to build a competing product; or use automated means to extract data from it. You may not use the Application to reach data belonging to another person, or to attempt to re-identify an individual from any aggregated or de-identified figure it displays.

4. PURCHASES AND SUBSCRIPTIONS
Where the Application offers a subscription or in-app purchase, it is billed through the app store or payment processor identified at the point of purchase, on the interval stated there, and renews until cancelled. Cancellation and refunds for an app store purchase are handled under that store's rules, not by Forge.

5. MAINTENANCE AND SUPPORT
Forge is solely responsible for providing any maintenance and support for the Application, to the extent it chooses to offer any. Apple has no obligation whatsoever to furnish any maintenance or support services for the Application.

6. WARRANTY
The Application is provided as is, without warranty of any kind to the fullest extent permitted by applicable law. In the event of any failure of the Application to conform to any applicable warranty, you may notify Apple, and Apple will refund the purchase price for the Application to you, if any. To the maximum extent permitted by applicable law, Apple will have no other warranty obligation whatsoever with respect to the Application. Any other claims, losses, liabilities, damages, costs, or expenses attributable to any failure to conform to any warranty are Forge's sole responsibility.

7. TRAINING CARRIES RISK
The Application supports strength and athletic training, which can cause injury, including serious injury. Its measurements, analytics, and AI-generated suggestions are informational aids and are not medical advice, a diagnosis, or a treatment plan, and are not a substitute for the judgment of a physician, physical therapist, athletic trainer, dietitian, or coach. You decide whether an exercise is appropriate for you and you stop if something causes pain. Camera-derived measurements depend on filming conditions and are estimates, not instrument readings. This section does not replace the assumption of risk in the Terms of Use; it restates it because the Application can be installed by someone who has not read them.

8. PRODUCT CLAIMS
Forge, not Apple, is responsible for addressing any claim by you or a third party relating to the Application or your possession and use of it, including: (a) product liability claims; (b) any claim that the Application fails to conform to any applicable legal or regulatory requirement; and (c) claims arising under consumer protection, privacy, or similar legislation, including in connection with the Application's use of any health or biometric data. This Agreement does not limit Forge's liability beyond what applicable law permits.

9. INTELLECTUAL PROPERTY
In the event of any third-party claim that the Application or your possession and use of it infringes that third party's intellectual property rights, Forge, not Apple, will be solely responsible for the investigation, defence, settlement, and discharge of that claim.

10. LEGAL COMPLIANCE
You represent that you are not located in a country subject to a United States Government embargo or designated as a "terrorist supporting" country, and that you are not listed on any United States Government list of prohibited or restricted parties.

11. APPLE AS THIRD-PARTY BENEFICIARY
You acknowledge and agree that Apple, and Apple's subsidiaries, are third-party beneficiaries of this Agreement, and that upon your acceptance of it Apple will have the right (and will be deemed to have accepted the right) to enforce this Agreement against you as a third-party beneficiary of it.

12. TERMINATION
This licence is effective until terminated by you or by Forge. It terminates automatically if you breach it, and you must then stop using the Application and remove it from your devices. Deleting your Forge account is governed by the Terms of Use.

13. GOVERNING LAW
${GOVERNING_LAW_CLAUSE}

14. CONTACT
This Application is provided by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.

Questions about this Agreement: ${FORGE_CONTACT_EMAIL}`;

/** What the stored parental notice should become, given whatever is live. `null` means leave it
 * alone -- an admin's own wording is theirs, and only a version Forge shipped is replaced.
 *
 * Whole-document hashes rather than the biometric document's prefix match: this one has never
 * been edited in place by a migration, so every stored copy is byte-for-byte something Forge
 * wrote, and an exact match is the stricter test. */
export function nextParentalNotice(current: string | null): string | null {
  if (current === null) return PARENTAL_NOTICE_DRAFT;
  if (current === PARENTAL_NOTICE_DRAFT) return null;
  return isShippedVersion(current, PARENTAL_NOTICE_PRIOR_SHIPPED) ? PARENTAL_NOTICE_DRAFT : null;
}

/** What the stored privacy policy should become. `null` leaves it alone -- an admin's own wording
 * is theirs, and only a version Forge shipped is replaced. See PRIVACY_POLICY_PRIOR_SHIPPED for
 * why this one needed a lane rather than another patch. */
export function nextPrivacyPolicy(current: string | null): string | null {
  if (current === null) return PRIVACY_POLICY_DRAFT;
  if (current === PRIVACY_POLICY_DRAFT) return null;
  return isShippedVersion(current, PRIVACY_POLICY_PRIOR_SHIPPED) ? PRIVACY_POLICY_DRAFT : null;
}
