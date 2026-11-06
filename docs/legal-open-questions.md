# Open questions for counsel

**These are questions, not text.** Each one used to sit inside a document as a
`[Placeholder -- ...]` bracket, which meant a parent reading /terms was being shown
Forge asking its own lawyer whether the clause above worked. A note to counsel inside
a document a user accepts is an admission printed on the thing it undermines, so the
questions live here and the clauses stand on their own.

Nothing here is resolved unless it says so. They move out of this file when counsel
answers them, and the answer changes the clause rather than this list.

## 1. Terms of Use, s16 Indemnification -- ANSWERED 2026-10-03

Counsel: no, an indemnity cannot be enforced against a minor, and a parent indemnifying
against their own child's claims is void in many states (Arizona and California among them).
Their sentence is in s16 verbatim (the parent indemnifies only for their own acts and for
third-party claims arising from authorising the minor's use; a minor incurs none). Registered
as a new version in `shipped-versions.ts`; every existing user is asked to accept once.

Confirm with counsel whether and how this section can apply where the person being
asked to indemnify is a minor athlete or their parent/guardian; several states limit
or void an indemnification obligation imposed on a minor.

This is the one question in this file that is unambiguously still live, and it is
about a document people accept today.

It used to be s14 of the public Terms of Service. That document was retired on
2026-09-19 when the two Terms were merged, and the clause moved UNCHANGED into the
signup Terms of Use (`server/seed-data/signup-agreement.ts`), where it is now s16 --
minors sentence and all. Nothing about the question changed with the move; what
changed is that the clause is now in a document every account accepts, rather than
one nobody did.

## 2. Service Agreement: who obtains guardian consent -- ANSWERED 2026-10-03

Counsel: enforceable, provided Forge holds an affirmative written warranty from the school
and keeps the executed agreement on file (it does: `institutional_agreement_signatures`).
Their clause is ISA section 4.4 verbatim.

Counsel should confirm exactly what allocation of this responsibility is enforceable,
and whether any additional Forge-side mechanism is needed to support it, rather than
assuming a contract clause alone resolves it.

Originally written about a Forge-drafted institutional outline that has since been
DELETED (see server/seed-data/legal-documents-draft.ts). The question survives it
because it was never about that document's wording -- it is about whether a contract
can put this obligation on a school at all. It now applies to the Rocket Lawyer
Service Agreement, which is what a school actually signs.

## 3. Service Agreement: indemnity for a consent failure -- ANSWERED 2026-10-03

Counsel: the clause works as a B2B indemnity and is independent of question 1; keep the
"to the extent permitted by law" carve-out for public bodies (13.4 already had it). Their
clause is ISA section 13.5 verbatim. The ISA text hash changes with it, which is the point of
storing one per signature.

The core liability-shifting mechanism of the Agreement, and the clause most in need of
real counsel drafting. Note that moving the obligation onto the Institution does not
resolve question 1: the consumer Terms of Use carries its own unresolved flag for
minor athletes, and that is a separate problem with the same root.

Re-pointed from the deleted outline to the Service Agreement, for the reason given in
question 2.

## 4. FERPA / data-processing agreement -- CLOSED, 2026-09-17

Asked whether a school's use requires FERPA school-official status or a signed DPA.
Answered no, by Scott: Forge receives name, gender, age, sport and position, which is
directory information, not education records. No GPA, no majors, no transcripts,
nothing from a student information system. If a particular school's procurement
demands an addendum, that is paperwork they hand Forge, not a document to write in
advance. See CLAUDE.md, "Settled questions that keep getting re-litigated".

Kept rather than deleted because it has been raised as a gap more than once. The
record of the answer is what stops it being raised a third time.

## 5. Verifiable parental consent for under-13s -- ANSWERED 2026-10-03, MECHANISM OPEN

Counsel: no, email-only is insufficient under COPPA (16 C.F.R. 312.5) because Forge sends
data to a third-party AI provider and stores video and biometric records; full verifiable
parental consent is required, and they recommend a card transaction (a $0.50 to $1.00
verification charge) or not accepting under-13s until a billing method is attached. Their
sentence is in the Privacy Policy (section 1) and the Notice to Parent or Guardian verbatim.
BUILT the same day (Scott: "yes accept under 13, build the card, they need the guardian
account anyways"): an under-13 account stays held after the guardian claim until a linked
guardian's card is charged 50 cents through Stripe Checkout and refunded
(`createGuardianVerificationCheckout`, the `guardian_verification` webhook branch,
`athleteGateStatus` -> `needs_guardian_verification`, the dashboard card, the holding screen;
`server/guardian-parental-verification.itest.ts`). Not behind `BILLING_LIVE`: it is not a
sale. `ACCEPT_UNDER_13_SIGNUPS` stays unset.

**The one question here that is about a MECHANISM rather than wording**, which is why it
was missing from this file until now: everything else on this list is a clause somebody
can read, so it travels with the documents automatically. How consent is actually
verified travels with nothing.

What happens today. An athlete under 18 cannot use Forge until a parent or legal
guardian claims their own linked account; until then the athlete signs in to a screen
telling them to wait. Claiming it writes four consent records -- `guardian_coppa_consent`
for an under-13, plus the biometric release, the assumption of risk and the privacy
policy -- each snapshotting the exact document text at that moment. The Notice to Parent
or Guardian is the document the under-13 consent is recorded against, and it says so in
its own first paragraph.

The gate is real: the account does not function until it happens. That is better
evidence than a signature on a form nobody checks.

**The question is whether clicking a link in an email is verifiable enough.** COPPA
requires VERIFIABLE parental consent for an under-13, and the email address was typed by
a coach or by the child. The FTC treats plain email as one of the weaker methods; "email
plus" expects a second confirming step. `consentTypeEnum` in shared/schema.ts already
records the corroborating path -- a card transaction that notifies the cardholder is an
FTC-approved method -- and is careful to call it CORROBORATING, not a substitute. With
billing off during beta, that corroboration does not exist yet, so verification rests on
the email link alone.

Ask counsel directly: is this sufficient for an under-13, and if not, what second step do
they want? Three answers are foreseeable and all are actionable -- a follow-up
confirmation step, a small authorising card transaction, or not accepting under-13s at
all until it is settled. The third is a product decision, not a technicality:
`tier1_under13` is a live tier and an under-13 can sign up today.

## 6. Apple Health data reaching the AI provider -- ANSWERED 2026-10-03

Counsel: yes, tailored training adjustments are a permitted health and fitness purpose
(App Store Review Guidelines 5.1.3) provided the AI provider acts as a processor, the data
is encrypted in transit and never retained to train models. Their disclosure sentence is
now the Apple Health switch text (`notification-settings-dialog.tsx`) and the Privacy
Policy's service-provider bullet, verbatim.

Added 2026-09-19 during the launch-readiness pass on the four documents. The app pre-fills an
athlete's daily check-in from Apple Health (sleep, resting heart rate, HRV, VO2 max, respiratory
rate, weight, session heart rate), and the AI coach reads the check-in when it adjusts
recommendations, so a Health-derived value can reach Anthropic inside a prompt. Apple's HealthKit
rules allow sharing with third parties only for health or fitness purposes with the user's
permission. The Privacy Policy now discloses both the collection and the AI use; ask counsel
whether a coaching recommendation is a fitness purpose, whether the Health-sync switch is the
permission, and whether the switch itself needs to say Health values may be sent to the AI
provider.

## 7. The biometric paragraph said "not yet been finalized by counsel" -- CLOSED, 2026-09-19

Replaced later the same day, on Scott's decision, with the biometric-consent statement (question 3
in the review packet). The same decision published the COPPA sentence in Privacy s5, the consent
sentence in the Notice, the minors sentence in Terms s15, and the paid-plans text in Terms s8
ahead of billing going live ("I don't want to have to change paperwork when we launch"). All four
are therefore LIVE and are what counsel is reviewing; questions 1, 2 and 3 still stand, and an
answer that softens any of them is a change to a live document, recorded by version tracking.

