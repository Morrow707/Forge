# The eight audit accounts, and the two switches that decide what they can see

Written 2026-10-08 for the launch checklist's section 05, which says "One account per role, made
fresh" and lists them in a sentence. This is that sentence as an ordered recipe, plus the things
that will otherwise cost an evening. Read the two switches below BEFORE making anything: one of
them decides whether half the audit rows can run at all.

Everything here was read off the code at `f4f4533c`, not remembered. Where a screen is named it is
the screen that exists.

---

## 2026-10-11: the first set was made, used and PURGED. The next set needs the same recipe.

The nine accounts below were made on production on 2026-10-10 (`scott.morrow+coach@live.com`,
`+coach2`, `+staff`, `+athlete`, `+fa1`, `+fa2`, `+fa3`, `+minor`; `+guardian` was never claimed)
and every one of them is gone as of the 2026-10-11 deploy, on Scott's word: "Delete all accounts
that you created, there are emails that were added through the beta that belong to people keep
those, purge every inch of data that belongs to all of your generated beta accounts." Two went
through the real delete path by hand on 10-10 (`+coach2`, `+fa1`); the other seven through
`RETIRED_AUDIT_ACCOUNT_EMAILS` in `server/seed.ts`, which hands each to `deleteUserRecord` -- the
same cascade and file cleanup an account's own deletion takes, now including the branding logo the
audit coach had uploaded (that was a gap: `users.brandLogoUrl` and `teams.brandLogoUrl` files
outlived a coach's row, in the one upload directory that is public by URL). Every program,
assignment, logged day, waiver, nutrition row, team and consent record they made cascaded with
them. The real beta accounts (made in August and September by people) were not touched.

**The list is guarded by creation date** (`AUDIT_ACCOUNTS_PURGED_AT`): an account signed up under
one of those addresses after 2026-10-11 01:00 UTC is a new account and is left alone, so the next
audit pass can reuse the same plus-tags. Rows on the checklist that still need an account per role
(the device email, the three tiers, the under-13 claim) are made fresh from the recipe below.

---

## Read first: it is eight accounts, not six, and one of them is not a signup

The checklist's sentence lists: "Admin (yours), a primary coach with a school plan, a staff coach
joined by invite code, a coached athlete on that roster, a Free Agent on each of the three tiers,
a guardian claiming an under-13 athlete."

That is **eight accounts plus one child account**:

| # | Role | How it is made |
|---|---|---|
| 1 | Admin | Yours, exists |
| 2 | Primary coach | Signup, role coach, with a headcount |
| 3 | Staff coach | Signup, role coach, with #2's staff invite code |
| 4 | Coached athlete | Signup, role athlete, with #2's coach code |
| 5 | Free Agent — Basic | Signup, role athlete, no coach code |
| 6 | Free Agent — AI Coach | Signup, role athlete, no coach code |
| 7 | Free Agent — AI Coach + Video | Signup, role athlete, no coach code |
| 8 | Under-13 athlete | Signup, role athlete, DOB under 13, guardian email |
| — | Guardian | **Not a signup.** Created by claiming #8 from the emailed link |

The guardian account comes into existence through the claim, so it cannot be made first and does
not need its own signup. That is why the count reads as six or seven if you count signups and
eight or nine if you count accounts.

---

## Switch 1: `BILLING_LIVE` is why a tier shows nothing, and it is NOT `isBetaAccount`

**This is the one that changes the audit.** Four rows tell you to flip `isBetaAccount` off to see
a gate — B6 ("Beta accounts are comped, so check with `isBetaAccount` off on each"), D1, D9 and
F2. For a **coach** that is right. For a **Free Agent** it was wrong, and the reason is that the
two sides of the app read opposite switches:

- **Coach** (`getEntitlements`, `server/billing.ts`): `!ENFORCEMENT_ENABLED || isBetaAccount ||
  trialActive` → everything unlocked. So with `BILLING_ENFORCEMENT_ENABLED` unset, which is
  today, flipping `isBetaAccount` off on one coach changes **nothing** — the global switch
  short-circuits first. To see a coach gate you need `BILLING_ENFORCEMENT_ENABLED=true` on Render
  **and** `isBetaAccount=false` on that account.
- **Free Agent** (`hasAthletePaidForAiAccess`, `server/routes.ts`): never consulted
  `isBetaAccount` at all. It asked `BILLING_LIVE`, and with it off it returned **false for every
  Free Agent** — no camera, no skills, no AI chat, whatever tier they held — except the one
  hardcoded `freeagent@forge.app`.

**That second one was a bug and is fixed as of 2026-10-08.** A tier that an admin assigned, or
that a verified purchase wrote, is now honoured whether or not `BILLING_LIVE` is on. Nothing
writes `users.freeAgentTier` but those two things (signup never does — checked), so no account
that has neither sees any change. Proven by
`server/a-purchased-tier-is-honoured-before-launch.itest.ts`.

What that means for you:

- **Accounts 5, 6 and 7 work now**, by assigning the tier on `/admin/billing`. Row B6 is runnable
  before launch day. It was not before.
- **Do not set `BILLING_LIVE=true` to run the audit.** It also opens every web checkout
  (`chargingClosed` returns null when it is true) against Stripe prices that are real and on
  Render. It is a launch-day switch and the checklist is right to put it in section 03.
- **The coach-side rows (D9, F2's coach half) still need the global enforcement switch**, so they
  genuinely belong on launch day or on a throwaway deploy. Say so rather than chasing them.

## Switch 2: the invite code gates every signup

`PUBLIC_SIGNUPS_OPEN=false` is set, so `POST /api/auth/signup` returns 403 `signupClosed: true`
without a valid `inviteCode`. Two ways to carry it:

- `https://forgeperformancesystems.com/signup?invite=CODE` — the link opens the real form, and the
  code is kept in sessionStorage so the rest of that browser session is open too. **Use this.**
- Or type it into the coming-soon card on `/signup`.

The code is `SIGNUP_INVITE_CODE` on Render, matched case-insensitively and trimmed, and is never
stored on the account.

---

## What every signup asks for

One rule for all of them, from `shared/password-rules.ts`: **six characters, a number, and a
special character** (anything not a letter or digit). The screen draws a live red-to-green
checklist. Login is deliberately exempt, so an older password still signs in.

Every signup needs a **real date of birth** — it is what derives the privacy tier before the
account exists. An athlete also needs sport, position, height and body weight.

**Height is not optional in practice.** `shared/schema.ts` says it plainly: camera calibration
hard-requires a real height, and without one on file *every tracked mode silently produces
nothing*. An athlete made without a height will film a set in section C and get no numbers, and
it will read as a camera bug. Put a real height on accounts 4 through 8.

### Use one inbox for all eight

Forge stores the email address literally — there is no normalization and nothing strips a `+`
(checked). So `scott+coach@…`, `scott+staff@…`, `scott+athlete@…` and so on are eight **distinct
accounts** that all deliver to your one inbox. You need the inbox reachable for the claim links,
the invite emails and the new-device approval in row B7, and this is the cheapest way to have
eight reachable addresses.

Signup itself never sends a device email — the account is created on its first trusted device, so
the gate is not met until you sign in from a **second** browser, which is exactly what B7 tests.

---

## The order, and why it is this order

Each account depends on the one before it, so this sequence has no backtracking.

**1. Primary coach (#2).** `/signup?invite=CODE`, role coach, type an athlete count. The count
*is* the plan — it sets `billingTier` from `bandForAthleteCount` and is what makes the
Institutional Service Agreement offered with no admin step. Check `/coach/billing` shows planned,
roster and billed band. This account is row B2 and it audits itself.

**2. Staff coach (#3).** First, as #2, open the **Coaching Staff** dialog from the app shell menu
and copy the staff invite code. Then sign up #3 with the invite code, tick "I'm joining a program
that's already on Forge", and paste the staff code. The account gets **no plan of its own** — that
is the correct outcome, not a bug. This is row B3. Afterwards, assign #3 exactly one team from the
roster page and confirm their roster narrows by list *and by URL* — that is row E2, and a scoping
bug in exactly that area was found and fixed on 2026-10-06, so it is worth re-walking.

**3. Coached athlete (#4).** Sign up with **#2's coach code** (not the staff code — different
credential). They land on a dashboard with the coach's program. This is row B4.

There are two other ways a coach gets an athlete, and both are real screens worth touching once:
the roster page's **Add Free Agent**, which emails an invite to an athlete account that already
exists and waits for them to accept; and **Import Player Intake Sheet**, which photographs a
printed intake sheet, creates provisional slots and gives each a claim code the athlete redeems
at `/claim/:code`. Neither is needed to make account #4.

**4. The three Free Agents (#5, #6, #7).** Sign up three athletes with **no coach code** — an
athlete on nobody's roster is a Free Agent by definition. Then, as admin, open `/admin/billing`,
find each one, set the **tier** from the Select and leave the **Beta account** checkbox
*unchecked*. Then check each sees exactly its tier:

| Tier | AI chat | Camera | Skills |
|---|---|---|---|
| Basic | no | no | no |
| AI Coach | yes | no | no |
| AI Coach + Video | yes | yes | yes |

The quickest confirmation is three URLs per account: `/api/athlete/entitlements`,
`/api/athlete/camera-access` and `/api/athlete/skills-access`. The camera answer carries a
`reason`, and for these it must read `entitled` or `tier_excludes_camera` — if it says
`coached_athlete` then the account is on somebody's roster and the tier is not what is being
tested.

**5. The under-13 (#8) and the guardian.** `ACCEPT_UNDER_13_SIGNUPS` is unset, which means
under-13 self-signup is **accepted** (the account is created inert until a guardian claims it) —
so the simplest path is a normal signup with a DOB under 13 and a guardian email. The guardian is
emailed automatically (`issueGuardianInviteIfNeeded`), claims from the link, and **that claim is
what creates the guardian account**.

Then the under-13 specifics, which are row B5: the account is **held** after the claim until a
linked guardian's card is charged 50 cents and refunded, and it is the **Stripe webhook** that
writes the record — so a Stripe outage holds a child's account and never releases one, by design.
The guardian dashboard then shows the biometric consent card, and giving it is what unlocks the
child's camera button.

The coach-provisioned route to the same place (Import Player Intake Sheet, guardian emailed, same
hold) is a different consent story and is not affected by `ACCEPT_UNDER_13_SIGNUPS`. Worth doing
once if you want row B5 exactly as written; the self-signup path exercises the same hold.

---

## Two things to do once the eight exist

**Confirm the device gate covers them.** Sign in to one of the eight from a second browser: the
email should name the device and location, carry **one** button to a review page, and the page has
the two choices. Nobody is exempt in code any more: the three seeded demo accounts that were
(`coach@forge.app`, `athlete@forge.app`, `freeagent@forge.app`) were retired and deleted on
2026-10-11, and `DEMO_ACCOUNT_EMAILS` is an empty list; only `DEVICE_VERIFICATION_EXEMPT_EMAILS`
on Render can exempt an address now.

**Do the Terms re-acceptance row (B9) last, and warn every tester first.** Editing the live
agreement re-asks the whole platform, every adult meets a non-dismissable dialog once, and putting
the text back re-asks again. That is the designed cost of changing a contract, not a bug, and it
is why this row goes after everything else.
