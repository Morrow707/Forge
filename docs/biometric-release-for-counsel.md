# Forge — video and biometric consent and release

**For legal review.** Prepared 2026-09-16. Two parts: the document as it currently
stands in the product, and the engineering facts behind each claim in it so they can
be checked rather than taken on trust.

Forge is a training and coaching platform. **Its users include minors, including
children under 13.** Every athlete under 18 is blocked from using the product until a
parent or legal guardian creates their own linked account and agrees on their behalf.

## How this consent is actually collected

- **Adults** agree in the app, at the moment they first point the camera at a set. It
  is a single-purpose dialog, not pre-ticked and not bundled with any other agreement.
  Declining is a real option: the set still logs with reps and weight, only the camera
  measurements are withheld.
- **Minors** — a parent or guardian agrees while claiming the child's account, as one
  of three separately ticked agreements (terms, privacy policy, this release).
- **What is stored as the record**: the exact text of this document as it stood at that
  moment, the date and time, the IP address, and the browser or device string. There is
  no signature page and no handwritten signature anywhere in the product.

## Document text as it currently stands

FORGE -- VIDEO AND BIOMETRIC CONSENT AND RELEASE

This release covers video of an athlete training and the measurements Forge takes from it. It is separate from, and in addition to, Forge's Terms of Use and Privacy Policy. An adult athlete agrees to it for themselves. For an athlete under 18 it is agreed by a parent or legal guardian.

1. WHAT IS RECORDED AND MEASURED

When an athlete films a set, Forge records video on the athlete's own device and measures their movement from it:

- The positions of their joints over time, frame by frame.
- Figures derived from those positions: bar or body path, range of motion, concentric and eccentric velocity, bar-path deviation, jump height, ground contact time, repetition counts, and figures such as power and velocity loss calculated from them.

Some of this is biometric information under Illinois' Biometric Information Privacy Act and comparable state laws.

The analysis runs on the athlete's own device, against a clip recorded locally. What reaches Forge's servers is the video file, where it is kept, and the resulting numbers.

Forge does not perform facial recognition. It does not read fingerprints. It records no audio at all -- the capture session has no audio input and the app requests no microphone permission. It does not use any of this to identify or verify who someone is.

2. WHY

To provide coaching: showing an athlete and their coach their own performance, tracking it over time, and flagging movement faults. Nothing here is used for any other purpose.

3. WHO CAN SEE IT

The athlete. Their parent or legal guardian, through the guardian dashboard. Their coaches and their organization's staff. Forge administrators, for support, auditing and video management -- and every time a coach or administrator opens an athlete's video, that access is written to a log. The service providers named in the Privacy Policy, only as needed to operate the Service.

There is no public or general-audience visibility for athlete media anywhere in Forge.

4. NO PROMOTIONAL USE, AND NO SALE

Forge does not use an athlete's video, image or likeness for advertising, marketing, promotion or any public-facing purpose. Forge does not sell, rent, lease or trade personal information, and does not sell biometric data.

De-identified group statistics may be shared with an outside organization, including for payment, but only where the athlete (or their guardian) has separately opted in to that specific use, and only as group figures with any group of fewer than ten people withheld -- no identifiers, no video, no free text.

5. HOW LONG VIDEO IS KEPT

Raw video of an athlete under 13 is deleted 30 days after the set. For an athlete aged 13 to 17, 90 days. This runs automatically.

For all athletes, Forge keeps a limited number of recent videos per exercise, some of which can be marked favourite and are never deleted automatically; the current limits are shown in the app, and a video is flagged in advance before it is removed under them.

Deleting a video does not delete the numbers derived from it. Range of motion, velocity, jump height, repetition counts, personal bests and similar figures are the athlete's training record and are kept until the account is deleted. Deleting the account permanently removes that account's stored video immediately, for every age.

6. THE RIGHT TO SEE IT, AND TO STOP IT

A parent or guardian may view their athlete's stored video and derived performance data at any time through the guardian dashboard, and may request the removal of any particular recording. There is no right of prior approval over the automated analysis itself, or over its technical output, which software produces at the time of upload.

Camera tracking is optional. An athlete can train and log sets normally without it. A guardian can switch it off for their athlete at any time, and doing so stops further collection from that point on.

7. WITHDRAWING THIS CONSENT

This consent may be withdrawn at any time, without giving a reason, and withdrawal does not require deleting the account.

- A parent or guardian withdraws from the guardian dashboard. Doing so permanently deletes every raw video stored for that athlete, records the date and what was withdrawn, and suspends the athlete's access to Forge until a parent or guardian consents again.
- An adult athlete withdraws by turning camera tracking off in their account, or by writing to the address below.

Withdrawal operates from the point it takes effect and does not undo processing that already happened. As in Section 5, the numeric training record survives; its deletion can be requested separately.

8. HOW THIS CONSENT IS GIVEN AND RECORDED

