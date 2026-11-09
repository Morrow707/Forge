# Forge — handoff to a new session, 2026-11-09

You are picking up camera calibration on Forge (Morrow707/Forge). Work on branch
`claude/database-code-audit-de6o0f`. Never push to another branch. No PR unless asked.

## Read these first, in this order
1. `CLAUDE.md` — the operating rules. Rule #1 (the camera never rejects), Rule #2 (every
   sensor is a peer), Rule #4 (all three camera systems on every lift), Rule #5 (measure the
   take-to-take scatter before fitting a bias), and "what 'its own numbers' means" (a NUMBER
   somebody could fit from one take is per-lift; a RULE is shared).
2. `docs/camera-tracking-notes.md` — opens with a STATUS BOARD: what works and must not be
   touched, what is known not to work, what the latest evidence points at.
3. `shared/accuracy-ledger.ts` — one replayable row per sensor-paired take.

Standing order from Scott: every filmed lift gets at least one fix however small, every fix
costed on all ledger rows and the fixture corpus, a dated note per fix naming the function it
belongs to, the status board updated before the push, then `verify_build` then `beta` without
asking. Calibration work is exempt from the TestFlight batch — ship it the moment it is committed.

## Where things stand

**Build 726 (`baf487d`) is the build to film on.** It carries round twelve plus two fixes:
- A failed analysis always saves a row now (six tracker dialogs were skipping `onCapture`
  entirely when no video upload happened to be in flight — Scott lost a filmed back squat to it).
- `maxTracedGapSeconds`: the live-vs-file gate was reading the camera's frame clock, which keeps
  ticking while body tracking finds nobody, so a 2.3s hole with no pose was invisible to it.

Scott's phone was on 720 for set 1 and 724 for set 3 of the 2026-11-09 round.

## Round twelve (shipped)
The squat read −40.3% on the mean against −8.3% on range, which is the clock not the scale.
Forge was counting the 0.20–0.37s he stood at lockout between reps as part of the lift.
Two changes: `REST_AT_TOP_MIN_SECONDS` = 0.4 (a rest the phase ENDS INSIDE is still a rest —
a shared RULE) and `FITTED_OVERRIDES["Back Squat"].driveOnsetFraction` 0 → 0.02. Set 1 replays
at −15.3%. Only Back Squat takes moved in the corpus; no rep count and no range of motion changed.

## Round thirteen — MEASURED, NOT YET COMMITTED

Export: `93688684-forge-captures-recent.json` (2026-11-09 20:55 UTC). **Set 2 is missing on all
three lifts** — that is the bug 726 fixes.

**Set mapping, confirmed by Scott: Forge set 3 ↔ OVR set 3 for the squat, ↔ OVR set 2 for the
RDL and the box jump.** (His Forge set 2 failed, so he re-ran that round as Forge set 3; the OVR
counted it as its own set for the squat only.) Getting this wrong costs a whole round — check it.

### Back Squat, Forge set 3 vs OVR set 3: +17.8% ROM, +22.0% mean, +15.8% peak
- The clock is RIGHT. Drive windows 0.934/0.900/0.934/0.934/1.034 s against the sensor's own
  concentric 0.95/0.95/0.92/0.97/1.03 — within 0.03s every rep. Round twelve holds.
- The ruler is not it. Every ruler moved <3% between set 1 and set 3 while the scale the sensor
  demands dropped 16.6%. At body_3d's own vote set 1 lands +0.2% and set 3 +23%.
- **The finding, off `bodyWitnessTrace`: the HIP travelled 22.1 in against the sensor's 22.5
  (−1.8%); the SHOULDER — the point Forge calls the bar — travelled 25.8 in (+15%).** His torso's
  vertical extent shrinks ~10cm from standing to the bottom on shallow reps, and all of that extra
  descent lands on the shoulder landmark, which sits in front of and below where the bar rides.
  First measured cost of the 2026-09-28 "on a back squat the shoulders ARE the bar" switch, which
  CLAUDE.md already flags as a leader wearing a rule's clothes.
- Do NOT loosen `heightRulerUncertainty` for this: the height ruler is 12.7% LOW on set 1 and
  7.3% HIGH on set 3. No single value fixes both.

### Romanian Deadlift, Forge set 3 vs OVR set 2: +25.0% ROM, +65.2% mean, +80.3% peak
Mean error 2.6x the range error, so this one IS the clock — the opposite fault from set 1, which
was pure scale at −25%/−26%. Reps 1–6 run a third too long and reps 7–8 are right; rep velocities
scatter 0.69–1.75 against a sensor flat at 0.63–0.79; a plate joined the blend for the first time
on an RDL and voted 34% high. Treat it as a segmenting failure, not a calibration point.

### Box Jump, Forge set 3 vs OVR jump squat set 2
**Nine "jumps" on a five-rep set: five ups and four step-downs off the box.** Confirmed from the
witness trace — the ankle sits at floor level, then ~92cm for a second or two, five times, with
four returns in between. Split them:
- the 5 ups: takeoff 2.85 m/s vs the sensor's 2.71 → **+5.3%**
- the 5 ups: height 14.2 in vs the sensor's 25.8 → **−45%**
- the 4 descents: 7.2 in, 1.81 m/s — not reps
Set 1 did not do this (6 jumps, all ups, −3% on height at the same scale). The difference is
tempo: 2.9–4.0s on the ground on set 1, 1.25–2.3s on set 3. The descent is only counted when he
moves at a real set's pace. The halved height almost certainly falls out of the same fault.

Standing rule from Scott, already in the ground truth: **on jumps the OVR's rep 1 is a setup rep
and is never read.** Read `reportedOverOurReps`, never the screen's bottom row.

## Next two pieces of work
1. **The descent fix** — a step off the box is not a rep. A RULE, so shared.
2. **Hip vs shoulder on every stored squat** before proposing any bar-point change. One take is
   one take (Rule #5).
Both costed on the whole corpus before either ships, then a dated note, the status board, and
`verify_build` then `beta`.

## Also open, recorded not fixed
- The RDL's −25% scale on set 1: no ruler reaches the required 0.0055870 (best candidate
  0.0049213) and the object system produced nothing — the work is the CoreML detector, not a constant.
- `measuredPosture.torsoFromVerticalDeg` reads 0.88° on a squat whose torso visibly pitches, and
  has read 1.53–7.13° on hinges. The posture measure is not seeing real torso angle.
- "Show fast, correct quietly" is designed and queued, not built; the six-step build order is in
  `docs/camera-tracking-notes.md`.
- The body map (`tools/body-map/`, artifact https://claude.ai/artifact/547k9BLoUmuYF12LvyA3dM) is
  NOT wired into `client/src/components/body-map.tsx` — waiting on Scott's word.

## Things that will bite you
- A negative source assertion must strip comments first. Most repeated self-inflicted failure here.
- Bound a source scan by matched brackets, never a character window.
- State what is FORBIDDEN, never a list of accepted forms.
- Never run two integration suites against one database.
- Check the diff STAT, not just the exit code. I emptied CLAUDE.md (7,876 lines) with a one-line
  edit written as a whole-file rewrite and shipped it to main before noticing.
