# Proposed clause revisions, and the consents that are missing

**RESOLVED, all of it, as of 2026-09-19.** Part 1's Privacy Policy wording is what section 7 of
the live policy says today. Part 2's missing consents exist: the Video and Biometric Consent and
the Assumption of Risk are live, adult-facing documents, both reviewed by counsel. Kept as the
record of how the gaps were found; nothing here is open.

Two parts. Part 1 is replacement wording for the two clauses that contradict shipped behaviour.
Part 2 is what the software does that no document currently covers.

**Proposed wording, not legal advice.** The clauses below are written to match what the code
actually does and to stop the documents contradicting each other. Whether they are sufficient, and
under which statute, is counsel's call. The standing note in `shared/privacy-tiers.ts` about not
claiming compliance still applies.

---

# Part 1 — the two clauses to replace

## A. Privacy policy §IV — Sharing Information with Third Parties

**Why:** the current text says personally identifiable information "is transferred to the third
party" when Forge contacts users on behalf of external business partners. That practice exists
nowhere in the codebase, and applied to a minor's name, email and phone it contradicts the video
release and the entire guardian architecture. Two neighbouring sentences are also template
residue: Forge has no "customer lists", and arranges no "deliveries".

### Replacement

> **IV. Sharing Information with Third Parties**
>
> The Company does not sell, rent, or lease personal information to third parties. The Company
> does not sell biometric data to third parties. The Company does not transfer your personal
> information to advertisers or marketing partners, and does not contact you on behalf of
> external businesses.
>
> The Company shares personal information only with service providers that operate the Service on
> its behalf, and only to the extent each provider needs it to perform that function. These are:
>
> - **Application and database hosting**, which stores all account, training and media data.
> - **Payment processing**, which receives billing identifiers and payment details.
> - **App store billing and push notification delivery**, which receive purchase transactions and
>   device notification tokens.
> - **Transactional email delivery**, which receives your email address and the contents of
>   messages sent to you.
> - **IP geolocation**, which receives the network address of a sign-in so a new-device alert can
>   name the approximate location it came from.
> - **Food and nutrition databases**, which receive the food terms you search for.
> - **An artificial-intelligence model provider**, described separately below.
>
> All such providers are prohibited from using your information for any purpose other than
> providing that service to the Company, and are required to keep it confidential.
>
> **Artificial intelligence processing.** Where you use an AI feature, the Company sends the
> information that feature needs to a third-party AI model provider. For AI coaching and written
> feedback, this is your training data and profile information. **For an AI form check, this also
> includes still images taken from the training video you submitted, together with your height,
> build, and any movement restriction or asymmetry recorded in your profile.** AI features are
> used only at your request or your coach's, and are not applied to your data otherwise.
>
> The Company may disclose personal information, without notice, if required to do so by law or
> in the good-faith belief that such action is necessary to: (a) comply with the law or legal
> process served on the Company; (b) protect and defend the rights or property of the Company;
> or (c) act under exigent circumstances to protect the personal safety of users of the Service
> or the public.

**Note for counsel:** the AI paragraph is the disclosure no current document makes, and it is the
one a parent is least likely to expect. Images of an athlete — who may be a child — leave the
platform when a form check is requested. Naming the specific provider is a choice worth making
deliberately: naming it is more transparent, but means the policy must be edited if the provider
ever changes.

---

## B. Video consent and release — revocability and the inspection waiver

**Why:** the release grants an "absolute and irrevocable" right and waives any right "to inspect
or approve" the use. Both now contradict the product. A guardian can withdraw consent, which
purges every stored video on the account; and the guardian dashboard exists precisely so a parent
can inspect. A document that denies both describes software Forge does not run.

### B1. Replace the grant sentence

Current: *"...the absolute and irrevocable right and permission to use the recorded image and/or
voice..."*

> ...the right and permission, revocable as set out in Section 4 below, to use the recorded image
> of [Athlete Name] (the "Image") that has been (or is being) obtained pursuant to this Consent
> and Release, subject strictly to the limitations set forth below.

### B2. Add a revocation section

