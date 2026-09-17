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

## How these reach a reviewer

Alongside `docs/biometric-release-for-counsel.md`, which carries the video and
biometric consent plus the engineering facts behind each of its claims.

**Four documents under review:** the Terms of Service, the Privacy Policy, the EULA,
and the Notice to Parent or Guardian. It was five; the Institutional Service Agreement
outline is gone, superseded by the Rocket Lawyer Service Agreement, which is a signed
contract rather than a document in this repo -- questions 2 and 3 travel with it and
should reach whoever reviews it.

**Five documents people accept in the product,** separate from the above and not
drafts: the signup Terms of Use, the video and biometric consent, the assumption of
risk, the AI Terms of Use, and the research consent.

No live document carries draft, placeholder or "do not send" language. That is
asserted by server/seed-data/documents-are-not-drafts.test.ts rather than by this
sentence.
