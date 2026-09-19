# Forge -- signup Terms of Use: review request

Prepared 2026-09-19 for attorney review. The last of the nine live documents with no
lawyer's eyes on it. It is the clickwrap every account holder accepts at signup, and the
exact text is stored with each acceptance (`server/seed-data/signup-agreement.ts`; a
healthcare notice for clinicians is appended to it at deploy time).

Every factual claim in the document was checked against the code on 2026-09-19 and holds:
the guardian gate, the confirmation email, withdrawal purging video, the video access audit
log, no microphone permission, the 30/90-day minor video retention, favourites never
auto-deleted, the 7-day warning with a link, the AI form check sending still frames plus
height, build and flagged restrictions, the provider list, the research opt-in, payment as
guardian corroboration, and "no notice on change".

## Section 1. Four factual additions (Forge asks for these regardless of review)

These are things the software does that the Privacy Policy already discloses and this
document omits. Each is one or two sentences.

**A. Section 3, what the guardian agrees to.** Today: "the guardian agrees separately to
these terms, to the privacy policy, and to the video and biometric consent". Claiming a
minor's account actually records FOUR agreements; the Assumption of Risk is missing from
the list. Proposed: "...to these terms, to the privacy policy, to the video and biometric
consent, and to the assumption of risk and release, and a confirmation is emailed..."

**B. Section 4, Apple Health.** The app reads Health data when the athlete turns Health
sync on; the document does not mention it. Proposed, appended to the first paragraph of
section 4: "If you turn on Health sync, Forge also reads from Apple Health: sleep, resting
heart rate, heart rate variability, VO2 max, respiratory rate, weight, and heart rate around
a training session. It uses them to pre-fill your daily check-in and never writes anything to
Apple Health." And in section 8, after "that is your training data and profile
information": "including check-in values, some of which may have been pre-filled from Apple
Health."

**C. Section 9, error monitoring.** The server sends crash and failed-request details to an
error-monitoring service. It is absent from the provider list. Proposed, added to the list:
"an error-monitoring service that receives technical details when something in Forge
fails".

**D. Sections 10 and 14, what deletion leaves behind.** Section 14 says deleting the account
"removes it and the videos tied to it". For an athlete who opted into research under the
current consent, the de-identified numbers stay. Proposed, appended to section 10: "If you
opted in and later delete your account, the de-identified numbers already in the research
store stay, unless you withdraw from research first; the research consent explains this."
And appended to section 14's first sentence: "Section 10 describes the one thing that can
remain."

## Section 2. Questions for counsel

1. **Two documents called Terms.** Forge has this signup Terms of Use (accepted at signup,
   snapshotted per user) AND a public Terms of Service at /terms (lawyer-drafted). They
   overlap on medical disclaimer, risk, minors, AI, liability. Neither says which governs on
   a conflict. Should they be merged, or should this document carry a precedence clause,
   and which way should it point?
2. **Section 15, the liability cap.** "Limited to the amount you paid for it in the twelve
   months before the claim." Most users pay nothing during beta and coached athletes never
   pay (their school does), so the cap is zero for them. Is a zero cap enforceable in
   Arizona, and does the carve-out for death or personal injury caused by negligence
   interact correctly with the separate Assumption of Risk release, which does release
   ordinary-negligence injury claims?
3. **Section 16, changes without notice.** The document says Forge sends no notice when
   the terms change and that continued use means the current version applies. Is a
   modification clause with no notice enforceable against an existing user, and should a
   material change require re-acceptance in the app (which the software can do: research
   consent already re-asks everyone on a text change)?
4. **Section 3, the enforcement statements.** The document promises the guardian gate is
   "enforced by the software, not merely requested". That is true and tested. Is stating a
   technical control as a promise in the terms wise, or does it create a warranty Forge
   would rather not give?
5. **General.** Anything a national consumer clickwrap for minors' sports training should
   say that this does not.

## Document text as it currently stands

FORGE -- TERMS OF USE

These terms cover your use of the Forge app and website ("Forge"). By creating an account you agree to them. They are written to be read, not skimmed past, and they describe what the software actually does.

1. WHAT FORGE IS, AND WHAT IT IS NOT

Forge is a training and coaching tool. It holds programming, logs what you lift, analyses video of you training, and generates written feedback and suggestions.

Forge is not a medical device and does not provide medical advice, diagnosis, or treatment. Its measurements, analytics, and AI-generated suggestions are informational aids for coaches and athletes. They are never a substitute for the judgment of a physician, physical therapist, athletic trainer, dietitian, or coach. If something in Forge conflicts with what a qualified professional has told you, follow the professional.

