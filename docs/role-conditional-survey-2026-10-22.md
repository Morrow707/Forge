# The role-conditional survey, 2026-10-22

Scott asked whether the four "profiles" — free agent, athlete, coach, admin — should each get
their own profile settings, calendar settings and so on, the way `shared/camera-tunables-by-lift.ts`
gives each filmable thing its own numbers:

> "if I want to adjust the admin profile, I don't want it to change the free agents profile
> settings. Does that work? We aren't 'calibrating' anything, but would it be better to keep it
> the same? We do have some separation, but… don't build anything what are your thoughts"

He then asked for the full survey before deciding. This is what it found. **The short answer is
no, and his own instinct — "we aren't calibrating anything" — is the reason.**

## Method

Seven slices by FILE OWNERSHIP (CLAUDE.md's rule, never by task), each a reader classifying every
role conditional in its slice; the risky findings from each slice then verified by **two distinct
adversarial lenses** (does the code really do this / can a real account really get here), and a
completeness critic asked only what the survey missed. 22 agents, 0 errors.

The two-lens split matters and was chosen deliberately: a role-conditional finding can be wrong
by misreading control flow OR by being unreachable, and redundancy catches only the first. A
finding survived only if **neither** lens refuted it — the strict direction, because CLAUDE.md
already records an audit panel that reported a finding against the wrong route.

The fleet was kept to 22 on purpose. The 2026-10-15 add-on audit lost 29 of 63 agents to a
session limit **including its completeness critic**, which made the whole run unreliable; batching
verification per slice rather than per finding is the shape that ran clean on 2026-10-20.

## What is actually there

**260** explicit role comparisons (client + server + shared, tests excluded), plus ~80 derived
booleans and ~697 `requireRole(...)` gates. Five files hold 173 of the 260: `app-shell.tsx` 46,
`storage.ts` 36, `routes.ts` 32, `signup.tsx` 30, `auth.ts` 29.

194 were classified in detail:

| outcome for a role the conditional does NOT name | count |
|---|---|
| **correctly inert** — an athlete has no roster; refusing is the point | **143 (74%)** |
| visibly degraded | 24 |
| **silently wrong** | **17** |
| unreachable | 10 |

| category | count |
|---|---|
| permission_gate | 73 |
| data_shape | 46 |
| profile_semantics | 27 |
| navigation | 20 |
| copy_display | 16 |
| onboarding | 11 |

**Three quarters of the branching is doing its job.** The concentration is in permission gates and
data shape, not in profile settings.

## Why four profile records is the wrong answer

**1. Two of the four are not what they look like.** `shared/schema.ts:88` is
`pgEnum("role", ["coach", "athlete", "admin", "guardian"])`. Three slices found this
independently.

- **"Free agent" is not a role.** It is `role === "athlete" && coaches.length === 0`, recomputed
  per request (`use-is-free-agent.ts`, `requireFreeAgent` at `routes.ts:880`). So a profile record
  keyed on it would be keyed on a **live derived state**: an athlete who joins a program would
  switch which record they read, mid-account, and their height would appear to change because
  they now read the "athlete" record instead of the "free agent" one. No migration, no event,
  nothing logged — the class of bug this repo has paid for six times, newly introduced by the fix.
- **"Guardian" IS a role**, with its own dashboard and its own profile surface
  (`guardian-dashboard.tsx` renders `AccountSettingsDialog`), and it was missing from the four.

**2. The separation already exists, 446 times, in the gates.** `requireRole` distribution:
**284 `"coach"`, 162 `"admin"`, 154 `"athlete"`, 14 `["athlete","coach","admin"]`,
5 `["coach","admin"]`, 2 `"guardian"`**, plus 95 `ProtectedRoute` declarations in `App.tsx` each
naming exactly one role (37 admin / 29 coach / 28 athlete / 1 guardian).

> Coach and admin are not two settings of one surface — they are 446 disjoint gates. Giving an
> admin a coach capability is 284 edits, not a set-membership change.

**3. Nothing here is fitted.** CLAUDE.md's own test for a split is "is this a NUMBER somebody
could fit from one take?" Height is typed by a person. There is no measurement, so no drift, so
nothing to leak. The camera registry exists for a failure mode that profiles do not have.

**4. Four copies would multiply the legal surface by four.** Profile surfaces carry consent:
biometric release, research consent, the terms snapshot, `trackingOptOut`, the guardian link, date
of birth gating under-13. This repo has a legal surface failing silently **five** times on record.
Four independent implementations means the next consent fix lands on one and misses three. A wrong
camera number produces a caveated number; a wrong consent flag produces unlawful collection from a
child.

**5. The camera registry's own cost is measurable.** 270 records shipped 2026-10-06; the
2026-10-20 provenance audit found `cameraTunablesFor` was read by **1 of 15 trackers**, and
`FITTED_OVERRIDES` has never held a value. Two weeks to discover it was mostly unwired, for a
problem that genuinely needed the shape.

**And the separation that DOES exist in the profile code is per-ACTION, which is the better axis.**
Three `heightIn` validators: `signupSchema` `min(1)`, `claimProvisionalAthleteSchema` `min(1)`,
`updateProfileSchema` `min(0).nullable()`. That is earned — signup must REQUIRE what a later edit
may CLEAR. `min(0)` is benign: `!heightIn || heightIn <= 0` is guarded in six places in the camera
code, so 0 reads as "no height", fail-closed. And `updateProfileSchema` is ONE role-agnostic write
path whose own comment says it "can edit nobody else's row whatever the caller's role" — already
the right shape. Four roles × three actions would be twelve validators for a field nobody measures.

## The live defect, which no amount of role-conditional reading could find

Found by the completeness critic, then verified link by link by hand before anything moved.

```
server/auth.ts:269   export function toPublicUser(user)            → bare row, ZERO flags
server/auth.ts:294   async function toPublicUserWithSections(user) → 12 flags, NOT exported
```

`routes.ts` called the flag-free one **7 times** and never referenced the sections serializer.
`auth.ts` uses the sections serializer at 8 sites, so every wholesale client cache replace that
hits an `auth.ts` route is fine — the biometric dialog, the claim pages, the DOB banner. Three of
`routes.ts`'s seven were paired with a client write that **replaces wholesale**:

| route | client site |
|---|---|
| `PATCH /api/athlete/profile` | `edit-my-profile-dialog.tsx:85` |
| `PATCH /api/notification-prefs` | `notification-settings-dialog.tsx:196` |
| `PATCH /api/notification-prefs/push-categories` | `notification-settings-dialog.tsx:179` |

**A coach or admin opens Edit My Profile, types their height, saves — and the response unsets
`biometricReleaseRequired`.** The workout screen stops asking for the release, the capture gate
goes on dropping their traces, nothing logs it. The recovery path built for bug #2 of 2026-10-19
re-armed bug #1 of the same day. `isPrimaryCoach` rode the same write, so a primary coach who
saved a notification preference read "ask your primary coach" on billing and Coaches Corner until
a refetch, and `hiddenSections` stopped hiding — the exact failure `auth.ts:281-293` warns about
in words.

**There is no role comparison anywhere in the mechanism**, which is why seven slices of `role ===`
greps were structurally blind. Two things made it undetectable: the twelve flags are declared
**optional** on `PublicUser` (legitimately — most do not apply to most roles), so "not applicable
to you" and "not computed on this response" are the same value; and the one test over these
serializers asserted what must be **stripped** and was blind to what must be **attached**.

### What shipped for it

Six routes now use the sections serializer — the survey named three, three more had the same
defect. The seventh, `PATCH /api/coach/roster/:athleteId/profile`, is deliberately left flag-free:
it returns the **athlete's** row to a coach, where the flags are meaningless to the reader and a
leak of that athlete's consent state. Its response body is discarded anyway
(`athlete-profile-dialog.tsx`'s `onSuccess` takes no argument).

`server/every-self-response-carries-the-flags.test.ts` discovers every `toPublicUser(` in
routes.ts and holds each to one of two readings — carries the flags, or is justified as another
person's row with a reason over eighty characters. **A rule about whose row it is, not an
exception list**, because a list rots and this one would rot toward the bug.

## What else shipped

- **Both client hooks** (`use-camera-access`, `use-skills-access`) read
  `ROLES_THAT_FILM_THEIR_OWN_TRAINING` instead of re-typing `["athlete","coach","admin"]`. A
  divergence there is **silent** — the hook decides whether to ASK the server, so a dropped role
  never reaches the resolver and reads as an ordinary refusal.
- **The 14 `requireRole([...])` gates are NOT rewritten, and that is a decision.** `requireRole`
  is typed against the `Role` union, so passing a `ReadonlySet<string>` would lose the compiler's
  check on a permission gate to gain cosmetics, and a divergence there is **loud** (a 403).
  `server/the-filming-roles-are-one-set.test.ts` holds them equal instead.
- **Left alone on purpose:** `admin/users.tsx:332` and `routes.ts:9574`'s `z.enum` name the same
  three strings and answer a different question — which roles an ADMIN may ASSIGN. Consolidating
  them onto the filming set would couple two unrelated decisions. The test asserts they stay
  separate, so a future "tidy-up" fails and says why.
- **`shared/home-route-by-role.ts`** replaces two hand-written four-way chains (an if-chain in
  `App.tsx`, a nested ternary in `login.tsx`), each with a trailing `return "/athlete"` that
  silently absorbed any role it had not been told about. Exhaustive `Record`, held equal to the
  pgEnum by a test; the module itself stays schema-free so the client can read it.
- **The signup height discard.** `heightIn: role === "athlete" ? heightIn : null` threw away a
  height a coach or admin supplied. The **requirement** stays athlete-only — a coach is not
  blocked for want of a height they may never film with — and whether the coach FORM should ask is
  a product decision about acquisition friction, left open. Latent until then, since
  `signup.tsx:232` strips it client-side too.
- **An empty profile patch is a read.** `updateUserProfile` had no guard, and
  `db.update().set({})` throws "No values to set" past the handler and HANGS the request —
  identical to `updateCoachBranding` on 2026-10-11. Unreachable from the dialog, which always
  resends the full set, which is why it sat undetected.

## Still open, with the reasons

**Nine silently-wrong findings survived both lenses and are NOT fixed.** Two were (`auth.ts:777`
the height discard; `routes.ts:9317`'s downstream helper is the `documents.tsx` one below). The
rest, worst first:

| at | what |
|---|---|
| `storage.ts:4940` | `deleteUserRecord`'s athlete branch is the ONLY caller of `deleteAthleteTraceDir` and the only path that deletes `formCheckVideoUrl`. A coach or admin who filmed their own training and then deletes their account leaves files behind. |
| `storage.ts:32833` | `sweepVideoRetentionCap` builds its per-athlete cap from an athlete-only query, so a coach's or admin's own clips are exempt from the cap the $9.99 add-on raises. |
| `storage.ts:33045` | The stale-account video purge is scoped `role = 'athlete'` in SQL, so a coach or admin who filmed and stopped using Forge is never swept. |
| `storage.ts:4292`, `:7850` | Two ABSENCES: the coach-code lookup has no role check where its twin `joinCoachStaffByCode` does, and `athleteHasCoach` — the definition of "has a coach" for the whole platform — is role-blind. |
| `storage.ts:11832` | "Forge-official" inferred from admin ownership where `exercises.isForgeOfficial` is now an explicit column; the comment is stale. |
| `documents.tsx:158` + `shared/required-documents.ts:132` | `documentAudienceFor` is `if (coach\|\|admin) return "coach"; return hasCoach ? …`, and `DocumentAudience` has three values — so a **guardian** opening `/documents` (an `AuthedRoute`, open to every signed-in role) is served the athlete checklist. The call site at `routes.ts:9317` is the right shape; the helper is not. |

The three `storage.ts` camera-retention ones are one job and want `ROLES_THAT_FILM_THEIR_OWN_TRAINING`
at all three sites; they were left because each changes what gets DELETED, and a deletion change
wants its own commit, its own itest and a deliberate read rather than riding along.

**The critic also named 17 files no slice reported on**, including `account-settings-dialog.tsx`
(app-shell reported the mount; nobody read the body, where research consent is athlete-only at
`:255`), `coach/branding.tsx` (18 derived booleans), and **`debug-console.tsx:80`**, which deserves
its own decision: the camera is granted to {athlete, coach, admin} and the only on-phone diagnostic
readout — what CLAUDE.md calls "the only instrument" — is **admin-only**. A coach filming their own
training cannot see a save outcome.

**And search forms the greps could not see:** role interpolated into a URL rather than compared (9
sites — a role that picks an endpoint is a role conditional whose failure is a 403);
`shared/notification-categories.ts`, which excludes admin and guardian in a **function signature**
rather than a branch; `notInArray(users.role, [...])` in SQL; and `App.tsx:270`, the one place a
guardian LINK substitutes for the guardian ROLE, which two slices described as a plain equality.

## The suggested named sets, by how many sites want them

12 want `ROLES_THAT_FILM_THEIR_OWN_TRAINING` (which already exists); then
`ROLES_THAT_TRAIN_ON_THE_PLATFORM` (4), `HOME_ROUTE_BY_ROLE` (3, shipped),
`ROLES_ELIGIBLE_FOR_THE_RESEARCH_MIRROR` (3), and singles for notification preferences, two-factor,
the notification inbox, the document checklist, App Store purchasing, and
`ROLES_WHOSE_IDENTITY_IS_WITHHELD_FROM_ADMINS`.

Two findings are about something else and worth keeping: `subscriptions.accountType` is a comment
where it should be a pgEnum, and `useIsFreeAgent` returning a boolean means a caller can read "not
a free agent" as "has a coach" — a three-state (`free_agent` / `coached` / `not_an_athlete` /
undefined) would make that impossible to get wrong.
