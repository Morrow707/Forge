# Forge — Incident Response & Breach Notification Plan

**Status:** Internal draft, not reviewed by counsel. The security *mechanics*
in this document (containment steps, what data lives where) are accurate to
the current codebase as of this writing. The legal parts — specifically
which breach-notification laws apply, notification deadlines, and exact
wording — are placeholders. Get a lawyer to review Section 5 before this
plan is relied on for a real incident, the same caveat every other legal
document in this codebase (`legalAgreement`, the draft ToS/Privacy Policy)
already carries.

---

## 1. Purpose

What to do, in order, if Forge's data is ever accessed, modified, or
exposed without authorization — a compromised account, a leaked database
credential, a dependency vulnerability being actively exploited, or an
athlete/coach reporting something that looks like a breach. The goal is to
contain it fast, understand what actually happened before saying anything
publicly, and meet whatever legal notification obligations apply — without
overreacting to a false alarm or underreacting to a real one.

## 2. Roles

Fill in real names/contacts before relying on this. A team of one still
benefits from writing the roles down — it's what you do in each role that
matters, not that a different person occupies each one.

| Role | Responsibility | Contact |
|---|---|---|
| Incident Commander | Owns the response end to end, decides severity, decides when it's over | *[fill in]* |
| Technical Lead | Investigates, contains, fixes | *[fill in]* |
| Communications Lead | Drafts and sends any user/parent/coach notification | *[fill in]* |
| Legal Contact | Confirms notification obligations before anything goes out | *[fill in — a real lawyer, not this document]* |

For a one- or two-person team, one person can hold multiple roles — the
point of the table is making sure nothing falls through a gap where
everyone assumed someone else was handling it.

## 3. Severity classification

| Severity | Definition | Examples in Forge's actual data model |
|---|---|---|
| **Critical** | Confirmed unauthorized access to athlete PII or video, especially a minor's (Tier 1/2 per `shared/privacy-tiers.ts`); admin account compromise; database credential leak | Someone other than the intended viewer accessed a signed video URL they shouldn't have; `DATABASE_URL` or `SESSION_SECRET`/`MEDIA_URL_SECRET` leaked; an admin account logged in from an unrecognized, unauthorized source |
| **High** | Vulnerability with a plausible exploitation path, not yet confirmed exploited | A dependency CVE like drizzle-orm's SQL-injection advisory (patched September 2026), before confirming it was ever actually triggered |
| **Medium** | Isolated account-level issue, contained to one user | A single athlete's/coach's password compromised via credential reuse elsewhere, no broader system issue |
| **Low** | Reported "problem" that turns out to be a bug, not a security issue | A `/api/report-problem` submission describing something that's actually a UI bug, not unauthorized access |

When in doubt, classify one level higher than feels comfortable. Downgrading
after investigation is easy; discovering three days in that something was
actually Critical is not.

## 4. Detection & initial triage

Realistic ways this app would actually surface an incident today:

- A `/api/report-problem` submission describing suspicious behavior (see
  `/admin/problem-reports`).
- A `npm audit` finding (now automated — see `.github/dependabot.yml`) for
  a dependency this app actually depends on in production, not just
  dev/build tooling.
- Unusual entries in `record_access_audit_logs` (currently: video access
  only — see its own schema comment for the honest scope of what's and
  isn't logged) or repeated 403s from `csrf-protection.ts`/rate limiters
  in Render's logs.
- A direct report — an athlete, parent, or coach noticing something wrong.
- Render/GitHub security notifications (Dependabot alerts, an unusual
  deploy, a failed auth spike).

On any signal that clears "Medium" or above:

1. **Don't panic-fix in production first.** A rushed change can destroy
   evidence of what actually happened or make containment harder.
2. Note the exact time, what was observed, and who reported it.
3. Assign an Incident Commander (Section 2) immediately, even informally.
4. Move to containment (Section 5) before full root-cause investigation —
   stop the bleeding, then understand it.

## 5. Containment — by scenario

### 5a. Compromised coach/admin account
1. From the Render Postgres console (or a one-off script using `storage`),
   force-expire the account's session: the session store is
   `connect-pg-simple`, keyed in the `session` table — deleting rows where
   `sess::json->>'passport'` references the user's ID logs them out
   everywhere immediately. (There's currently no "log out all devices"
   self-service button — see the security backlog note in this doc's
   Appendix.)
2. Reset their password (`storage.hashPassword` + direct DB update, or
   have them use the forgot-password flow once contained).
3. If MFA is enabled on the account, that's not enough on its own if the
   attacker had a live session — a live session bypasses MFA entirely
   until it's revoked per step 1.
4. If MFA is *not* enabled and this is a coach/admin account, this is the
   moment to require it before restoring access.
5. Check `record_access_audit_logs` for anything the account touched
   during the suspected compromise window.

### 5b. Leaked database credential (`DATABASE_URL`)
1. Rotate the Postgres credential immediately from the Render dashboard
   (Render supports credential rotation without downtime for a managed
   database — confirm current behavior in Render's dashboard before
   assuming).
2. Update `DATABASE_URL` in the Render service's environment and redeploy.
3. Audit recent query activity if Render/Postgres logs are available for
   the affected window.

### 5c. Leaked `SESSION_SECRET` or `MEDIA_URL_SECRET`
1. Rotate the affected secret in Render's dashboard (both are
   `generateValue: true` in `render.yaml` — Render can regenerate them).