Forge is not a clinical system of record and is not HIPAA compliant. If you are a licensed clinician, do not enter Protected Health Information or use Forge to document patient care. A fuller explanation for clinicians appears at the end of this document.

2. TRAINING CARRIES RISK

Strength training, jumping, sprinting, and skill work can cause injury, including serious injury. That risk exists whether or not software is involved, and Forge does not remove it.

You are responsible for deciding whether an exercise is appropriate for you, for using equipment correctly, and for stopping immediately if something causes pain or feels unsafe. Do not train through pain because a program says to. A prescribed weight, rep count, or progression in Forge is a suggestion generated from what you have logged; it is not an instruction from anyone who can see you.

If you coach athletes through Forge, supervising and modifying their training remains yours. Forge does not assess whether an athlete is ready for a movement.

Before starting or substantially changing a training program, and especially if you have a medical condition, an injury, or have been inactive, consult a physician.

3. WHO CAN USE FORGE

You may create an account for yourself if you are 18 or older.

An athlete under 18 may use Forge only with a parent or legal guardian who has their own linked Forge account and has agreed on the athlete's behalf. This is enforced by the software, not merely requested: a minor athlete's account is held and cannot be used until a guardian has claimed it and agreed. It applies to every athlete under 18 however they arrived -- signing up alone, invited by a coach, or moved between teams. An athlete whose date of birth is not on record is held the same way until it is supplied.

At the point of claiming, the guardian agrees separately to these terms, to the privacy policy, and to the video and biometric consent, and a confirmation is emailed to them describing what was agreed and how to withdraw it.

A guardian may withdraw that consent at any time. Doing so deletes every stored video on the athlete's account and returns the account to the held state; the athlete cannot use Forge again until a guardian consents afresh.

You are responsible for keeping your password to yourself and for what happens under your account. Tell us promptly if you believe someone else has access to it.

4. WHAT YOU ENTER, AND WHO SEES IT

Forge holds what you give it: your profile, your training, and -- if you use those features -- how you are sleeping and feeling, injuries you record, and what you eat.

Some of that is health information about you. You choose whether to enter it. If you do, your coaches and the staff of your organization can see it, because that is what makes it useful to them. A parent or guardian can see their own athlete's record, including training history, video, wellness and injury entries, nutrition and food log. Forge administrators can see it for support, auditing, and video management, and every time a coach or administrator opens an athlete's video it is written to an access log.

There is no public or general-audience visibility for athlete media anywhere in Forge.

Do not enter personal information about another person without their permission.

5. NUTRITION AND FOOD LOGGING

Forge's nutrition features -- calorie and macronutrient targets, food logging, and any dietary suggestion generated by an AI feature -- are general information, not dietetic or medical advice, and are not individually prescribed by a qualified professional.

They are not appropriate as a weight-loss program, and they are not designed for anyone with, or at risk of, a disordered relationship with food. Consult a physician or a registered dietitian before acting on them, and do so before applying any of it to an athlete under 18. Intake targets for a growing athlete are a clinical question, not a calculation.

If you are a coach or a guardian, guidance shown to a minor's account is your call to supervise.

6. CAMERA TRACKING AND BIOMETRIC DATA

If you film a set, Forge records video on your device and measures your movement from it -- the positions of your joints over time, and figures derived from them such as bar speed, range of motion, and jump height. The pose analysis runs on your own device against a clip recorded locally; what reaches Forge's servers is the video file, where it is kept, and the numbers.

Forge does not perform facial recognition, does not read fingerprints, and records no audio. The capture session has no audio input and the app requests no microphone permission.

Collection of this data is governed by a separate video and biometric consent, not by this document. An adult athlete agrees to it in their own right; for an athlete under 18 it comes from their guardian. Camera tracking is optional -- you can train and log normally without it -- and a guardian can switch it off for their athlete at any time.

7. HOW LONG VIDEO IS KEPT

Raw video of an athlete under 13 is deleted 30 days after the set. For an athlete aged 13 to 17, 90 days. This runs automatically and unconditionally.

For all athletes, Forge also keeps a limited number of recent videos per exercise, of which a few can be marked favourite and are never deleted automatically. The current limits are shown in the app. Before a video is deleted under this limit you are warned in advance, with a link to the clip.