This release is agreed in the app, by an affirmative action that is not pre-ticked and not bundled with any other agreement. Forge stores the exact text of this document as it stood at that moment, together with the date and time, the IP address and the browser or device it was agreed from. That record is the evidence of consent; there is no separate signature page.

Declining is a real choice and carries no penalty. Sets still log, with reps and weight, without the camera measurements.

9. CONTACT

Questions, a request about what Forge holds, or a withdrawal: forgeperformancesystems@outlook.com

---

## The engineering facts behind each claim

Every statement in the document above is true of the software today. This section says
how, so a reviewer can test it rather than assume it.

| Claim in the document | What the software does |
| --- | --- |
| Joint positions captured frame by frame | Body-pose estimation (ARKit on iOS, MediaPipe on web/Android) produces joint coordinates over time; everything else is derived from them. |
| Analysis runs on the athlete's own device | Pose estimation runs locally against a clip recorded locally. Servers receive the video file (where kept) and the resulting numbers — not a live feed. |
| No facial recognition, no fingerprints, no audio | No face-matching or identity code exists. The capture session has no audio input; the iOS app requests no microphone permission at all. |
| 30 / 90 day video deletion for minors | A scheduled job deletes raw video 30 days after capture for under-13s and 90 days for 13–17s, and clears the link. It runs unconditionally — not behind a billing or beta flag. |
| Derived numbers survive video deletion | Velocity, range of motion, jump height, rep counts and personal bests are separate database columns, untouched by any video purge. |
| Rolling per-exercise cap | A limited number of recent videos are kept per athlete per exercise; some can be marked favourite and are exempt. A video is flagged in advance before removal. The numbers move with billing tier, which is why the document points to the app rather than quoting them. |
| Access logging | Every time a coach or administrator opens an athlete's video, the access is written to an audit log. An athlete viewing their own is not logged. |
| Guardian can view everything | The guardian dashboard shows training calendar, progress, videos, goals, wellness history, injury history, nutrition and food log. |
| Guardian can switch tracking off | A per-athlete setting that stops further collection prospectively. |
| Withdrawal without deleting the account | Writes a dated withdrawal record quoting what was withdrawn, permanently deletes every stored video on the account, and returns the athlete to the blocked state until a guardian consents again. |
| No sale, no promotional use | No advertising or marketing code path touches athlete media. No analytics or advertising SDK is present (the one third-party tool is crash monitoring, configured to collect no bodies, headers or cookies). |
| De-identified extracts, opt-in, groups of ten | Extracts are built from a separate research mirror written ahead of time, never from live athlete rows, and suppress any cell describing fewer than ten people. Consent is opt-in and separate from every other setting. |

## What we are asking

1. **Is a clickwrap sufficient here, or does this need a signature?** Illinois BIPA
   requires a "written release". We capture an affirmative in-app action plus the exact
   document text, timestamp, IP and user agent — but no signature. The prior draft of
   this document assumed a signature page that has never existed. If a signature is
   required, that is a build, and we would like to know before more consents accumulate.

2. **Is the published retention schedule adequate?** BIPA requires a written retention
   schedule and destruction guidelines. Ours is 30 days (under 13) and 90 days (13–17)
   for raw video, with no age-independent ceiling, and **derived numeric metrics are
   retained indefinitely until the account is deleted**. Two questions: does stating
   operational windows this way satisfy the requirement, and are the derived metrics
   themselves "biometric information" that needs its own destruction schedule? That
   second one matters most — our whole retention design rests on video and numbers being
   treated differently.

3. **Is the rights statement complete?** Section 5 above and the Privacy Policy describe
   access, deletion and withdrawal. We do not know whether that is everything BIPA and
   comparable state statutes require, or whether specific statutory language is expected.

4. **Which statutes should this name?** It currently names BIPA and refers to
   "comparable state laws" generally. Should Texas CUBI, Washington HB 1493, and the
   state comprehensive privacy laws be named specifically?

5. **Does a guardian's consent satisfy BIPA for a minor**, and does the way we obtain it
   — a linked guardian account, three separately ticked agreements, a confirmation email
   to the same address afterwards — hold up? A coach may relay a guardian's answer in
   some flows, and must name who they are relaying from.

6. **Adults vs minors.** Minors have automatic video deletion; adults currently do not
   (their video persists until they delete it or their account). Is that asymmetry
   defensible, given BIPA is not age-limited and applies to adults with a private right
   of action?

7. **Is anything in the document a promise we should not be making** — particularly
   Section 4's "no sale", Section 3's list of who can see the data, and Section 7's
   description of withdrawal.

## What this document is not

It has not been reviewed by a lawyer. It was written from the source code to be
accurate about behaviour, which is the part engineering can guarantee and a template
cannot. Whether it is legally sufficient, and under which statute, is the question.

Nothing here should be described as BIPA- or COPPA-compliant. We do not make that claim
anywhere in the product or in our documentation.
