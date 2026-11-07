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
This is not a medical test and not a diagnosis. It is not a concussion test and must not be
used as one: if you have taken a blow to the head, see a clinician, not this screen. Forge
does not model, score or flag concussion, eating disorders or energy deficiency, and will not
tell your coach that you have any of them.

HOW ACCURATE IT IS
Not calibrated. No threshold in the Anvil has been checked against a reference instrument and
no athlete's results have been compared with a clinical measure. Treat what you see as a
record of what you did on the day, not as a verdict.

YOU CAN STOP
You can stop taking the check at any time, and turning off camera tracking in your account
turns this off with it. Your past results stay with your account and are deleted with it.

ADULTS ONLY FOR NOW
The Anvil is offered only to people aged 18 and over while its paperwork is with Forge's
lawyers.`;
