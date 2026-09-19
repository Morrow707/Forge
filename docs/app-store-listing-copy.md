# App Store listing copy: the camera-accuracy disclosure

Forge is launching with the camera pipeline **recording correctly** and its
**derived metrics uncalibrated** (see `docs/camera-tracking-notes.md` for what
has actually been validated and what has not). The in-app disclosure ships in
`shared/camera-accuracy-copy.ts` and is rendered on the price list, the landing
page, both checkout grids, the workout page and coach analytics.

The App Store listing is the one surface that code cannot reach.
`docs/app-store-launch-notes.md` already records that it is manual, done
directly in App Store Connect. This file holds the copy so it is reviewed and
versioned like everything else, instead of being pasted from memory.

## Why this matters more than an ordinary caveat

The $19.99 tier is `ai_coach_video`, and `hasVideoFormCheck` is its **entire**
differentiator over the $9.99 tier (`shared/free-agent-tiers.ts`). The extra ten
dollars buys exactly the thing that is currently degraded. A buyer reading the
store listing has no other way to learn that before paying.

There is also an App Review angle: a paid feature that is openly described as
limited is a much safer submission than one a reviewer discovers is degraded.

---

## 1. Promotional text  — *update this first*

Promotional text can be changed at any time **without submitting a new build**,
which the description cannot. If only one thing gets updated today, make it this
one.

> Camera tracking is in active calibration: Forge records and saves your video
> normally, but the metrics calculated from it are not accurate yet. Form review
> works today; the numbers are still being tuned.

## 2. App description — paragraph to insert

Deliberately written as an insert rather than a rewrite: the live description is
in App Store Connect and is not in this repo, so replacing it wholesale from
here risks contradicting copy that is working. Place this directly after
whatever paragraph introduces camera tracking or AI form check.

> **A note on camera tracking.** Forge films your sets and stores them for
> review, skeleton replay and coach annotation — that all works today. The
> numbers the app calculates from that video — bar speed, range of motion,
> power, jump height and bar path — are **not accurate yet**. We are actively
> calibrating them against instrumented reference equipment, and until that work
> is finished those readings should not be used to make training decisions.
> Everything else — programming, logging, the AI coach, analytics built on your
> logged sets — is unaffected.

## 3. In-app purchase — "AI Coach + Video" ($19.99)

Check the current field limits in App Store Connect before pasting; they are
short and Apple has changed them. Two lengths, so there is something that fits
either way.

**Display name (keep the product name as-is):** `AI Coach + Video`

**Description — short form:**

> AI coaching plus form-check video. Camera metrics are in calibration and not
> accurate yet.

**Description — if the field allows more:**

> Everything in AI Coach, plus form-check video on your lifts. Video capture and
> review work today. The tracked metrics calculated from that video are not
> accurate yet and are being actively calibrated.

The other two tiers (`basic_v2`, `ai_coach_v2`) do not include form check, so
they need no change on this point.

## 4. "What's New" for this release

> Camera tracking accuracy is disclosed throughout the app while we calibrate
> the pipeline. Video recording, playback and coach review are unaffected.

---

## When calibration lands

Remove all of the above, and delete `shared/camera-accuracy-copy.ts` — `tsc`
will then name every in-app site that has to come out with it. A stale warning
still telling athletes their numbers are wrong long after they are not costs
more trust than never having warned them at all.
## This is now repo-managed

`fastlane deliver` is wired up. Two lanes in `ios/fastlane/Fastfile`, both
runnable from the "iOS TestFlight" workflow's lane dropdown, and **the order is
not optional**:

1. **`download_metadata`** pulls the current live listing into
   `ios/fastlane/metadata/` and uploads nothing. The workflow saves the result
   as an `app-store-metadata` artifact -- download it, unzip over
   `ios/fastlane/metadata/`, and commit.
2. Edit the text files, using the copy above.
3. **`upload_metadata`** pushes them. Metadata only: `skip_binary_upload`,
   `skip_screenshots`, `overwrite_screenshots: false`, and
   `submit_for_review: false`. A copy change does not touch the binary, the
   screenshots, or the review queue.

`upload_metadata` refuses to run until `en-US/description.txt` exists -- a file
only `download_metadata` produces. That is what stops step 3 happening without
step 1: deliver uploads whatever it finds, and a hand-assembled folder is one
nobody has reconciled against the live listing.

Only `promotional_text.txt` and `release_notes.txt` are checked in by hand.
`description.txt` is deliberately absent, because the live description has never
been read from this repo and writing one from scratch would mean overwriting
working copy with a guess.

**Untested against the real console.** Everything above is reasoned from
deliver's documented behaviour and verified only as far as Ruby and YAML syntax;
the sandbox this was written in cannot reach apple.com. The first
`download_metadata` run is the real test, and it is the safe one to fail -- it
writes nothing to Apple.

---

# App Store search: the fields, and what belongs in them today

Added alongside the web SEO work, for the same reason this file exists at all: so
the copy is reviewed and versioned rather than typed into App Store Connect from
memory.

**These are proposals, not files.** `name.txt`, `subtitle.txt` and `keywords.txt`
are files `download_metadata` produces. Writing them by hand here would be
assembling a metadata folder nobody has compared against the live listing, which
is the exact failure the guard in `README.md` exists to stop. Run
`download_metadata`, commit what comes back, and then apply the text below.

## The app name stays "Forge"

The tempting change is something like "Forge: AI Barbell Tracker" or "Forge:
Velocity Based Training" — a real ASO gain, since the name is the heaviest
ranking field Apple has.

**Do not make it.** The name would assert precisely the capability the product
currently disclaims in a dozen places and withdrew a paid tier over
(`17b86426`). It is also the hardest field to walk back: a name change goes
through review, and an app that renamed itself *away* from an AI claim is a
worse look than one that never made it.

Revisit after calibration lands. It is a good idea then and a liability now.

## Subtitle (30 characters)

```
Strength programming for teams
```

Exactly 30. Describes what is finished, carries "strength", "programming" and
"teams" as search terms, and makes no claim about the camera.

## Keywords (100 characters, comma-separated, no spaces)

Apple ignores words already in the name and subtitle, so neither "forge" nor
anything from the subtitle above belongs here.

```
gym,weightlifting,barbell,workout,log,athlete,roster,coaching,squat,bench,powerlifting,highschool
```

96 characters. Every term describes something Forge does today.

**The second set, for after calibration:** `vbt`, `velocity`, `barpath`,
`biomechanics`, `kinematics`, `sprint`, `jump`. Each of these ranks the app for
the camera pipeline, and until the metrics are trustworthy, ranking for them
sends exactly the buyer most likely to be disappointed. Swapping them in is a
one-line change to this file plus an `upload_metadata`, so there is no reason to
do it early.

## Promotional text

Already written, already carries the disclosure, already in this directory. It is
the one field that can be changed without a review, which makes it the right
place for the calibration status — and the right thing to update the day
calibration lands.

## The manual step this does not remove

`docs/app-store-launch-notes.md` records that the camera-accuracy disclosure has
to be pasted into App Store Connect by hand. That is still true and still
pending; none of the above does it.