Deleting a video does not delete the numbers derived from it. Range of motion, velocity, jump height, repetition counts, personal bests, and similar figures are your training record and are kept. Deletion of the training record itself can be requested separately, and you can delete your whole account at any time.

8. AI FEATURES

Where you use an AI feature, Forge sends what that feature needs to a third-party AI model provider. For AI coaching and written feedback, that is your training data and profile information.

For an AI form check, it also includes still images taken from the training video you submitted, together with your height, build, and any movement restriction or asymmetry recorded in your profile. That means images of the athlete leave Forge. AI features run only when you or your coach ask for them.

AI output is generated by software and can be wrong. Section 1 applies to all of it.

9. OTHER SERVICES FORGE RELIES ON

Forge does not sell, rent, or trade your personal information, and does not sell biometric data. It shares information only with the providers that operate the service: application and database hosting, payment processing, app store billing and push notification delivery, transactional email, a geolocation lookup on the IP address of a sign-in so a new-device alert can name where it came from, food and nutrition databases for the terms you search, and the AI model provider described above. Each receives only what it needs for that function.

Forge may disclose information where required by law, to protect its rights or property, or in an emergency to protect someone's safety.

10. RESEARCH

Forge may share de-identified, aggregated extracts with outside parties, but only for athletes who have separately opted in -- it is off unless chosen, and separate from any other setting. For a minor the answer comes from a guardian. Extracts are built from a mirror written ahead of time rather than from live athlete records, no group smaller than ten people is described in anything that leaves, and withdrawal removes the athlete from the mirror.

11. PAYING FOR FORGE

Paid plans are billed through the payment processor or app store shown at checkout, on the interval stated there, and renew until cancelled. Cancel through the same place you subscribed; app store purchases are managed and refunded under that store's rules, not by Forge. Prices can change with notice for future billing periods.

A payment made by a parent or guardian on a minor's behalf is also recorded as a verification step in the guardian consent process.

12. YOUR CONTENT

What you upload stays yours. You give Forge the permission it needs to store it, process it, and show it to the people described in section 4 so that the features work. Forge does not use athlete video or images for advertising or promotion. Use of an athlete's likeness is governed by the separate video and biometric consent.

Forge's own content -- programming, lessons, written material, and the software -- stays Forge's.

13. ACCEPTABLE USE

Do not use Forge to harass anyone, to upload content you have no right to upload, to reach data belonging to someone else, to disrupt the service, or to break the law. Do not attempt to re-identify an individual from any aggregated or de-identified figure Forge shows you.

14. ENDING IT

You can delete your account at any time, which removes it and the videos tied to it.

Forge may suspend or close an account that breaches these terms, and may discontinue features. Where a guardian withdraws consent, the athlete's account is held as described in section 3.

15. NO WARRANTY, AND LIMITS ON LIABILITY

Forge is provided as is. It may be unavailable, may contain errors, and its measurements may be inaccurate -- camera-derived figures in particular depend on filming conditions and are estimates, not instrument readings. To the fullest extent the law allows, Forge disclaims all warranties, express or implied, including fitness for a particular purpose.

To the fullest extent the law allows, Forge is not liable for indirect, incidental, or consequential damages, and its total liability arising out of your use of the service is limited to the amount you paid for it in the twelve months before the claim. Nothing here limits liability that cannot lawfully be limited, including for death or personal injury caused by negligence, or for fraud.

You accept the risks described in section 2 as risks of training, which exist independently of this software.

16. CHANGES

These terms can change. The current version is always the one shown at signup and available in the app, and the exact version you agreed to is recorded with the date you agreed to it, so you can always establish what you accepted and when.

Forge does not currently send a notice when these terms change. Rather than promise one it does not send, this says so: check this page for the current version. Continuing to use Forge means the current version applies.

17. GOVERNING LAW AND DISPUTES

This agreement, and any dispute arising out of it or out of your use of Forge, is governed by the laws of the State of Arizona, without regard to its conflict-of-laws provisions. The parties will first try to resolve any dispute by talking to each other. Anything not resolved that way lies in the state and federal courts located in Maricopa County, Arizona, and both sides consent to the jurisdiction of those courts. Nothing here waives a right that cannot lawfully be waived, including a right belonging to a person under 18.

18. CONTACT

Forge is operated by Forge Performance Systems LLC, 5145 North 7th Street, D-237, Phoenix, Arizona 85014.

Questions about these terms, a request about your data, or a request to withdraw a consent: forgeperformancesystems@outlook.com
