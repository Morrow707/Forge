# Forge -- the Anvil: a daily check that includes cognitive tasks

**Prepared 2026-11-06 for legal review. Nothing described here is built.** As of this date the
Anvil exists as a written specification, a set of simulations, and a mock of the screens. No
athlete has ever taken it and no cognitive measurement of any kind has ever been recorded by
Forge. The questions this packet carries (`docs/legal-open-questions.md`, questions 15 to 24) are
being asked before the first minor sits down in front of it rather than after.

This packet is the companion to `docs/biometric-release-for-counsel.md`, which covers the video
and biometric consent and the engineering facts behind it. A reviewer who has read that one can
skip the next section.

## What Forge is

Forge is a strength-and-conditioning platform used by school and club programs and by individual
athletes. **Its users include minors, including children under 13.** An athlete under 18 cannot
use the product until a parent or legal guardian creates their own linked account and agrees on
their behalf; an under-13 account is additionally held inert until a linked guardian's payment
card is charged 50 cents and refunded, which is the verifiable-parental-consent mechanism counsel
specified in answering question 5.

There are two kinds of athlete account, and the distinction matters to several questions below:

- a **coached athlete**, on a program's roster, whose training data their coach already sees;
- a **Free Agent**, who has no coach and trains themselves.

## What the Anvil is

A daily self-administered check the athlete takes on their own phone. About three minutes, in
four parts:

1. **Simple reaction time.** 25 trials. A shape appears after an unpredictable interval of two to
   five seconds and the athlete taps as fast as they can. What is recorded is the interval
   between appearance and tap, in milliseconds.
2. **A go/no-go task.** 16 trials. Some signals mean tap, some mean do not tap, and one means
   wait and hold. What is recorded is the tap latency and whether the athlete tapped when they
   should not have.
3. **A spatial sequence.** Squares light in sequence and the athlete repeats the sequence, three
   long at the start and up to seven. What is recorded is the longest sequence repeated
   correctly.
4. **Finger tapping.** Ten seconds of tapping as fast as possible. What is recorded is the count
   of taps and their timing.

Two other sources sit alongside those four:

- **Self-reported traits** the athlete rates daily -- five of them on a rotating cycle, such as
  sleep quality, soreness and mood. Self-report of this kind is already collected by Forge's
  existing daily wellness check-in and is covered by the reviewed documents.
- **Numbers Forge's camera already produces** from lifts the athlete films in the ordinary course
  of training: jump height, bar speed, range of motion. These are already collected today and are
  covered by the Video and Biometric Consent. The Anvil reads them; it does not create them.

What the software does with all of it: it compares today's numbers against (a) the athlete's own
recent history, (b) the athlete's own early-season baseline with their training load accounted
for, and (c) athletes of the same age in previous years. It then shows two things:

- a **daily view** -- the numbers and how they moved;
- a **weekly view** -- a trend over time.

**Both are shown to the athlete. For a coached athlete, both are also shown to their coach. For a
Free Agent, only the athlete sees them.** That is an operator decision taken 2026-11-06 and it is
the fact that questions 17 and 18 turn on.

## What it is not, and what Forge intends to say

- **It is not a medical device, not diagnostic, and not a screen for concussion or any injury.**
- **It is not calibrated.** Every Forge surface that shows a camera-derived number already carries
  a standing accuracy warning; nothing in the Anvil has ever been measured against a reference
  instrument, and no threshold in it has been validated on a single real athlete.
- **Forge has decided not to use the words "neuro-fatigue" or "neural fatigue" anywhere a user can
  see**, because there is no accepted operational definition of either outside a laboratory. The
  product is called the Anvil. What Forge may call the thing it measures is question 24.
- **Forge will not model, score, flag or alert on concussion, and will not model RED-S** (relative
  energy deficiency in sport) or disordered eating. The reasoning behind the second is that RED-S
  can present with autonomic numbers that look *better* rather than worse, so a readiness model
  can actively mislead.
- **Forge cannot claim the measurement predicts athletic performance, and does not intend to.** A
  literature review on 2026-11-06 found that the best-known claim in this area -- that mental
  fatigue degrades endurance performance -- falls from a moderate effect to a non-significant one
  once publication bias is corrected for (Holgado, Sanabria, Perales & Vadillo 2020, *Journal of
  Cognition* 3(1):38, whose authors write that "current evidence does not provide conclusive
  support"), and that the equivalent claim for strength and power is a published null (Van Cutsem
  et al. 2017, *Sports Medicine*).

## Three facts that make this different from what has already been reviewed

A reviewer who has approved Forge's existing documents may reasonably ask what is new here. Three
things:

1. **Forge has never before asked an athlete to take a test.** Everything collected to date is
   either something the athlete did anyway (a lift, a meal, a weigh-in) or something they typed
   about themselves. A reaction-time task is an instrument administered to a child, whose output
   is a measure of that child's nervous system rather than a measure of their training.
2. **Forge has never before generated a number about a minor's body or mind that did not exist
   before Forge measured it.** Height, weight and date of birth are facts the family already
   holds. A millisecond reaction-time distribution is created by Forge and exists nowhere else.
3. **The design requires keeping it for years.** One of the three comparisons is year over year
   against the same athlete at an earlier age, which cannot work on data that has been deleted.
   That sits against Forge's existing posture of deleting minors' video on a 30-day (under 13) or
   90-day (13 to 17) schedule. Question 21.

## What Forge already holds, and under what consent

| | |
|---|---|
| Date of birth, height, weight, sport, position | Typed by the athlete or their guardian at signup. Terms of Use, Privacy Policy. |
| Filmed lifts and the numbers derived from them | Video and Biometric Consent, agreed separately by the adult athlete or by the guardian of a minor. An athlete who declines still logs reps and weight; only the camera measurements are withheld. |
| Daily self-report (sleep, soreness, mood, and similar) | Terms of Use, Privacy Policy. |
| Food log entries, body-mass entries | Terms of Use, Privacy Policy. |
| Apple Health readings, where the athlete granted them | Disclosed before the permission prompt; Privacy Policy section 7 covers the onward disclosure to the AI provider. |
| Research participation | A separate opt-in consent. Pseudonymous mirror; suppression floor of 10 on anything that leaves Forge. |

Every one of those documents was built with Forge's attorney through Rocket Lawyer and is
attorney-reviewed. A change to any of them is registered as a new version rather than edited in
place, and an existing user is re-asked.

## How the answers will be used

Each answer changes a clause, a screen or a decision, and then the question leaves
`docs/legal-open-questions.md`. Where an answer says a new disclosure or a new consent is needed,
it is drafted with the attorney and registered as a version in the same way the existing
documents were, and nothing ships to a minor before it exists.
