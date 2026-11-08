# Note to counsel, 2026-11-08: four questions before a minor takes the Anvil

**This is the cover note to send, with `docs/anvil-for-counsel.md` attached.** It is deliberately
short: four questions, in the order they block us, with the one that blocks everything first. The
attached packet describes the software as it now exists, question by question, and nothing in this
note contradicts it.

---

Dear [name],

Forge has built and shipped a new daily feature called the Anvil. It is a short self-administered
check on the athlete's own phone -- about four minutes, four tasks: simple reaction time, a
go/no-go task, a spatial sequence and ten seconds of finger tapping. It compares an athlete's
morning against their own earlier mornings and shows the result to them, and to their coach where
they have one.

**It is live today for adults only.** The age gate is 18 and over, enforced in code for every
account type, and it is there because of the four questions below. No cognitive measurement of any
minor has ever been recorded by Forge. We would like to open it to minors with a guardian's
consent, and we are asking before the first one sits down rather than after.

The four questions, numbered as in the packet:

**1. (Question 15) Can a guardian consent to this at all, and under which document?** This is the
one that decides whether the rest matter. Our reviewed Video and Biometric Consent covers filming
a lift and deriving measurements from the athlete's body in the video. The Anvil adds four tasks
whose output is a measure of the athlete's nervous system. **Is that within the scope of that
consent, or does it need its own disclosure and its own separate tick?** If its own, we would
rather have the clause drafted now than retro-fit it. And if the answer differs between an adult
agreeing for themselves and a guardian agreeing for a child, please say which is which.

For the avoidance of doubt about what we have done in the meantime: rather than stretch the
existing consent, we wrote the Anvil its own short agreement and an adult ticks it before their
first check. It is not one of the eight documents you have reviewed, it has no public page, and we
are not holding it out as reviewed. It is in the packet in full and we expect it to be replaced or
absorbed by whatever you tell us.

**2. (Question 18) The concussion problem, which is the one we are most concerned about.** A daily
cognitive score on a youth athlete will be read as a concussion screen by some coaches and some
parents, whatever we say, because the tasks resemble the ones used in sideline testing. We state
plainly that it is not one and must not be used as one. **(a) Is a disclaimer sufficient, and what
language actually works?** We would rather be told the measure cannot be shown to a coach at all
than discover that a disclaimer nobody read is not a defence. **(b) If Forge's own data shows a
sharp cognitive decline in a minor athlete, does Forge acquire a duty -- to warn, to act, to
escalate to the guardian -- by virtue of having measured it?** A product that notices something
and says nothing seems to us to be in a worse position than one that never looked. If a duty
exists we want to design the escalation path deliberately rather than inherit one. We have left
the recipient of any such escalation unresolved in the code, pending your answer.

One note on the evidence, because it bears on (a): the 2023 Amsterdam international consensus
statement on concussion in sport is reported to caution against computerised neurocognitive
testing in younger athletes specifically. We have not been able to read the full text (it is
paywalled) and so cannot quote it; a reviewer with access may want to.

**3. (Question 17) Does a guardian's existing consent cover showing their child's cognitive
measure to a coach?** A guardian has agreed their child may be coached through Forge and that the
coach sees their training data. **Is a cognitive measure within that, or is showing a minor's
reaction-time trend to an adult who is not their parent a distinct disclosure needing its own
consent?** The coach is usually a school or club employee and is not a clinician. Two
sub-questions we cannot answer ourselves: what the coach is to us in this (a recipient, a joint
controller, our customer's agent -- the answer changes what we must tell the guardian and what we
must bind the program to in the Institutional Service Agreement), and whether a guardian should be
able to refuse the coach's view while keeping the athlete's own. We can build that; we do not know
whether it is required, advisable, or a complication that implies the default is dangerous.

**4. (Question 21) Keeping a minor's cognitive scores for years, against our own retention
posture.** We delete a minor's training video on a schedule -- 30 days under 13, 90 days 13 to 17
-- as data minimisation. One of the Anvil's three comparisons is the same athlete against athletes
of the same age in previous years, which cannot work on deleted data: it needs a child's
cognitive measurements kept for the length of their career with the program and beyond. **Does
that need its own disclosure and its own consent? Is there a ceiling we should set? And what must
happen on deletion of the account?** Our current rule is that a research-consented athlete's
scrubbed record survives account deletion because consent was given as an account holder and the
consent text says so, while an athlete who withdraws first leaves nothing. We do not know whether
a cognitive measurement may sit inside that rule or needs a different one.

Two things that may save you time. First, that year-over-year comparison **cannot run for at least
a year on any account**, so question 4 is the least urgent of the four and we are not waiting on it
to proceed with anything. Second, the feature asserts nothing today: it needs two of its three
comparisons to agree before it will say a word, two of the three are not yet computable, and so
every weekly summary it has produced reads "not enough to judge on" and names which comparisons
are missing. We mention that because it means the risk surface right now is the collection and the
display, not an alarm being raised.

Happy to walk anyone through the software on a call, and happy to send the simulation results
behind any number in the packet.

With thanks,
Scott

---

## What to attach

- `docs/anvil-for-counsel.md` -- the packet. Describes the software as built, including the four
  tasks in detail, what is stored (the raw trials, never a derived score), who sees what, the
  adults-only gate and the Anvil's own agreement in full.
- `docs/legal-open-questions.md`, questions 15 to 24 -- the full text of all ten Anvil questions.
  Six of the ten are not in this note because they do not block a minor taking it; they are worth
  a reviewer's eye in the same pass, and the packet flags which.

## What NOT to say

- Do not describe the Anvil as a screen, a test for anything, or a measure of fatigue, readiness
  or recovery. Those words are forbidden in the product by `shared/anvil-vocabulary.ts`, each with
  its reason, and the one place they may appear is the agreement that disclaims them. Using them in
  correspondence would undo the work.
- Do not say the Anvil is or may become a concussion tool, even to ask about it. Question 2 above
  asks the right question, which is about the language and the duty.
