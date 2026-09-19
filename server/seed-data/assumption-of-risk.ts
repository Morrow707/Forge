import {
  FORGE_CONTACT_EMAIL,
  FORGE_POSTAL_ADDRESS,
  FORGE_LEGAL_ENTITY,
  GOVERNING_LAW_CLAUSE,
} from "@shared/contact";

// The assumption-of-risk release. Forge's only genuine liability waiver: every
// other legal document here either grants a licence, describes data handling, or
// takes a consent. This one asks somebody to give up a right.
//
// REVIEWED BY COUNSEL, 2026-09-19 (opinion relayed by Scott, text unchanged).
// Section 6: the release isolates the physical act of training, which Forge
// does not control, from the software, which it does; under Arizona law a
// prospective exculpatory clause is enforceable against ordinary negligence when
// clear, unambiguous and voluntary, construed strictly against the drafter, and
// section 7's carve-out of gross negligence and intentional misconduct (which
// Arizona does not allow to be waived) is what positions section 6 to hold.
// Section 8: the "honest framing" for minors is the preferred approach for a
// national app -- state-specific parental waivers are unmaintainable, a blanket
// parental waiver that fails in the user's state invites an unconscionability
// attack on the whole agreement, and stating plainly that the release applies
// only where the law allows preserves the parent's waiver of their OWN claims
// while acknowledging the child's. No wording change was asked for.
//
// Before that, the caveat here read "not reviewed by a lawyer" and carried the
// most weight of any in this directory: an unenforceable release is not a weak
// release, it is no release. Changing the wording from here is changing a
// reviewed document, so it wants the same care as changing a contract.
//
// WRITTEN BECAUSE THE TEMPLATE DID NOT FIT. A Rocket Lawyer "Activity Release of
// Liability" was reviewed first, and its operative clauses -- assumption of risk,
// indemnification -- were both scoped to "use of or presence upon the facilities
// of Forge Performance Systems LLC". Forge has no facilities and nobody is ever
// present upon them, so the release covered an event that never happens while
// the actual risk (an athlete training alone at their own gym, following a
// program this software generated) appeared nowhere in it. The template also
// carried posted rules, oral instructions from staff, a charge for damage to
// premises, and an emergency contact for a session Forge does not attend. All of
// it described a staffed gym.
//
// What was kept from it is the activity description, which was accurate, and
// Arizona, which every other document already says.
//
// THE CENTRAL FACT is in section 2: Forge supervises nothing. Programming is
// generated from logged data, measurements are estimates from a phone camera,
// and no human employed by Forge watches anyone lift. Every other Forge document
// says this in passing; here it is the reason the release exists, so it leads.
//
// Keep in sync with the code. A claim here that no longer matches behaviour is a
// bug in this file.

export const ASSUMPTION_OF_RISK_RELEASE = `FORGE -- ASSUMPTION OF RISK AND RELEASE

READ THIS CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS.

This release covers athletic training, biomechanical performance recording, and video motion analysis using the Forge application, provided by ${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS}.

An adult athlete agrees to it for themselves. For an athlete under 18, a parent or legal guardian agrees on their behalf.

1. WHAT FORGE PROVIDES

Forge is software. It holds training programs, records what you lift, measures movement from video you film on your own device, and generates written suggestions and feedback from what you have logged.

2. WHAT FORGE DOES NOT PROVIDE, AND THIS IS THE POINT

No one at Forge supervises your training. Nobody watches you lift, checks whether a weight is appropriate for you today, spots you, corrects your position, or is present when you train. Forge has no gym, no premises, and no staff at the place where you exercise.

A program, weight, repetition count or progression shown in Forge is generated from data you entered. It is a suggestion produced by software, not an instruction from anyone who can see you.

Measurements Forge takes from video -- bar speed, range of motion, jump height, movement faults -- are estimates produced by software from a phone camera, and they depend on filming conditions. They are not safety equipment. A set Forge reports as good is not a set anyone has confirmed was safe.

If a coach programs your training through Forge, that coach supervises you, not Forge.

3. THE RISKS

Strength training, jumping, sprinting, throwing and skill work carry inherent risks of injury, including serious and permanent injury, and in rare cases death. Those risks include, among others: strains, sprains, tears and broken bones; joint, back and spinal injury; a dropped or mishandled barbell or implement; equipment failure; losing balance or falling; heat illness; and cardiac events.

These risks exist because of what training is. They are not created by Forge and cannot be removed by any software.

4. WHAT YOU ARE RESPONSIBLE FOR

Deciding whether an exercise, a weight or a session is appropriate for you on the day. Using equipment properly and training in a safe place. Warming up. Getting a spotter or setting safeties when a lift needs them. Stopping immediately when something causes pain or feels wrong -- including when a program says to continue. Not training through an injury. Entering your own information accurately, since what Forge suggests is derived from it.

Before starting or substantially changing a training program, and especially if you have a medical condition or injury, are pregnant, or have been inactive, consult a physician. Forge is not a medical provider and nothing in it is medical advice.

5. ASSUMPTION OF RISK

You acknowledge the risks in section 3, you accept them knowingly and voluntarily, and you accept them as risks of training itself rather than as risks created by using this software.

6. RELEASE

To the fullest extent permitted by law, you release ${FORGE_LEGAL_ENTITY}, and its officers, employees and agents, from claims for injury, loss or damage arising out of your athletic training, including training performed while following a program, suggestion or measurement provided through Forge.

7. WHAT THIS RELEASE DOES NOT COVER

This release does not apply to, and nothing here limits liability for:

- gross negligence, recklessness, or intentional or wilful misconduct;
- any liability that cannot lawfully be released or limited;
- a claim arising from how Forge handles your personal information, video or biometric data, which is governed by the Privacy Policy and the Video and Biometric Consent rather than by this document.

8. ATHLETES UNDER 18 -- WHAT A GUARDIAN CAN AND CANNOT GIVE UP

Where a parent or legal guardian agrees to this release for an athlete under 18, they confirm they have legal authority over that athlete, they accept these risks on the athlete's behalf, and they release their own claims arising from the athlete's training.

The law of many states limits or prevents a parent from releasing a minor's OWN right to bring a claim. Where that is so, this release does not do it, and the athlete's own claim is unaffected. That is stated here rather than left for a reader to discover, because a document that appears to take away a child's rights while not actually doing so misleads the person signing it.

A guardian may withdraw agreement at any time by writing to the address below, which stops the athlete's use of Forge.

9. GOVERNING LAW AND DISPUTES

${GOVERNING_LAW_CLAUSE}

10. HOW THIS IS AGREED AND RECORDED

This release is agreed in the app by an affirmative action that is not pre-ticked. Forge stores the exact text of this document as it stood at that moment, together with the date and time, the IP address, and the browser or device it was agreed from. That record is the evidence of agreement; there is no separate signature page.

You are free to take advice on this document before agreeing to it, and free not to agree, in which case you do not use Forge for training.

11. ACKNOWLEDGEMENT

BY AGREEING, YOU CONFIRM THAT YOU HAVE READ THIS DOCUMENT, THAT YOU UNDERSTAND IT, AND THAT YOU ARE GIVING UP CERTAIN LEGAL RIGHTS.

12. CONTACT

${FORGE_LEGAL_ENTITY}, ${FORGE_POSTAL_ADDRESS} -- ${FORGE_CONTACT_EMAIL}`;
