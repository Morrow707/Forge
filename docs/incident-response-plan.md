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

**Revoking a session takes TWO actions, not one.** This app has two
independent ways to be logged in and they are revoked through different
tables. Doing only the first leaves an attacker signed in on the iOS app for
up to 30 days.

| How they're logged in | Where it lives | How it's revoked |
|---|---|---|
| Web browser (cookie) | `session` table (`connect-pg-simple`) | Delete the row |
| iOS app (bearer token) | `user_sessions` row, checked on every request | Set `revoked_at` |

An earlier version of this section said deleting `session` rows "logs them
out everywhere immediately." It does not. The native token is an HMAC that
carries a `user_sessions` id and is checked against that row's `revoked_at`
on every request (`attachNativeTokenAuth` in `server/auth.ts`) — it does not
appear in the `session` table at all, so nothing you do there touches it.

1. Revoke every session on the account, both kinds:

   ```sql
   -- Native/iOS: this is the one the old instructions missed.
   UPDATE user_sessions SET revoked_at = now()
    WHERE user_id = $1 AND revoked_at IS NULL;

   -- Web: connect-pg-simple's own store.
   DELETE FROM "session"
    WHERE sess::json->'passport'->>'user' = $1::text;
   ```

   The app already does both together in `storage.revokeAllOtherSessions`
   and `storage.revokeSession`, which is what `/api/auth/sessions/revoke-others`
   calls. Those routes are self-service only (`requireAuth`, and scoped to
   the caller's own sessions), so they are what you tell a *user* to press;
   they are not reachable for someone else's compromised account, which is
   why the SQL above is here. See the Appendix — an admin-facing revoke for
   another user's account does not exist and is worth building.

2. Reset their password (`hashPassword` from `server/auth-utils.ts` — note
   it is NOT on `storage`, which an earlier version of this document said —
   plus a direct DB update, or have them use the forgot-password flow once
   contained). Changing the password also deletes any outstanding password
   reset tokens (`storage.updateUserPasswordHash`), so a reset link the
   attacker may already hold stops working.
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

## 9. Recovery from data loss

Sections 5 and 6 cover containment and investigation -- rotating a leaked
credential, invalidating sessions, working out what was reached. They do not
cover getting the data back, which is the other half of an incident and was
missing from this plan entirely until 2026-09-06.

**Two stores. A database backup covers one of them.**

| Store | What is in it | Defined in |
|---|---|---|
| `forge-db` (Postgres) | Every account, program, workout log, and the URL of every video | `render.yaml` -> `databases` |
| `forge-uploads` (10GB disk) | The video and annotation FILES themselves | `render.yaml` -> `disk` |

Restoring the database alone leaves every athlete's video bank pointing at
files that are not there. The two have to be restored together.

**Nothing in this repo deletes recoverably.** `deleteUploadedFile` in
`server/uploaded-files.ts` is `fs.unlink` -- no trash, no soft delete, no
tombstone. The data-retention job (`server/data-retention-job.ts`) removes
minors' videos permanently on a schedule, and the storage-cap sweep does the
same when an athlete exceeds their video allowance. Both are working as
designed. Neither is reversible without a backup.

### Taking a backup

    DATABASE_URL=postgres://... ./scripts/backup.sh /path/to/output /path/to/uploads

Run it from somewhere that is not the production host. A backup written to the
disk it is backing up shares that disk's failure and is a copy, not a backup.
The script refuses to call a dump a backup unless it can read table data back
out of it.

### Restoring

    ./scripts/restore.sh <dump-file> <target-database-url>

It refuses to restore over a database that already has tables unless you pass
`--i-know-this-destroys-the-target`, because a restore script that can clobber
production on a mistyped argument is a worse risk than the missing backups it
was written to fix. Then untar the uploads archive into the service's uploads
mount.

### This procedure has actually been run

Not just written down. On 2026-09-06, against a real Postgres 16 with the full
schema and seed data: 118 tables, 9 users, 413 exercises. Backed up, the
database dropped outright, then restored from the dump.

Everything came back: 118 tables, 9 users, 413 exercises, plus 169 foreign
keys, 309 indexes and 45 enum types -- the structure a data-only dump loses
silently. `npm run db:check-drift` was then run against the restored database
and reported no drift, which is the app's own definition of a schema it can
run on. The uploads archive round-tripped with file contents intact.

What that does NOT prove is the part only the Render dashboard can answer:
whether Render's own managed backups of `forge-db` exist, are running, and
are restorable, and whether the uploads disk is snapshotted at all. A backup
nobody has restored from is a hypothesis. Confirm both, and restore one into
a scratch database once, before relying on either.

## Appendix: known gaps this plan currently has to work around

Honest, as of this writing — update as these get built:

- **No ADMIN-facing session revocation for someone else's account.** The
  self-service version exists and works correctly — `/api/auth/sessions/revoke-others`
  and `/api/auth/sessions/:id/revoke` both revoke the native session and
  delete the web session row together. What is missing is a way for an
  incident responder to do that to a *compromised* account they cannot log
  in as, which is exactly the case Section 5a is about, and why that section
  still hands you SQL. Worth building.
- **Audit logging covers video access only** (`record_access_audit_logs` —
  see its own schema comment). Broader admin-action logging (who viewed
  which athlete's profile, not just their video) doesn't exist yet.
- **Anomaly detection is partial, not absent.** New-device login notices DO
  exist: `trackNewSession` compares against the account's known sessions and
  `server/new-device-login-email.ts` emails the user when it sees an
  unrecognised one. What is still missing is anything watching for a pattern
  across accounts — a credential-stuffing spike, an unusual volume of 403s —
  which is still only visible by reading Render's logs by hand.
- **Render's own backups are unverified.** Section 9 gives a backup/restore
  procedure that has been run end to end against this schema, but nothing has
  ever been restored from Render's managed backups of `forge-db`, and whether
  the `forge-uploads` disk is snapshotted at all is unconfirmed. Until someone
  restores one, the recovery story for a real production loss is untested.
- **No scheduled off-host backup.** `scripts/backup.sh` exists and works;
  nothing runs it automatically, and there is no off-host destination
  configured for its output.