2. `SESSION_SECRET` rotation invalidates every existing session
   fleet-wide (cookies signed with the old secret stop verifying) — this
   is a feature here, not a side effect: it force-logs-out anyone,
   attacker included.
3. `MEDIA_URL_SECRET` rotation invalidates every currently-outstanding
   signed video URL (they were already short-lived, ≤6 hours, by design —
   see `media-url-signing.ts`).

### 5d. Actively-exploited dependency vulnerability
1. Check whether the vulnerable package is an actual production runtime
   dependency (imported by server code that runs against real requests)
   or dev/build tooling only (drizzle-kit, esbuild, Capacitor's iOS/Android
   build tools) — the same distinction made when the drizzle-orm advisory
   was patched. Runtime dependencies are the ones that can be actively
   exploited against the live app.
2. Patch and redeploy immediately for a runtime dependency; dev-tooling
   vulnerabilities are real but not this urgent.
3. If a patch isn't available yet, check whether the vulnerable code path
   is actually reachable in this app's usage of the library before
   deciding whether to take the service down entirely — an unreachable
   code path doesn't require an outage to be safe.

### 5e. Video/media exposure
1. Confirm which directory: `form-videos`/`skill-videos`/`annotations`/
   `problem-reports` are signed-URL gated (see `media-url-signing.ts`);
   `lesson-videos`/`lesson-attachments`/`lesson-images`/`team-logos` are
   intentionally public and not a breach on their own.
2. For a gated directory, a genuine exposure means either the signing
   secret leaked (see 5c) or an application bug bypassed the check —
   patch the bug, rotate `MEDIA_URL_SECRET` regardless as a precaution.

## 6. Investigation

Once contained, before notifying anyone:

- What data was actually accessible, not just what was technically
  exposed — a leaked signed URL to one video is not the same incident as
  a leaked database credential.
- How many users/athletes affected, and — critically for this app — how
  many are Tier 1/2 minors (`derivePrivacyTier` in
  `shared/privacy-tiers.ts`). Minor-specific data triggers different, and
  generally stricter, notification obligations in most states.
- Time window: when did exposure start, when was it contained.
- Root cause: a specific bug, a leaked credential, a social-engineering
  attack, etc. — needed both for the fix and for an honest notification.

## 7. Notification — placeholder, needs legal review

**Do not send any external notification without Legal Contact sign-off
(Section 2).** What follows is a starting structure, not settled law:

- Forge is not a HIPAA-covered entity (see the healthcare-provider notice
  in the live `legalAgreement` text) — HIPAA's 60-day breach notification
  rule does not apply.
- Most U.S. states have their own breach notification statutes, varying
  by state, with different triggers (what counts as "personal
  information" needing notification), different deadlines (some are
  "without unreasonable delay," some have hard day counts), and some with
  specific provisions for minors' data. Which states' laws apply depends
  on where affected users actually live, not where Forge is based — this
  needs real legal review against every state Forge has real users in
  (this is the exact same caveat `shared/privacy-tiers.ts`'s own header
  comment already carries for COPPA/BIPA).
- If any affected user is a minor, consider proactive notification to
  parents/guardians/coaches even where not strictly legally required —
  the trust cost of staying silent is higher than the cost of an
  over-cautious notice, and this is consistent with the "flag,
  don't hide" philosophy the rest of this app already follows
  (`GUARDIAN_NOTICE_LIVE`, the healthcare-provider transparency notice).

### Draft notification template (fill in specifics before sending; get Legal sign-off first)

> Subject: Important security notice about your Forge account
>
> On [date], we discovered [brief, accurate description of what happened].
> We [contained it / fixed it] on [date]. Based on our investigation,
> [specific data type — e.g. "your name and video from a form-check
> submission"] [was / was not] accessible to [an unauthorized party /
> the public] between [start] and [end].
>
> We have [specific remediation — e.g. "rotated the credential involved
> and reviewed related access logs"]. We recommend you [specific action if
> any — e.g. "change your password" / "enable two-factor authentication"].
>
> If you have questions, contact us at [contact].

## 8. Post-incident review

Within a week of closing any Medium-or-above incident:

- What happened, in plain language.
- What worked in the response, what didn't.
- What concrete code/process change prevents this exact incident from
  recurring — write it down and actually schedule it, not just note it.
- Update this document if the response process itself needs to change.

## Appendix: known gaps this plan currently has to work around

Honest, as of this writing — update as these get built:

- **No self-service "log out all other devices."** Section 5a's session
  containment currently requires a direct database action, not a button
  in the app. Worth building.
- **Audit logging covers video access only** (`record_access_audit_logs` —
  see its own schema comment). Broader admin-action logging (who viewed
  which athlete's profile, not just their video) doesn't exist yet.
- **No automated anomaly/new-device login detection.** Detection today is
  reactive (a report, a Dependabot alert), not proactive (no "new login
  from an unrecognized location" notice to the user).
