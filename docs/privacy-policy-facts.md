# What Forge actually collects, keeps, and sends

Source material for the privacy policy, written from the code rather than from a template. Every
claim below names where it lives so it can be re-checked when behaviour changes — and it will
change, so treat a statement here that no longer matches the code as a bug in this file.

**This is engineering fact, not legal drafting.** It says what the software does. Which of it must
be disclosed, in what words, and under which statute is counsel's call. Nothing here should be
described as COPPA- or BIPA-compliant — see the standing note at the top of
`shared/privacy-tiers.ts`.

The sections below map onto the gaps found in the current policy: §XIII (children), §III
(biometrics), §IV (third parties), plus retention and parental rights, which the policy does not
cover at all.

---

## 1. Children under 13 — the policy currently says the opposite of the truth

The policy says Forge "does not knowingly collect personally identifiable information from
children under the age of thirteen." **Forge knowingly collects from under-13s by design.**

- `tier1_under13` is a first-class privacy tier (`shared/privacy-tiers.ts`).
- Under-13s can register directly, and a coach can provision one.
- Both signup paths **require** a date of birth and will not create the account without one
  (`server/storage.ts`, `server/auth.ts`), so age is known, not inferred.
- From an under-13 athlete Forge collects: name, email address, date of birth, and — where the
  coach enables it — video of them training and measurements derived from that video.

The second sentence ("you must ask your parent or guardian for permission") also understates what
the software does. Permission is not requested, it is **enforced**:

- A minor athlete cannot use Forge at all until a parent or guardian creates their own linked
  account and agrees. The gate is one middleware mounted ahead of every route in
  `server/routes.ts`; it refuses every request with HTTP 403 until a guardian link exists.
- It applies to every athlete under 18 regardless of how they arrived — free agent, coach-
  provisioned, or moved between rosters. It reads role and age, never membership.
- An athlete whose age cannot be determined is held too, under a separate reason, and is asked
  for a date of birth rather than told to ask a parent.
- At claim time the guardian agrees to three things separately: the terms, the privacy policy,
  and the video and biometric release. Each is recorded as its own consent record with the exact
  document text as it stood at that moment.
- A second confirmation email then goes to the same address, stating what was agreed and how to
  withdraw it if the reader did not do it.

## 2. What the biometric section should say

The policy currently lists "facial recognition data, fingerprints, voiceprints." **Forge collects
none of those.** It does not perform facial recognition, does not read fingerprints, and records
no audio whatsoever — the capture session has no audio input and the app requests no microphone
permission (`ios/App/App/AvBodyTrackingPlugin.swift`).

What it does collect, when an athlete films a set:

- **Video** of the athlete performing an exercise, recorded on their own device.
- **Skeletal joint coordinates** produced by on-device body-pose estimation — the positions of
  joints over time, from which everything else is derived.
- **Kinematic measurements**: bar or body path, range of motion, concentric and eccentric
  velocity, bar-path deviation, jump height, ground contact time, rep counts, and derived figures
  such as power and velocity loss.

Where the analysis happens matters and is worth stating: **pose estimation runs on the athlete's
own device**, against a clip recorded locally, not on a server. What reaches Forge's servers is
the video file (where kept) and the numbers.

## 3. Who can see it

Forge has no "general public" visibility for athlete media. Access is limited to:

- **The athlete.**
- **Their parent or legal guardian**, through the guardian dashboard, which shows training
  calendar, progress, videos, goals, wellness history, injury history, nutrition and food log.
- **Their coaches and organization staff.**
- **Forge administrators**, for support, auditing and video management. Every time a coach or
  admin streams an athlete's video it is written to an access audit log; an athlete viewing their
  own is not.
- **Service providers** listed in §4.

## 4. Third parties that actually receive data

The policy's current §IV says personally identifiable information "is transferred to the third
party" when Forge contacts users on behalf of external business partners. **No such transfer
exists anywhere in the codebase**, and for a minor's name, email and phone it would run against
everything else described here. Recommend striking it.

What genuinely leaves Forge:

| Service | What it receives | Why |
| --- | --- | --- |
| **Anthropic** | Athlete training metrics and profile context. **For an AI form check, also still frames pulled from the athlete's training video.** | AI coaching and form feedback (`server/ai.ts`) |
| **Render** | Everything — application hosting and the database | Hosting |
| **Stripe** | Billing identifiers and payment details | Card payments |
| **Apple** | In-app purchase transactions; device tokens for push | IAP and notifications |
| **Resend** | Email address and message content | Transactional email |
| **ipapi.co** | The IP address of a login | Naming the location in a new-device alert |
| **USDA FoodData Central / Open Food Facts** | Food search terms | Nutrition lookups |
| **YouTube** | Requested from the athlete's own browser when a coach embeds a video | Embedded lesson media |

