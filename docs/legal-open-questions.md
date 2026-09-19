# Open questions for counsel

**These are questions, not text.** Each one used to sit inside a document as a
`[Placeholder -- ...]` bracket, which meant a parent reading /terms was being shown
Forge asking its own lawyer whether the clause above worked. A note to counsel inside
a document a user accepts is an admission printed on the thing it undermines, so the
questions live here and the clauses stand on their own.

Nothing here is resolved unless it says so. They move out of this file when counsel
answers them, and the answer changes the clause rather than this list.

## 1. Terms of Service, s14 Indemnification -- OPEN

Confirm with counsel whether and how this section can apply where the person being
asked to indemnify is a minor athlete or their parent/guardian; several states limit
or void an indemnification obligation imposed on a minor.

This is the one question in this file that is unambiguously still live, and it is
about a document people accept today.

## 2. Service Agreement: who obtains guardian consent -- OPEN, and re-pointed

Counsel should confirm exactly what allocation of this responsibility is enforceable,
and whether any additional Forge-side mechanism is needed to support it, rather than
assuming a contract clause alone resolves it.

Originally written about a Forge-drafted institutional outline that has since been
DELETED (see server/seed-data/legal-documents-draft.ts). The question survives it
because it was never about that document's wording -- it is about whether a contract
can put this obligation on a school at all. It now applies to the Rocket Lawyer
Service Agreement, which is what a school actually signs.

## 3. Service Agreement: indemnity for a consent failure -- OPEN, and re-pointed

The core liability-shifting mechanism of the Agreement, and the clause most in need of
real counsel drafting. Note that moving the obligation onto the Institution does not
resolve question 1: the consumer Terms of Service carries its own unresolved flag for
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

## 5. Verifiable parental consent for under-13s -- OPEN, and not a document

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

## 6. Apple Health data reaching the AI provider -- OPEN

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
consented under the 2026-09-17 wording is asked again. One word open: section 6 says "age
bracket"; the store keeps age in whole years. Scott to choose "age" in the text or a band in
the store.

The AI Terms of Use is REVIEWED: Scott, 2026-09-19, "we used the AI terms of use as a
draft, a lawyer modified that". Its file header says so.

## 10. Signup Terms of Use -- OPEN, packet prepared 2026-09-19

The last live document with no lawyer's eyes on it. `docs/signup-terms-for-counsel.md`
carries four factual additions Forge wants regardless (the guardian's fourth agreement,
Apple Health, error monitoring, what deletion leaves behind), five questions (two Terms
documents and precedence, a zero liability cap for non-paying users, changes without notice,
promising a technical control, general), and the full text. Every claim in the document was
checked against the code that day and holds.

## How these reach a reviewer

Alongside `docs/biometric-release-for-counsel.md`, which carries the video and
biometric consent plus the engineering facts behind each of its claims.

**Four documents still under review** (the Assumption of Risk, the AI Terms of Use and the research consent were reviewed 2026-09-19, questions 8 and 9) (factual corrections from the 2026-09-19 pass already
applied; see `git log -- server/seed-data/legal-documents-draft.ts`): the Terms of Service,
the Privacy Policy, the EULA, the Notice to Parent or Guardian, and the Institutional
Service Agreement. The Notice is also the parental consent document, so question 5 should
be put to whoever reads it, at the same time. The Service Agreement's text lives in
`shared/institutional-service-agreement.ts` (mirrored in
`docs/institutional-service-agreement.md`) and since 2026-09-19 is signed in the app, with
a hash of the signed text kept on every signature -- questions 2 and 3 travel with it. An
answer that changes its wording changes the hash for later signatures and leaves earlier
signed copies as they were.