> **4. Withdrawal of Consent**
>
> The undersigned may withdraw this consent at any time, without giving a reason, from the
> guardian dashboard within the Service or by contacting the Company at the address above.
>
> On withdrawal, the Company will: (i) permanently delete every raw video file stored for the
> Recorded Party, and clear the associated links; (ii) record the date of the withdrawal and what
> was withdrawn; and (iii) suspend the Recorded Party's access to the Service until a parent or
> legal guardian provides consent again. The Recorded Party cannot use the Service without a
> consenting guardian.
>
> Withdrawal does not delete the numeric performance and kinematic measurements already derived
> from video — range of motion, velocity, jump height, repetition counts and similar figures —
> which remain part of the athlete's training record on the same basis described in Section 2.
> Deletion of the training record itself may be requested separately.
>
> Withdrawal operates prospectively and does not undo any use of the Image that already occurred
> in accordance with this Consent and Release before the withdrawal took effect.

### B3. Replace the inspection waiver

Current: *"The undersigned waives any right ... to inspect or approve the Released Party's use of
the Image and/or Voice."*

> The undersigned may view the Recorded Party's stored video and derived performance data at any
> time through the guardian dashboard within the Service, and may request the removal of any
> particular recording. The undersigned does not have a right of prior approval over the
> automated analysis the Service performs on a recording, or over the technical output of that
> analysis, which is produced by software at the time of upload.

**Note for counsel:** in a standard media release that waiver stops a subject demanding approval
over each promotional use. Section 1 of this release now prohibits promotional use outright, so
the clause had nothing left to do except waive a right the product actually provides. The
replacement keeps the narrow, sensible part — no approval right over automated processing output
— and drops the rest.

---

# Part 2 — consents and waivers that are missing

Ordered by how exposed each one leaves you.

## 1. There is no biometric consent for adults — the largest gap

The video and biometric consent exists as a document, but `server/routes.ts` says of the whole legal-document
set: *"not wired into signup or any live consent-collection/delivery flow, purely for admin
editing/printing/emailing pending real legal review."*

The only live biometric consent anywhere is the one collected when a guardian claims a minor's
account. That means:

- **An adult athlete — a free agent, or an adult on a coach's roster — signs nothing about
  biometric data.** They tick a general terms box at signup and that is all.
- Forge extracts skeletal joint coordinates from video for those athletes exactly as it does for
  minors.
- Biometric-privacy statutes are not age-limited. Illinois BIPA in particular applies to adults,
  requires written consent before collection, and carries a private right of action — it is the
  statute behind the nine-figure settlements the note in `privacy-tiers.ts` refers to.

Protecting children thoroughly while collecting the same data from adults with no consent on file
is the inconsistency most likely to matter.

**What that needs:** the biometric release wired into adult signup as its own affirmative
agreement, recorded as its own consent record with the document text snapshotted — the same
pattern now used at guardian claim.

## 2. The agreement text itself may be empty

`getLegalAgreement()` returns a single admin-editable field, falling back to the literal string
*"No agreement has been configured yet."* Whatever is in that field is snapshotted into every
consent record as the thing the person agreed to. If it has never been filled in, every consent
record on the platform says the user agreed to that sentence. **Worth checking production before
anything else here.**

## 3. Health information has no consent of its own

Forge records whether an athlete is healthy or hurt, an injury history, and wellness check-ins,
and shows them to coaches. This is health information about a child, collected and shared, with
no health-specific disclosure or consent. Forge is not a HIPAA covered entity, but several state
privacy laws treat health data as a sensitive category requiring separate treatment.

## 4. Nutrition guidance to minors has no disclaimer

The app logs food and gives nutrition guidance, including to athletes under 13. Calorie and intake
guidance directed at children is a recognised safety area, and there is no disclaimer, no
"consult a doctor or dietitian" language, and no guardian acknowledgment specific to it. The
EULA's general assumption-of-risk clause covers physical training, not dietary advice.

## 5. The athlete may never see the assumption-of-risk terms

The EULA's athletic-injury clause is accepted at signup — but for a minor, the guardian accepts
on their behalf and the athlete themselves may never read it. A short in-app acknowledgment shown
to the athlete before their first tracked session would put the warning in front of the person
actually lifting.

## 6. Sign-in location lookup is undisclosed

The IP address of each sign-in is sent to a third-party geolocation service so a new-device alert
can name where the login came from. Reasonable and security-motivated, but it is a transfer of
personal data to a third party and appears in no document. Covered by the §IV replacement above.

## 7. Already covered, for completeness

These exist and are working, and need no new instrument:

- **Research participation** — separately consented, opt-in, de-identified, with a suppression
  floor of 10 and its own withdrawal path.
- **Camera tracking** — a guardian can switch it off prospectively.
- **Video removal** — a guardian can request removal of a particular recording.
- **Institutional agreement** — a document type exists for schools and teams, though like the
  others it is not yet wired into any live flow.