**The Anthropic image path is the disclosure most likely to be missed.** When an athlete requests
an AI form check, still frames of them training are sent to the model provider together with
their profile and analytics — height and build, and any flagged joint restriction or asymmetry.
That is frames of a person, who may be a minor, leaving the platform. It is not covered by
"infrastructure providers" in any reading a parent would expect.

## 5. Retention — specific, enforced, and currently undisclosed

The policy says biometric data is kept "no longer than necessary." The real schedule is concrete:

- **Raw video for an athlete under 13 is deleted 30 days after the set.** For 13–17, 90 days
  (`TIER1_VIDEO_RETENTION_DAYS` / `TIER2_VIDEO_RETENTION_DAYS`). A daily job deletes the file and
  clears the URL. This runs unconditionally — it is not behind a billing or beta switch.
- **Derived numbers survive the video.** Velocity, range of motion, jump height, rep counts and
  the rest are separate columns and are never touched by a video purge. This is deliberate: the
  training record is the athlete's history, and deleting it was never what the retention promise
  was about.
- **A separate rolling cap** keeps the 10 most recent videos per athlete per exercise, of which up
  to 5 can be marked favourite and are never evicted. Anything over cap gets a 7-day warning,
  with a notification linking to the clip, before deletion. For minors this cap applies regardless
  of billing state; for adults it is currently unlimited while billing enforcement is off.
- **Purging a video never changes a metric, a personal best, or a trust score.**

## 6. Parental rights the software actually implements

COPPA expects a policy to describe these. Forge has them built:

- **Review.** The guardian dashboard shows the athlete's training record and their videos.
- **Turn off collection.** A guardian can set camera tracking off for their athlete, prospectively.
- **Ask for a video to come down.** A guardian files a removal request, which a person answers.
  A guardian cannot delete a single video themselves — that clip is the coach's and the athlete's
  training record as much as it is footage of a child.
- **Withdraw consent entirely.** A guardian can withdraw the consent the account stands on. This
  writes a dated withdrawal record quoting what was withdrawn, purges every stored video on the
  account, and returns the child to the gate — they cannot use Forge again until a guardian
  claims afresh. Derived metrics survive, the same way they survive a retention purge.
- **Delete the account.** Available to the account holder.

## 7. Research extracts

Separately consented, opt-in, and not mentioned in the current policy at all:

- De-identified, aggregated extracts may be shared with outside parties **only** where the
  athlete (or their guardian) has separately opted in.
- Extracts are built from a research mirror written ahead of time, never from live athlete rows.
- No cell describing fewer than 10 individuals leaves the platform
  (`RESEARCH_EXPORT_MIN_CELL`).
- Withdrawal removes the athlete from the mirror and writes its own dated consent record.

## 8. Contact details — settled, except in the two documents outside this repo

`shared/contact.ts` now holds the single address, `forgeperformancesystems@outlook.com`, and
every document generated from this repository interpolates it: the live signup agreement, and
the drafted terms, privacy policy, biometric waiver and parental notice. A test asserts no
document carries any other address and that each one a user is shown carries this one, so a
fourth address cannot appear quietly. The biometric waiver's rights section also gained the
address — it stated a right to ask what data Forge holds while giving no way to ask.

**Two documents are not in this repository and still disagree**, and neither can be fixed from
here:

- **The EULA** says `legal@forgeperformance.com`. That domain matches nothing: the registered
  application identity is `com.foreperformancesystems.forge` — note **fore**, not **forge** —
  consistent across the Xcode project, `render.yaml` and the in-app purchase product
  identifiers. It needs replacing with the address above.
- **The Rocket Lawyer privacy policy PDF** gives `forgeperformancesystems.com`, the right email,
  and a phone number left as `__________`. **Decided 2026-09-16 (Scott): no phone number.** The
  line comes out rather than being filled. Email is the only published channel, which is
  consistent with every other document and honest about how Forge is actually reachable -- a
  published number nobody answers is worse than no number at all. Nothing in the software
  collects or depends on a support phone number, so this is a document edit only.

Whichever address is chosen it should be one that is actually monitored. A rights request under
a privacy statute that reaches nobody is a compliance failure, not a typo — which is the reason
this section exists rather than being a note about tidiness.