## 8. Assumption of Risk and Release -- REVIEWED, 2026-09-19

Counsel's opinion, relayed by Scott the same day the document was put in front of them.
Section 6's release is well-targeted: it isolates the physical act of training from the
software, and with section 7 carving out gross negligence and intentional misconduct it is
positioned to be enforceable against ordinary negligence under Arizona law. Section 8's
plain statement that a parent cannot release a minor's own claim where state law forbids it
is the preferred approach for a national app over state-specific language. No change to the
text. `server/seed-data/assumption-of-risk.ts` records the opinion in its header. The
Rocket Lawyer Activity Release that this replaced is retired.

## 9. Research consent -- REVIEWED, 2026-09-19

Counsel returned a rewritten "Research Consent and Data Use Authorization" the same day the
packet (`docs/research-consent-for-counsel.md`) went out, and it went live verbatim as
version 2026-09-19. Its wording answers the packet's questions in the text itself: "designed
so that it cannot be traced back" (question 1), retention after deletion kept with the
withdraw-first procedure (question 3), no researcher named (question 5). Everyone who
consented under the 2026-09-17 wording is asked again. The one open word (section 6 said "age
bracket"; the store keeps age in whole years) was put to counsel by Scott on 2026-09-20 and
changed to "age" with their approval. Version 2026-09-20 re-asks everyone.

The AI Terms of Use is REVIEWED: Scott, 2026-09-19, "we used the AI terms of use as a
draft, a lawyer modified that". Its file header says so.

## 10. Signup Terms of Use -- REVIEWED, 2026-09-19

Counsel returned a rewrite the same day the packet (`docs/signup-terms-for-counsel.md`) went
out, with the four factual additions folded in, and answered all five questions. The live
text (`server/seed-data/signup-agreement.ts`) is their rewrite with the answers applied
verbatim (`docs/signup-terms-counsel-2026-09-19.txt`): no software-enforcement warranty in
s3; a $50 floor on the liability cap and a gross-negligence carve-out in s15; notice and
in-app re-acceptance for material changes in s16 (built, see CLAUDE.md); a precedence clause
over the public Terms of Service (since removed -- see below); DMCA, severability and
entire-agreement clauses. Every
existing user is asked to accept it once.

Two follow-ups from the answers, both decided by Scott 2026-09-19: the public Terms of
Service was MERGED into this document the same day ("just one less document that gets in the
way"): six of its clauses were carried over verbatim, the precedence sentence was dropped
because there is nothing left to take precedence over, /terms now serves this document, and
`TERMS_OF_SERVICE_DRAFT` is retired. The DMCA agent was registered 2026-10-03: registration
number DMCA-1081791, agent "Copyright Agent", Forge Performance Systems LLC, notices to the
email section 19 names. Renew by 2029-10-03; a lapsed registration is the same as none.

## 11. The launch email list and the Privacy Policy -- ANSWERED 2026-10-03

Counsel: yes, CAN-SPAM and CCPA/CPRA need the collection, the limited purpose and the
unsubscribe disclosed. Their paragraph is under "Information we collect" in the Privacy
Policy verbatim.

Since 2026-10-02 the website takes an email address from anyone who wants to hear when
sign-ups open ("Notify me" on the coming-soon card and in the footer), and an admin can mail
everyone on that list (`server/email-list.ts`). It is a list of addresses and nothing else: no
account, no name, no age, no link to a user row. Every mailing carries an unsubscribe link,
unsubscribing is honoured at once and permanently until the person re-joins, and the list is
never shared or sold.

The Privacy Policy does not mention it. It describes the data an ACCOUNT holder gives Forge;
a visitor who leaves an address on the coming-soon page has no account. Question for counsel:
does the Policy need a sentence naming the launch list (what is collected, that it is used
only to send Forge's own news and offers, how to unsubscribe), and if so where. The code
already does each of those things; the question is only whether the document has to say so.
Until answered, nothing about the list is written into a reviewed document.

## 12. Teaching from a purchased textbook inside a paid product -- ANSWERED 2026-10-03

Counsel, same day: legally precarious. Copyright protects expression, not the training
methods, so paraphrase with citation is less exposed than copying, but AI copyright litigation
turns on MARKET SUBSTITUTION (a subscriber who asks Forge's chat instead of buying the book),
and the publisher's own EULA almost certainly forbids automated extraction and ingestion into
an AI store, which is a breach-of-contract claim that is easier to win than the copyright one.
Verdict: without an express commercial licence from the publisher permitting AI ingestion, do
not rely on an outside textbook through retrieval. "Ask Forge's Coaching Library", grounded in
Forge's own tracks, is entirely safe.

What the code does with that:

- The coach-facing chat is grounded in Forge's own tracks and principles only
  (`academyTracks`, `academyLessons`, `keyPrinciplesForAi`). It never retrieves from
  `knowledge_passages`.
- A Coaches Corner draft may draw on a library source only when an admin has marked it
  `derivedContentLicensed` and written what the licence is (`knowledge_sources`, the switch on
  the Knowledge Library page). Nothing is marked by default, so with no licence in hand the
  draft button refuses and says why. The verbatim guard (`server/academy-draft-guard.ts`)
  stays on top of that. The same gate covers the citation pass.
- OPEN, for Scott: the uploaded textbook ALREADY feeds Forge's AI assistants (the program
  builder, the nutrition and readiness answers) through the same retrieval, in paraphrase. By
  counsel's reasoning that is the same exposure, with the EULA point in front. Options are to
  remove the source from the library, to narrow retrieval everywhere to licensed sources (one
  flag, `licensedOnly`, already exists), or to ask the publisher for a licence. Not changed
  here without a decision.

## 13. Naming a certification Forge does not hold -- ANSWERED 2026-10-03

Counsel: nominative fair use allows the plain-text mark to state a fact that cannot be stated
without it, such as a coach's own earned credential on their profile ("Jane Doe, MS, CSCS"),
with no logo or badge and nothing implying the NSCA endorses Forge or its AI. Marketing
banners, landing headers, upsell cards, feature names and system titles are infringement
territory. Verdict: purge the mark from product marketing, features, titles and upgrade cards;
allow it only as a human's biographical credential.

What the code does with that: the upsell card no longer names it (2026-10-03), and
`client/src/lib/no-certification-marks.test.ts` refuses "CSCS" and "NSCA" in client pages and
components. A coach typing their own credentials into a free-text bio is their statement, not
Forge's, and is not scanned.

## 14. Paraphrasing the textbook into paid course content -- ANSWERED 2026-10-04

Scott's argument (2026-10-04): facts are public, paraphrase is not plagiarism, so a summary
of the book could be sold in Coaches Corner. Put to counsel as four questions the same day.

Counsel, verbatim:

1. A chapter-by-chapter paraphrase or summary of one book, sold as a course, "carries a high
   risk of copyright infringement. While copyright does not protect underlying facts,
   scientific principles, or ideas, it strictly protects an author's original 'selection,
   coordination, and arrangement' of those facts. A chapter-by-chapter summary that mirrors
   the book's sequence, narrative flow, and structural organization appropriates the author's
   protected expression. Furthermore, selling this as a paid commercial course directly
   triggers the market-substitution problem."
2. Lessons that cover the same topics in Forge's own structure, drawing on several sources
   with the book as one reference among many: "this fundamentally shifts the analysis in your
   favor. Extracting unprotectable facts, data, and scientific concepts from a textbook and
   synthesizing them with other sources into an entirely new, original structure is standard
   research and authorship."
3. The publisher's EULA "governs software actions and the digital duplication or processing of
   the file itself. It does not restrict a human being from reading the text, comprehending
   the facts, and expressing those underlying concepts in their own words."
4. The line: "You may freely extract the biomechanical principles, historical data, and
   established training methodologies. You must completely abandon the book's table of
   contents, chapter progression, specific hypothetical examples, unique pedagogical analogies,
   and proprietary charts. Build Forge's course outline and syllabus first, independently of
   the textbook, and subsequently use the book strictly as a factual reference repository to
   populate your original structure."

What the code does with that: nothing changes. The thirteen Coaches Corner tracks and the
seven athlete classes are written in Forge's own structure from general coaching knowledge,
which is answer 2. The AI draft path stays gated by `derivedContentLicensed` (answer 3 is about
a HUMAN reading the book; machine retrieval over the file is the EULA's own subject, and the
question 12 open item on the AI assistants stands). New tracks are written by hand to the
line in answer 4: outline first, never the book's.

---

# The Anvil: ten questions, 2026-11-06

**These ten travel together, with `docs/anvil-for-counsel.md`**, which describes what the Anvil
is, what each of its four tasks records, who sees the result, and what Forge already holds under
which consent. A reviewer cannot answer 15 to 24 without it.

**Nothing is built.** The Anvil is a specification, a set of simulations and a mock of the
screens; no athlete has taken it and no cognitive measurement has ever been recorded by Forge. The
questions are being asked before the first minor sits down in front of it. **Nothing ships to a
minor until 15, 17, 18 and 21 are answered.** The rest can be answered alongside the build.

## 15. Does the Video and Biometric Consent reach a cognitive task?

The reviewed Video and Biometric Consent describes filming a lift and deriving measurements from
the athlete's body in the video. The Anvil adds something that document does not mention: four
short tasks on the phone whose output is a measure of the athlete's nervous system -- a
millisecond reaction-time distribution, whether they inhibited a response they should have
inhibited, how long a spatial sequence they can repeat, how fast they can tap.

**Is that within the scope of the existing consent, or does it need its own disclosure and its own
separate tick?** If its own, we would rather have the clause drafted now than retro-fit it. And if
the answer differs between the adult athlete agreeing for themselves and the guardian agreeing for
a child, please say which is which.

## 16. Is a daily cognitive measure "consumer health data" under the state statutes?

Forge has users in every state. Four regimes look relevant and we do not know which of them this
touches:

- **Washington My Health My Data Act**, whose definition of consumer health data reaches
  information used to identify a consumer's past, present or future physical *or mental* health
  status. A score that moves when an athlete is tired is at least arguably that.
- **Illinois BIPA**, which attaches to biometric identifiers -- fingerprint, retina, voiceprint,
  hand and face geometry. We believe a reaction-time latency is none of those. We are less sure
  about the pose skeleton Forge already extracts from a filmed lift, which the camera work stores
  as joint coordinates; that is existing collection rather than new, but if it is within BIPA we
  would like to know now and not in a demand letter.
- **Texas CUBI** and **Nevada SB 370**, on the same two points.

**Which of these, if any, does the Anvil bring Forge inside, and what does compliance require --
consent language, a retention schedule, a deletion right, a separate notice?**

## 17. Does a guardian's existing consent cover showing their child's cognitive measure to a coach?

Forge has decided that a coached athlete's daily and weekly Anvil views are shown to their coach
as well as to the athlete. A Free Agent has no coach and nobody else sees theirs.

A guardian has agreed that their child may be coached through Forge and that the coach sees their
training data. **Is a cognitive measure within that, or is showing a minor's reaction-time trend to
an adult who is not their parent a distinct disclosure that needs its own consent?** The coach is
usually a school or club employee and is not a clinician.

Two sub-questions we cannot answer ourselves:

- **What is the coach to us in this?** A recipient, a joint controller, our customer's agent?
  The answer changes what we must tell the guardian and what we must bind the program to in the
  Institutional Service Agreement.
- **Should a guardian be able to refuse the coach's view while keeping the athlete's own?**
  Forge can build that. We do not know whether it is required, advisable, or a complication that
  creates a worse problem by implying the default is dangerous.

## 18. The concussion problem: what disclaimer works, and does measuring create a duty?

This is the question we are most concerned about, in two parts.

**(a) Language.** A daily cognitive score on a youth athlete will be read as a concussion screen
by some coaches and some parents, whatever Forge says, because the tasks resemble the ones used in
sideline testing. Forge will state plainly that it is not a concussion screen and must not be used
as one. **Is a disclaimer sufficient here, and what language actually works?** We would rather be
told the measure cannot be shown to a coach at all than discover that a disclaimer nobody read is
not a defence.

**(b) Duty.** If Forge's own data shows a sharp cognitive decline in a minor athlete, **does Forge
acquire any duty -- to warn, to act, to escalate to the guardian -- by virtue of having measured
it?** We are conscious that collecting a signal can create an obligation that not collecting it
would not, and that a product which notices something and says nothing is in a worse position than
one that never looked. If a duty exists, we want to design the escalation path deliberately rather
than inherit one.

A note on the evidence, because it bears on (a): the 2023 Amsterdam international consensus
statement on concussion in sport is reported to caution against computerised neurocognitive
testing in younger athletes specifically. We have not been able to read the full text (it is
paywalled) and so cannot quote it; a reviewer with access may want to.

## 19. RED-S and disordered eating: may we say anything, must we, and to whom?

The Anvil's design reads the athlete's own food log -- calories, iron, B12, vitamin D -- and their
body-mass entries, not to score nutrition but to separate a finding that is about training from one
that is not. An athlete whose numbers are down across every measure and who has been under-eating
for a month is a medical referral, not a training adjustment.

Forge has decided **not to model or flag RED-S**, partly because it can present with autonomic
numbers that look better rather than worse. But the pattern will sometimes be visible in the data
Forge holds.

**May Forge say anything? Must it? And to whom -- the athlete, the guardian, the coach, or a named
adult at the program?** Showing a 15-year-old a screen that connects her food log to a declining
score has its own risk, and we would rather be told to show her nothing than guess.

## 20. Is this a medical device, or general wellness?

FDA has a General Wellness policy and a separate Clinical Decision Support guidance. A readiness or
freshness score marketed for training sits, we assume, in general wellness. But the Anvil is a
cognitive test, trended over time, shown to an adult who makes decisions about a child's
participation in physical activity.

**Where is the line, and what in our description or our marketing would cross it?** We would like
the answer as a list of things not to say, which we can then enforce in the code -- Forge already
scans its own client source to refuse certification marks it does not hold and to require its
accuracy caveat on every surface showing a camera number, so a rule stated as a forbidden form is
something we can mechanically keep.

## 21. Keeping a minor's cognitive scores for years, against our own retention posture

Forge deletes a minor's training video on a schedule -- 30 days under 13, 90 days 13 to 17 -- as
data minimisation. The Anvil's third comparison is the same athlete against athletes of the same
age in previous years, which cannot work on deleted data: it requires keeping a child's cognitive
measurements for the length of their career with the program and beyond.

**Does multi-year retention of a minor's cognitive measurements need its own disclosure and its own
consent? Is there a ceiling we should set? And what must happen on deletion of the account?**
Forge's current rule is that a research-consented athlete's scrubbed record survives account
deletion because consent was given as an account holder and the consent text says so; an athlete who
withdraws first leaves nothing. We do not know whether a cognitive measurement may sit inside that
rule or needs a different one.

## 22. Publishing on minors' data with no institutional affiliation

Two numbers would validate or kill the Anvil and neither exists in the published literature: the
athlete's own day-to-day variability on the reaction-time task, and the reliability of Forge's pose
estimator across days under real conditions. Both are publishable and both would be measured on
Forge's own users, who include minors.

Forge has a research consent (opt-in, separate, with a pseudonymous mirror and a suppression floor
of 10 on anything that leaves the organisation) and **no institutional affiliation and no IRB**.

**Can a company publish research on minors' data on the strength of its own consent form? Is an
IRB or an independent ethics review required, advisable, or available to us?** If the answer is
that it cannot be published, that is useful: it changes whether the measurement work is worth doing
at all.

## 23. A school district adopting this -- does a Forge-generated cognitive score become an education record?

Question 4 closed FERPA on the ground that Forge receives directory information only -- name,
gender, age, sport, position -- and never a GPA, a transcript or a disciplinary record. We think
that still holds and want it checked against new facts, because the Anvil is different in two ways:
**the score is generated by Forge rather than received from the school**, and **it is read by a
coach who is often a school employee acting in their official capacity.**

**Does a cognitive measure created by a vendor and read by a school employee become an education
record?** If it can, the Institutional Service Agreement probably needs a clause, and a district's
procurement will ask.

## 24. What may we call it?

Forge has dropped "neuro-fatigue" and "neural fatigue" from everything a user can see. The product
is called the Anvil, which claims nothing. But a screen has to describe what the number is.

**Which of these may we use, and are any of them health claims: readiness, freshness, fatigue,
recovery, load tolerance, reaction time?** The last is the only one that is literally what is
measured. We would rather use a plainer word that is accurate than a better-sounding one that is a
claim, and a short list of permitted and forbidden words is something we can enforce in the code.

---

## FORGE'S WORKING POSITION ON 15 TO 24, 2026-11-06 -- NOT COUNSEL'S ANSWER

**An answer to all ten came back the same day through Rocket Lawyer, and WHICH ROCKET LAWYER
CHANNEL it came from is not established** -- their AI assistant and their attorney review are two
products, and only the second can close a question in this file. So the ten are **recorded as
Forge's own working position**, which is enough to build on, and are NOT marked ANSWERED. Every
one of 15 to 24 stays open.

**The internal evidence for treating them this way is in this file.** Answers 12 and 13, which
counsel did write, read: *"legally precarious. Copyright protects expression, not the training
methods, so paraphrase with citation is less exposed than copying, but AI copyright litigation
turns on MARKET SUBSTITUTION ... Verdict: without an express commercial licence ..."* -- mechanism,
then hedge, then verdict. The ten below restate each question's own wording and append a
conclusion, with no mechanism and no hedge, including on 23 where **the mechanism IS the answer**.
That is not proof of provenance and it is the reason for the caution.

### THE CONTRADICTION, which is the strongest single reason not to file these as answers

**18(b) and 19 answer the same question in opposite directions, five hundred words apart.**

- 18(b): if Forge's data shows a sharp cognitive decline in a minor, *"Forge acquires a duty to
  warn, act, or escalate by virtue of having measured it ... a product which notices something and
  says nothing is in a worse position than one that never looked."*
- 19: when the under-eating pattern is visible in data we hold, *"we must say nothing ... showing
  her nothing is the correct path."*

Same mechanism -- our own measurement reveals a problem in a child -- and if measuring creates a
duty in 18 it creates one in 19, where "say nothing" is then the one thing we may not do. **The
reconciliation of those two is the whole question** and it is what the attorney channel has to
settle. Until it is settled the Anvil does not ship to a minor.

### FIVE ADOPTED AS THE WORKING POSITION, because each is the conservative direction

Adopted means Forge builds to them now. If counsel later says we did not have to, we have lost
nothing; the reverse is not true.

- **15 -- the Anvil needs its own disclosure and its own separately ticked agreement**, with a
  separate mechanism for an adult agreeing for themselves and a guardian agreeing for a child, and
  more rigour on the second. This is what the research pass recommended independently.
- **16 -- treat it as inside Washington's My Health My Data Act**, on the mental-health-status
  limb; a reaction-time latency is not a biometric identifier under BIPA, CUBI or SB 370.
  Compliance = distinct consent language, a retention schedule, a deletion right, a separate
  notice. All four are things Forge builds rather than argues about. **The pose-skeleton half is
  NOT adopted**: "its regulatory standing must be managed tightly" is a disposition, not a ruling,
  and the question was whether joint coordinates are inside BIPA.
- **17(b) -- a guardian may refuse the coach's view while keeping the athlete's own.**
  **THIS MODIFIES SCOTT'S OWN DECISION OF THE SAME DAY** that a coached athlete's reading goes to
  their coach: the coach's view becomes the DEFAULT with a guardian switch above it, rather than
  the rule. Recorded in `docs/anvil/research-2026-11-06.md` beside that decision so the two are
  not read separately. **17(a) is NOT adopted**: "a recipient *or* our customer's agent" are two
  answers with different Institutional Service Agreement consequences.
- **20 -- general wellness, crossed only by marketing language implying diagnostic capability**,
  enforced as a forbidden-form scan in the source the way the certification marks and the camera
  accuracy caveat already are. Built: `shared/anvil-vocabulary.ts` and its ratchet.
- **21 -- multi-year retention needs its own disclosure and its own consent, with a ceiling.**
  **The ceiling is the one part of 21 that is still missing: nobody has named a number.**

### TWO NOT ADOPTED, because adopting them as written would be expensive and probably wrong

- **23 is a strong conclusion with the reasoning absent.** *"A cognitive measure created by a
  vendor and read by a school employee does become an education record."* FERPA attaches to records
  maintained by the educational agency **or by a party acting for it**, and the school-official
  exception exists precisely for a vendor in this position; whether Forge is inside it turns on
  direct control, the contract and redisclosure limits, none of which the answer touches. Taken as
  written it rewrites the Institutional Service Agreement and changes what every district asks for.
  Held until the exception is addressed.
- **24's forbidden list is not an Anvil decision as written -- it is a rename of three shipped
  features.** Measured 2026-11-06 in user-visible client files: **"readiness" 15 files**
  (`components/readiness-banner.tsx`, the live `/api/athlete/readiness`), **"recovery" 18**
  (`pages/athlete/recovery.tsx`), **"fatigue" 3** (the coach analytics surface). A platform-wide ban
  costs three renames across 33+ files for a product with no users, and the readiness score is a
  feature counsel has already reviewed around in the Privacy Policy's AI path. **Scoped to Anvil
  surfaces only** in `shared/anvil-vocabulary.ts`, which says so in its own header, and
  `anvil-vocabulary.test.ts` asserts the narrow scope in BOTH directions -- a case fails if the
  readiness banner, the recovery page or the coach analytics surface ever comes into scope, so
  widening it has to arrive as a decision rather than as a tidy-up. The narrowed follow-up asks
  which was meant.

### THE FIVE NARROWED FOLLOW-UPS, AS SENT 2026-11-06

**Verbatim, so the record is what went out rather than what was drafted.** Numbered against the
packet the reviewer holds (`docs/anvil-for-counsel.md`), where questions 15 to 24 of this file
appear as 1 to 10 -- so follow-up 1 is this file's 18 and 19, follow-up 4 is this file's 23, and
follow-up 5 is this file's 24. Each is deliberately small, so that it is cheap to answer and hard
to answer with a restatement.

```
1. RECONCILE QUESTION 4(b) WITH QUESTION 5

Your answers on duty to act contradict each other on the same underlying
mechanism:

  - Question 4(b) states that measuring a sharp cognitive decline in a minor
    creates a duty to escalate to a guardian because "a product which notices
    something and says nothing is in a worse position than one that never
    looked."
  - Question 5 states that when a minor's food log and body-mass entries show a
    visible under-eating pattern, Forge "must say nothing."

Both scenarios involve an algorithm detecting an adverse state in a child from
data Forge holds. One of these positions has to move. If measuring cognitive drop
creates a duty to warn, explain why measuring extended calorie deficit does not
-- or confirm that both must remain silent.


2. QUESTION 4(a): SUPPLY THE DISCLAIMER SENTENCE

We asked what disclaimer language actually works to defeat the concussion-screen
inference, and received back the statement that a disclaimer nobody reads is not
a defense -- which is the exact risk we highlighted in the question.

We need one of two concrete outputs from counsel:

  (a) The exact, drafted disclaimer sentence(s) to place on the screen shown to a
      coach.
  (b) An explicit ruling that no disclaimer language is legally sufficient to
      protect Forge, in which case the coach view for minors will be killed
      entirely.


3. QUESTION 5: MANDATORY REPORTING OBLIGATIONS

The response answered "may we say anything" (no), but left "must we"
unaddressed. Where Forge's system holds data showing severe under-eating combined
with declining performance in a 13- to 17-year-old:

  - Does Forge itself incur a mandatory child-welfare reporting obligation under
    the laws of any state where we operate?
  - Does the coach -- as a school or club employee reading the data on Forge --
    incur a reporting obligation that our Institutional Service Agreement must
    account for?


4. QUESTION 9: IS IT AN EDUCATION RECORD AT ALL, AND THEN THE SCHOOL-OFFICIAL
   EXCEPTION

The answer concludes that a Forge-generated score read by a school coach becomes
an education record under FERPA. We need two rulings, in this order, because they
cut in opposite directions for our Institutional Service Agreement.

  (i) THRESHOLD. Under 34 CFR 99.3, an education record is one maintained by the
      educational agency OR BY A PARTY ACTING FOR IT. Forge maintains the Anvil
      score for its own purposes, under a direct contractual relationship with
      the athlete and their guardian, not under a contract with the school; the
      school supplies no part of it and the coach only reads it. Is it an
      education record at all?

  (ii) IF IT IS. Does Forge qualify under the School Official Exception,
       34 CFR 99.31(a)(1)(i)(B), addressing each of the three prongs
       specifically:
         1. Performing an institutional service or function for which the school
            would otherwise use employees.
         2. Operating under the direct control of the school with respect to the
            use and maintenance of education records.
         3. Compliance with the redisclosure restrictions of 34 CFR 99.33(a).
       And whether 34 CFR 99.7's annual-notification requirement means a district
       must already have specified parties like Forge as school officials before
       we can qualify -- which is an obligation the Institutional Service
       Agreement can place on the district.

We are asking (i) first and separately because we do not want to accept
school-official status by agreement if the record is outside FERPA to begin with:
prong 2 is direct school control over the use and maintenance of education
records, so a clause accepting it is itself evidence that Forge acts for the
school. A plain yes or no on either half, without the analysis, cannot be built
into the agreement.


5. QUESTION 10: SCOPE OF THE PERMITTED AND FORBIDDEN WORDS

Clarify whether the forbidden-words ruling applies strictly to the Anvil or
platform-wide.

Forge already ships, in the product as it stands today, a surface titled
"Readiness" with its own banner and route, a "Recovery" page, and a "Fatigue"
column on the coach's analytics screen. These are product surfaces and were not
individually reviewed; the readiness score is generated by a model, and its
disclosure to our AI provider is covered by the Privacy Policy. A platform-wide
prohibition is therefore a rename of three live features, which we will do if
required but would rather not do by implication.
```

Plus the one number nobody supplied: **21's retention ceiling.**

### WHAT CHANGED BETWEEN THE DRAFT AND WHAT WAS SENT, AND THE DECISION INSIDE FOLLOW-UP 2

The sent text is above, verbatim. This is the account of how it got there, kept because two of
the changes are reasoning that would otherwise have to be re-derived.

Scott tightened the five and the tightening is kept: he renumbered them against the packet's own
numbering (18 -> 4, 19 -> 5, 23 -> 9, 24 -> 10, which is what the reviewer sees), cited
**34 CFR 99.31(a)(1)(i)(B)** and **99.33(a)** with the three statutory prongs enumerated, split the
reporting question into Forge's obligation and the coach's, and -- the best of the four -- **stated
the consequence** on 4(a), which is what makes a restatement an unsatisfying answer. Citations
verified against the eCFR and the Department's Student Privacy Policy Office FAQ: the three prongs
are the regulation's own, and 99.33(a) is the redisclosure provision.

**CORRECTION 1, AND IT IS THE ONE THAT MATTERS: ASKING ONLY ABOUT THE EXCEPTION CONCEDES THE
QUESTION THAT DECIDES IT, AND THE CONCESSION CAN CREATE THE ANSWER.** The draft read "the answer
notes that a Forge-generated score read by a school coach becomes an education record under FERPA,
but does not evaluate the School Official Exception." Those are two questions and the first is also
unsettled. An education record under **34 CFR 99.3** is one maintained by the educational agency
**or by a party acting for it**; if Forge maintains the Anvil score for its own purposes under a
direct relationship with the athlete and their guardian, it may not be an education record at all,
and the school-official exception never arises. The exception governs DISCLOSURE of records that
already are education records.

The two answers cut in opposite directions for the Institutional Service Agreement, which is why
the order matters. If it is not an education record, the ISA needs nothing -- **and Forge should
NOT sign a clause accepting school-official status, because direct control over the use and
maintenance of education records is prong 2 of the exception, so agreeing to it is itself evidence
of acting for the school and could bring the record inside FERPA that was outside it.** Asking only
about the exception risks talking ourselves into the harder answer. That is why follow-up 4 above asks two questions in order.

**CORRECTION 2: "all of which were previously reviewed" overstates what was reviewed.** Forge's
LEGAL DOCUMENTS are attorney-reviewed; the readiness, recovery and fatigue SURFACES are product and
were never reviewed individually. What is true, and is the useful claim: they ship today, and the
readiness score's data flow is disclosed, because `getOrCreateReadinessBriefing` calls
`generateReadinessBriefing` -- it is a model-backed feature and the Privacy Policy's AI-provider
disclosure covers it. Follow-up 5 above says it that way.

**ADDED: a fourth element on 9 that is the DISTRICT's and not ours.** 34 CFR 99.7's annual
notification requires a school to specify the criteria for who constitutes a school official, so a
vendor cannot qualify unless the district's own annual notice names parties like us. That is a thing
the ISA can REQUIRE the district to have done, and it is worth knowing before a procurement office
asks.

**THE DECISION INSIDE FOLLOW-UP 2, recorded because it stacks on two others and the three must not
be read apart.** Scott, in the sent text: if counsel rules that no disclaimer language is
sufficient, **"the coach view for minors will be killed entirely."** So:

- Adults are unaffected either way -- an adult athlete's reading goes to their coach as decided.
- On that ruling, **17(b)'s guardian switch becomes moot for minors**: there is no coach view left
  to switch off, and the switch survives only for the adult case where it was never the point.
- And Scott's decision of the same day that the coach gets both the daily and the weekly view
  survives **for adult athletes only** in that branch.

Also carried into `docs/anvil/research-2026-11-06.md` beside the decision it conditions.

## How these reach a reviewer

Alongside `docs/biometric-release-for-counsel.md`, which carries the video and
biometric consent plus the engineering facts behind each of its claims, and
`docs/anvil-for-counsel.md`, which carries questions 15 to 24: what the Anvil is, what each
of its four tasks records, who sees the result, and what Forge already holds under which
consent. Questions 15 to 24 cannot be answered without that packet.

**Every document is now attorney-reviewed.** The Assumption of Risk, the AI Terms of Use,
the research consent and the signup Terms of Use were reviewed 2026-09-19 (questions 8 to
10). The Privacy Policy, the EULA, the Notice to Parent or Guardian and the Institutional
Service Agreement were confirmed reviewed by Scott on 2026-09-20 ("yes the others are
attorney reviewed"), as the text stood that day including the factual corrections from the
2026-09-19 pass (see `git log -- server/seed-data/legal-documents-draft.ts`). The Terms of
Service is not on any list because it no longer exists -- it was merged into the Terms of
Use on 2026-09-19. The open questions above (1 to 6) are still questions about wording or
enforceability; they do not make a document unreviewed. Question 5 travels with the Notice,
which is also the parental consent document. The Service Agreement's text lives in
`shared/institutional-service-agreement.ts` (mirrored in
`docs/institutional-service-agreement.md`) and since 2026-09-19 is signed in the app, with
a hash of the signed text kept on every signature -- questions 2 and 3 travel with it. An
answer that changes its wording changes the hash for later signatures and leaves earlier
signed copies as they were.
