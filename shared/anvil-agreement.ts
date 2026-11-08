/**
 * WHAT A PERSON AGREES TO BEFORE THEIR FIRST ANVIL CHECK.
 *
 * **This is Forge's own disclosure, not a reviewed legal document, and the distinction is
 * load-bearing.** The eight documents at `/api/legal-documents/:type.pdf` were built with Forge's
 * attorney through Rocket Lawyer; this was written in-house on 2026-11-07 because question 15 --
 * whether the Video and Biometric Consent reaches a cognitive task at all -- is still open, and
 * showing an adult nothing while waiting is worse than showing them an accurate description of
 * what the check does.
 *
 * So it is deliberately NOT in `LEGAL_DOC_TYPES`, has no public page, and is not served beside the
 * reviewed set. The same reasoning as the coach's under-13 attestation, which is also a code
 * constant shown at the moment it applies.
 *
 * **IT CLAIMS NOTHING THE EVIDENCE DOES NOT CARRY.** No fatigue claim, no performance claim, no
 * concussion claim, and the words the vocabulary module forbids on a screen do not appear in it
 * either. What it says is what the software actually does, which is the only thing that cannot
 * become false.
 *
 * Changing this text changes what later signers agreed to, so the accepted text is snapshotted on
 * the consent row exactly as every other consent in Forge is -- a reader can always see the
 * version they accepted rather than today's.
 */
export const ANVIL_AGREEMENT_VERSION = "2026-11-07";

/**
 * WHAT THE AGREEMENT EXPLICITLY REFUSES, AND WHY THIS LIST EXISTS AT ALL.
 *
 * It is the one place in the Anvil besides `anvil-vocabulary.ts` where the forbidden topics appear
 * in code rather than in a comment -- because telling a person "this is not a concussion test" is
 * the opposite of modelling one, and saying so is the entire point of the sentence. Declaring the
 * refusals here earns that exemption by construction (the scan in `anvil-never-models.test.ts`
 * exempts a module that declares a prohibition, read off an export's NAME rather than a filename),
 * and it does a second job worth having: a test asserts the agreement really contains each
 * refusal, so deleting the sentence that refuses concussion fails rather than passing quietly.
 */
export const ANVIL_AGREEMENT_NEVER_CLAIMS: ReadonlyArray<string> = [
  "concussion",
  "medical test",
  "diagnosis",
];

/**
 * THE ONE CAVEAT SENTENCE, AND IT IS THE ANVIL'S OWN RATHER THAN THE CAMERA'S.
 *
 * `CAMERA_ACCURACY_INLINE` was the obvious thing to reach for and is wrong here: it says "camera
 * metrics", and a tap latency is not one. Borrowing it would put a true sentence about a
 * different instrument under a number it does not describe, which is worse than no caveat --
 * a reader who checks it finds it does not apply and discounts the next one too.
 *
 * It is a constant rather than typed at each surface for the reason `shared/camera-accuracy-copy.ts`
 * is: the day a threshold is checked against a reference instrument, this sentence stops being
 * true everywhere at once. A test asserts the agreement's own "HOW ACCURATE IT IS" section still
 * carries it, so the two cannot drift.
 */
/**
 * THE REFUSAL SENTENCE, AND WHY IT IS A CONSTANT RATHER THAN TYPED WHEREVER IT IS NEEDED.
 *
 * It contains two words `shared/anvil-vocabulary.ts` forbids on an Anvil surface, and that is the
 * whole point of it: telling a reader "this is not a concussion test" is the opposite of modelling
 * one. This module is the ONE place those words are allowed to appear, earned the same way
 * `anvil-never-models.test.ts` grants its exemption -- off a declared prohibition, not off a
 * filename -- and the consequence is that every surface RENDERS this constant instead of writing
 * the sentence again. A re-typed copy on a page would be caught by the vocabulary sweep, which is
 * exactly the right outcome: there is one wording, it is the wording counsel will review under
 * question 18, and a second copy is a second thing to review.
 */
export const ANVIL_NOT_A_MEDICAL_TEST =
  "This is not a medical test and not a diagnosis. It is not a concussion test and must not be used as one.";

export const ANVIL_ACCURACY_CAVEAT =
  "Not calibrated. No threshold in the Anvil has been checked against a reference instrument and no athlete's results have been compared with a clinical measure.";

export const ANVIL_AGREEMENT = `The Anvil: what the daily check does

WHAT YOU DO
Four short tasks on your phone, about three and a half minutes, once a day in the morning.
You tap when a shape appears. You tap on some signals and not others. You repeat a growing
sequence of squares. You tap as fast as you can for ten seconds.

WHAT FORGE RECORDS
The timing of every tap, to the millisecond; whether you responded when you should not have;
the longest sequence you repeated; and how many taps you made. Nothing else. No audio, no
video, no photograph, and nothing from your camera.

WHAT FORGE DOES WITH IT
Your results are compared with YOUR OWN earlier results, and with nobody else's. Forge also
reads training information you already give it -- logged sets, filmed lifts, sleep, soreness,
your food log -- so that a change in these numbers can be read beside what else was happening
that week.

WHO SEES IT
You see every result. If you train with a coach through Forge, your coach sees your daily
results and a weekly summary. Nobody else sees them. Forge does not rank you against your
teammates and does not show your coach a comparison between athletes.

WHAT THIS IS NOT
${ANVIL_NOT_A_MEDICAL_TEST} If you have taken a blow to the head, see a
clinician rather than a phone. Forge
does not model, score or flag concussion, eating disorders or energy deficiency, and will not
tell your coach that you have any of them.

HOW ACCURATE IT IS
${ANVIL_ACCURACY_CAVEAT} Treat what you see as a
record of what you did on the day, not as a verdict.

YOU CAN STOP
You can stop taking the check at any time, and turning off camera tracking in your account
turns this off with it. Your past results stay with your account and are deleted with it.

ADULTS ONLY FOR NOW
The Anvil is offered only to people aged 18 and over while its paperwork is with Forge's
lawyers.`;
