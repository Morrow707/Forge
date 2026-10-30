# Camera tracking: what is validated, what is assumed, what will break

## RULE #1, BEFORE ANYTHING ELSE IN THIS DOCUMENT: THE CAMERA NEVER REJECTS. EVER.

Scott, 2026-09-22: "Camera should never ever reject, I'd rather have bad data then it reject the
whole thing, we can calibrate bad data, we can't calibrate a rejection. Never ever, ever, ever,
should the camera ever, reject my filming angle or data. Make that rule number 1."

The filming angle is never a reason to refuse anything, and neither is a posture. A set that was
filmed gets a row, a number and an explanation -- always, however little the pipeline trusts it.
The caveat (`shared/camera-accuracy-copy.ts`) and the `trackingDiagnostics` blob are how a reader
is told not to trust a number; silence is not. Everything below is written under this rule, and a
check that withholds a number the pipeline already computed is wrong as written: make it a flag.

See the RULE #1 section at the top of CLAUDE.md for the full statement.

## STATUS BOARD -- READ THIS FIRST ON ANY CALIBRATION DAY (updated 2026-10-29, round two)

Scott, 2026-10-29: "I want you keeping a running log wherever you need to ... so we don't keep
going in circles with what works and what doesn't, when your feed goes stale you don't remember
what you fixed yesterday in the camera or last week." This board is that log. It is SHORT on
purpose; every line points at the dated section that holds the evidence. **Update it at the end
of every session, before the push, and date the heading.** The replayable record behind it is
`shared/accuracy-ledger.ts` (one row per sensor-paired take, replayed by
`the-ledger-replays-every-paired-take.test.ts`); a take that is not a row there is not measured.

**Under test (Scott, 2026-10-20): Back Squat, Romanian Deadlift, Box Jump. Nothing else.**

**THE STANDING ORDER FOR THE NEXT SESSION (Scott, 2026-10-29, after build 697 shipped the RDL's
record):** "Ok I'll record all 3, but I want you to change something on all lifts after this
round. 1.5% is good but I want to make it 0% and steady." Then: "Small changes. .001% changes."
And, refining it: "If you have to do multiple changes that's fine, but until we get to 0% I
want to keep making small adjustments on everything to remain steady and confident."
So when the 697 export and the OVR numbers arrive: add the ledger rows FIRST, then ship
adjustments to EACH of the three lifts -- one or several per lift, in that lift's
`FITTED_OVERRIDES` record or a rule gated on that lift, never a shared constant -- every one of
them SMALL (a nudge on the order of the residual, not a swing; he said .001%), each replayed on
every ledger row and the fixture corpus to show the other two lifts do not move to the
hundredth, and the board's "what is known not to work" list read before any lever is picked.
**This is the loop until every lift reads 0%: film, ledger, small nudges per lift, verify_build,
beta, film again.** A big correction that lands once is not what he asked for; a run of small
ones that each hold on the next take is. Target is 0% AND steady, so repeatability across the
takes counts as much as the mean (Rule #5): a change that closes the mean and widens the
take-to-take spread is not the change. Build to film on: **the newest in the run list** (701 once round three's beta lands; 699 carried round two).

| lift | paired takes | ROM vs OVR, oldest -> newest | state |
|---|---|---|---|
| Back Squat 135 | 10-19 x2, 10-29 x2 | -5.3%, -1.5%, -1.9%, **-1.3%** (mean 0.81/0.84/0.72/0.89 vs 0.86/0.84/0.80/0.84) | **lands, same signature four takes running; its own height uncertainty (0.11) ships in round two, worth about +1%** |
| Romanian Deadlift 135 | 10-19 x2, 10-29 x2 | +16.4%, +12.0%, +30.5% oblique; **-34.2% square-on on 697** -- a plate boxed 1.63x too big took 86% of the scale. Without it the square-on take reads **-1.9%** | **square-on, the body rulers are within 2%; the plate rule is fixed in round two; the velocities are the next fault (window 25% long)** |
| Box Jump, 24in box | 10-19 x2, 10-29 x2 | box ruler 1.20-1.22 on both 10-29 sets (ankle rise 72-75cm onto 61); hip peak **+2% / -13%** at the floor scale (was -15% / -29% divided by the landing ratio); hip mean +15% / +7% at the floor scale | **round three: the box ratio corrects the LANDING numbers only; the hip's drive keeps the floor scale the squat proved from the same spot. Next: set 1's -13% is a trace with 21 dropouts, and the mean's window** |

**WHAT WORKS AND MUST NOT BE TOUCHED** (each proven against the sensor, each with a test):
- A hinge gets NO height ruler (`bent_over`, 10-05): the RDL went -7.0% -> 0.0% that day.
- The un-rack is not a rep (`concSpeed` count-trim term, 10-06): bench 12 reps -> 10.
- A lone plate never takes the whole scale (10-09, `cb67688a`): row -60.5% -> -1.1%.
- The grip floor and the agreement cap (10-09, `d283ec85`, `b88d8850`) -- the only
  pair of changes to take nine paired takes from 10.6% to 5.4% median error.
- `DRIVE_ONSET_FRACTION` 0.04 (10-07): concentric window inside 1.1% on two of three takes.
- The box ruler on a box set, the gravity ruler on a flat jump, never both (10-05, 10-19).
- The box ruler divides what was measured AT THE LANDING and never the hip's drive (10-30, round
  three): its 1.20-1.22 is the landing sitting nearer the lens than the takeoff, proven by the
  height ruler reading the same scale on the box sets as on the squats filmed from the same spot
  minutes earlier. The gravity ruler still scales the drive, because it measures one spot.
- A PLATE agrees from both ends or not at all (`scalesAgree`, 10-29 round two): the 697 RDL's
  1.63x plate was inside 0.4 anchored on the body and 1.53x away anchored on itself, and took
  86% of the blend. For the BODY rulers the one-ended test stays -- see the next list.

**THE SQUAT'S FIRST PER-LIFT NUMBER, 10-29 round two** (`FITTED_OVERRIDES["Back Squat"]`):
`heightRulerUncertainty` 0.1 -> 0.11, the small step Scott asked for. Four squat takes in a row
read low with one signature (height ruler 6-10% under at ~75% of the weight, body rulers 10-20%
over), so a tenth less confidence in the low voter moves the blend about +1%. Replayed on all six
squat ledger rows (+1.0 to +1.8 each) and no RDL row. Expect 10-29 set 2's -1.3% to read about
-0.3% on the next build; if the next take reads HIGH, the step was too big and comes back a hundredth.

**THE FIRST PER-LIFT NUMBERS, 10-29** (`FITTED_OVERRIDES["Romanian Deadlift"]`, evidence beside it):
`depthRulerUncertainty` 0.6 (depth read +8..+44% HIGH on 5 of 5 RDL takes; the collapse now weighs
the pair by what each states, which is identical for every lift stating 0.2 twice) and
`maxPeakToMeanRatio` 2.5 (the OVR's own ratio on this lift is 1.57-1.78 on 16 of 16 reps; the
2.0 was 60 bench reps). Replayed on every ledger row: RDL median error 12.0% -> 6.7%, every squat
row identical to the hundredth. See "Second pass, 2026-10-29".

**WHAT IS KNOWN NOT TO WORK, SO IT IS NOT TRIED AGAIN:**
- Making the agreement test symmetric for EVERY ruler (10-29 round two): the 10-05 Back Squat goes
  from -3.58% to +24.43%, because its height ruler sat at 0.7 of the body rulers, was the one near
  the sensor, and was admitted from THEIR end. The asymmetry is load-bearing for body rulers and a
  defect only for a plate, which is why `scalesAgree` asks the plate from both ends and nobody else.
- Reading a floored RDL peak off the UNFILTERED window (10-29): the low-confidence frames are
  noise, not the missing peak -- 2.56, 1.95, 2.0 m/s against a sensor at 1.6. Reverted before
  it shipped; the replay harness is what caught it.
- Refitting the SHARED `DEPTH_RULER_BIAS` (10-29): every value that helps the RDL hurts every
  squat and the worst case stays above 20%; at 1.25 the 10-19 RDL flips to -36% when the plate
  takes the cluster. A shared constant is the wrong lever for a hinge-only error.
- Fitting the RDL by carrying the in-plane 3D value with the pair's split as uncertainty:
  reds three pinned OVR guards (10-19). Widening the collapsed witness alone: no effect (10-19).
- Refitting `HEIGHT_RULER_UNCERTAINTY` or `BIACROMIAL_HEIGHT_FRACTION` off a squat: the squat
  only lands because the height ruler (8-10% LOW, 75% of the weight) cancels the two body rulers
  (13-20% HIGH) on all three squat takes. Move either side alone and the squat breaks.
- Fitting `DEPTH_RULER_BIAS`: depth has read HIGH on every take since the height went on file
  (+14, +22, +27, +35, +38, +44%), scatter as wide as the bias. Rule #5.
- Refusing the shoulder ruler: the only good voter on a bench (10-09).
- Admitting the plate: the retrained detector boxed the plate 1.75x (10-19) and **2.19x (10-29)**
  too big on the two real takes read since the retrain, against 1.01-1.03x on held-out images.
  The gates were right both times. The object witness is still not a ruler on a real take.

**WHAT ROUND TWO POINTS AT, UNFITTED** (see "Round two, 2026-10-29"):
- The RDL's velocities with the scale right: mean 0.68 against 0.85, peak 1.23 against 1.43. The
  concentric runs 0.83-0.93s where the sensor's 0.625m at 0.85m/s is ~0.74s -- the window is a
  quarter long on a hinge. The next RDL lever is the drive window, in the RDL's own record
  (`driveOnsetFraction` is a field), after a second square-on take confirms the scale.
- The jump: DECIDED in round three (10-30), not left to the sensor -- the hip's drive keeps the
  floor scale (see "Round three"). What is left: set 1's peak -13% on a trace with 21 dropouts
  (`cadenceHeld` 0.914) against set 2's +2% with 23 dropouts, so the dropouts alone do not
  separate them; and the mean +15% / +7% beside a window (0.18-0.28s) the sensor reads at
  0.18-0.20 TPV -- the concentric window's start is the lever, in the jump's own record, after
  the next box set confirms the peak holds at the floor scale.
- 7 of 8 RDL reps found on both sets, 10-19 and 10-29: the segmenter loses one every take.

**WHAT THE MORNING'S EVIDENCE POINTED AT, UNFITTED** (see "Three lifts beside OVR, 2026-10-29"):
- The RDL is two faults on one take: body rulers all high (the collapse again, plus a shoulder
  span foreshortened on an oblique hinge) AND a hand trace with 27% of frames under the wrist
  visibility floor, 5 of 7 peaks floored, per-rep ROM 62-93cm against the sensor's 59-64.
- The box jump's `takeoffVelocityMps` on a BOX set is an ankle-ballistic number (the ankle lands
  61cm up because the knees tuck; the centre of mass does not) and reads +30% against the
  sensor's hip; the countermovement's `concentricPeakVelocityMps` is the hip and reads -30%.
  Neither is the sensor's quantity yet. The rise onto the box is right.
- The squat's three identical signatures (height low, body rulers high) are the first stable
  bias pattern on this account. Three takes is not a fit; a fourth and fifth squat beside the
  sensor are what would make one admissible.

Written during the database audit, from reading the tracking code and from
Scott's account of what has actually been tested on real lifts. The point of
this file is that several of the constraints below are not visible from the
code alone and not discoverable by testing the wrong exercise, so a session
that reaches for the obvious answer will get a plausible number that is
wrong.

## Set 2 beside OVR, 2026-10-02: bench, Pendlay row, push press (build 594)

The second set of each lift on build 594, the build cut from the first. Fixtures:
`client/src/lib/__fixtures__/{pendlay-row,bench,push-press}-set2-2026-10-02.json`; test:
`client/src/lib/set-two-beside-ovr-2026-10-02.test.ts`.

| Lift | Path | Device | Sensor | Fix |
|---|---|---|---|---|
| Push press, set 2 | live, 747 frames | 9 reps, 1.07 m/s, 70cm | 9 reps | none needed; the live path's first full take |
| Pendlay row, set 2 | live, 533 frames | 10 reps, 1.07, 56cm | 9 reps, 1.02, 49.5cm | pickup dropped; replays at 9, 1.02, 50.5cm |
| Bench, set 2 | file (live fell back, maxGap 0.43s) | 10 reps, 0.47, 33cm | 10 reps, 0.76, 38.6cm | open, see below |

- **The row's tenth rep was the pickup** (`bar-tracking.ts`, `isEdgeRackArtifact`,
  `EDGE_OVERSIZED_AMPLITUDE_RATIO` 1.6). The first concentric ran 96.8cm over 3.7s, the bar
  coming off the floor to the hang, against a 54cm median rep. Every edge test before this
  looked for a phase that fell SHORT; a phase at the edge that moves far too much is the bar
  being brought to the start. The count trim could not catch it: the program row prescribes
  ten and Scott did nine, so the count agreed with the wrong answer.
- **The live path ran the 3D pose once every four seconds** (`AvBodyTrackingPlugin.swift`,
  `processFrame`, `strideIndex`). The sensor strides are stated in delivered frames (120 is
  once a second at 120fps) and the file path's frame index counts every decoded frame. The
  live path's index counts only the frames the cadence chose, one in four, so the same stride
  fired a quarter as often: 6 3D frames on the row against 27 on its file-read set 1, under
  `MIN_BODY_3D_FRAMES` for every bone, and the take's scale came from the shoulder ruler alone
  (`scaleCandidates` had one entry). The index is scaled back up on the live path, so both
  feeders thin each sensor the same.
- **The bench lost its wrists on 360 of 680 frames** (`trace.framesNoWristOrImplement`; set 1
  from nearly the same angle lost 26). Vision read both wrists under `MIN_VISIBILITY` for half
  the take, the stored trace has fifteen holes of 0.3-1.4s, the segmenter read the holes as
  reps (reps 1-3 are the un-rack at 47-50cm; reps 4-10 are the presses, with their peaks
  floored to their means because the concentric fell in a hole). Fix at capture time, so no
  replay can show it yet: a wrist between `LOW_VISIBILITY_WRIST_FLOOR` (0.2) and the floor is
  used at its own confidence rather than dropped (`pose-tracking.ts`,
  `lowVisibilityWristConfidence`; `av-bar-tracker-dialog.tsx`, `fuseSide`), still through the
  plausibility gate, counted in `trace.wristsBelowVisibilityFloor`. Rule #1 at the sample: a
  wrist read at 0.3 is a worse point than one at 0.7 and far better than none. The plate was
  no help here (`equipmentOffsetSpreadGrips` 0.63 against the 0.25 the substitute needs), and
  the shoulders do not move with a bench bar. Open: whether the plate's offset gate is too
  tight for an oblique bench, and why the live path's largest gap was 0.43s on this take.
- **The press had no video because the program row's form-check switch was off**
  (`workout.tsx`, `mergedTracking`). `recordVideo` required `videoCheckEnabled`, the builder's
  default is off, so the camera filmed the set, saved the numbers and threw the clip away. A
  tracked set now always keeps its clip; the switch only decides whether a coach is asked to
  review it. The export carries `hasVideo` and `videoCheckEnabled` per set so this is a
  column next time, not a guess, and the debug console logs every video outcome (`VIDEO`).

## Three lifts beside OVR, 2026-10-02: bench, Pendlay row, push press (build 589)

Three sets of ten with the bar sensor on the bar, all filmed on build 589 at 120fps, all from an
oblique. Export: the admin captures export of 2026-10-02 19:13. Ground truth in
`client/src/lib/tracker-ground-truth.ts` (`OVR_BENCH_2026_10_02`, `OVR_PENDLAY_ROW_2026_10_02`,
`OVR_PUSH_PRESS_2026_10_02`). The replay harness (`capture-replay.ts`) reproduces the phone on
all three to the second decimal, so every finding below was checked against the replay.

| Set | Sensor mean / peak / ROM | Camera mean / peak / ROM | Reps | Scale vs sensor |
|---|---|---|---|---|
| Bench 135x10 | 0.74 / 1.08 / 37.1cm | 0.85 / 1.22 / 34.7cm | 10/10 | 0.94 |
| Pendlay row 135x10 | 0.85 / 1.54 / 50.0cm | 0.77 / 0.93 / 31.9cm | 11/10 | 0.64 |
| Push press 95x10 | 1.05 / 1.75 / 65.8cm | 1.33 / 1.76 / 81cm | 10/10 | 1.23 |

**Every ruler against every paired set.** With these three there are fourteen sensor-paired takes
carrying each ruler's reading, enough to measure each ruler rather than guess at it (ratio of
ruler to sensor-implied scale, geometric mean and spread of the log ratio):

| Ruler | n | mean ratio | spread |
|---|---|---|---|
| shoulder_width | 13 | 1.13 | 0.095 |
| body_3d (in-plane) | 14 | 0.94 | 0.165 |
| depth | 14 | 0.83 | 0.305 |
| height | 4 | 0.84 | 0.167 |
| plate | 3 | 0.35 | (torso every time) |

Modelled under leave-one-out, the weights `reconcileScaleEstimates` already carries come out best
(about 10% rms); bias-correcting the rulers by their mean ratio made it worse on the sets where
the ruler was exact, and raising the height ruler's uncertainty from its 0.05 cost the three
squats their 4% accuracy. So the constants did not move. The two big misses had specific causes:

- **The row (0.64) was a posture bug, not a weight.** `rejectImplausibleScales` measured the
  body span on a torso held parallel to the floor with the ankles behind the plates, and that
  span implied a 142-inch athlete for the shoulder ruler (0.00475, within 19% of the sensor) and
  a 39-inch one for the plate. Both were thrown out. The one ruler left standing was the height
  ruler, built on that same span, 37% low, carrying a 0.05 uncertainty, so it was the whole
  answer. Fix: `CameraPosture` gains `bent_over` (rows done hinged, good mornings;
  `exercise-camera-profile.ts`), which runs no height ruler and withholds the body span from the
  stature check (`av-bar-tracker-dialog.tsx`, `bodySpanUnits`). The row's remaining rulers then
  blend to 1.11 of the sensor. The grip yardstick still runs on every posture.
- **The push press (1.23) is the shoulder ruler at 1.34 on a standing athlete turned 26 degrees
  from the lens** (`gripAxisFromVerticalDeg`). The 2D shoulder span foreshortens with the turn
  and the ruler's assumed breadth does not. OPEN: the in-plane 3D ruler read 0.83 on the same
  take and is yaw-aware by construction; a yaw read off the 3D pose could de-foreshorten the 2D
  ruler. One take is not enough to fit that. Logged in the fixture; nothing changed for it.
- **The "plate" was the athlete's torso on both standing takes** (103x214 and 191x344 px boxes,
  aspect 2.08 and 1.81, at a third of the true scale), and the plate has now been wrong in all
  three paired sets where the detector offered one. Two fixes: `MAX_PLATE_ASPECT_RATIO` 2.5 ->
  1.7 (`shared/tracker-arbiter.ts`; a disc 54 degrees off-axis reads 1.7), and a plate that
  corroborates with NOTHING while two or more other rulers are present steps out of the vote
  (`reconcileScaleEstimates`). Before this a lone plate won by rank, which is a leader wearing a
  rule's clothes (Rule #2). A plate anything agrees with keeps its rank; one against one is still
  rank's to break.
- **The bench reached the tracker with `movementType` null.** The program row was a copy that
  never carried the library's "Push", so the expected pattern, the torso-at-rest rule and the
  trust note all ran on nothing ("didn't clearly match the selected exercise" on a textbook
  bench). `inferMovementType(name)` is the fallback for a missing type, never an override.

**Still open from these three, with the code each belongs to:**

- **Bench mean 15% high with the range of motion 6% low** means the concentric window is short:
  0.33s against the sensor's ~0.50s on the middle reps. `trimPhaseToDrive` / `trimPhaseToTravel`
  (`bar-tracking.ts`). Bench set 10 passes within 10% through the same code, so the difference
  is in this trace: oblique, 100 lone-hand-carried frames, 14 side flips, a 2.6s hole
  (`largestGapSeconds`). Rep 1 (0.29 m/s, 0.83s) is the settle after the un-rack read as a rep.
- **Row counted 11.** The eleventh (19980-22382ms, 0.70 mean = peak, 27cm) is the bar going to
  the floor after the last pull. Its oddness score sits under `MIN_COUNT_TRIM_ODDNESS` (1) so the
  count trim kept it. Not changed: lowering that floor on one set is the kind of tuning that
  broke bench set 3.
- **Push press rep 1 is the un-rack and dip** (34cm, 0.23s, mean = peak at 1.64) and the count
  trim removed a real press from the far end instead. `repConsistency.outlierReps` already names
  it. Same rule as the bench settle: it is at the front edge and odd; the trim chose the back.
- **Peak velocity on the press read 1.76 against 1.75 with the scale 23% high**, so at the right
  scale the camera's peak is 20% low on a lift whose time to peak is 0.21s. `velocitySmoothingMs`
  165 flattens a 0.2s drive. The squats and benches (0.3-0.5s drives) do not show it.

**The live path, and why the press felt slow.** All three takes fell back from the live trace to
a full re-read of the file: coverage 0.47-0.49, drop rate ~2.1 against a gate of 0.9 and 0.05.
Vision takes ~45ms a frame on this phone, so at 120fps the delegate is busy for five frames in
six and the capture discards them as late; "every Nth delivered frame" on top of that gave a
cadence nobody chose, and the gate was never going to pass at 120fps. The press clip was 33s and
so paid the longest re-read (22s of analysis after a 22s set). `AvBodyTrackingPlugin.swift`:
the live delegate now samples by presentation time (one target interval, stride over capture
rate, between processed frames; sooner frames are skipped before the scaler runs), and the gate
is coverage >= 0.5 of the target rate AND the largest inter-frame gap <= 0.25s
(`maxInterFrameGapSeconds`, which was already measured). A trace at half the rate with no hole in
it is the same measurement at a coarser cadence; a hole is what makes one unusable. The result
carries `liveSkippedForCadence` and `liveMaxGapSeconds`. UNTESTED ON A PHONE: the next take says
whether it holds (`analysisPath: "live"` in the recording diagnostics). If it does, the wait
after Stop drops from ~20s to the upload alone.

## What has actually been field-tested

Four exercises, as of this writing:

- **Back squat** — bar path / full, filmed from behind
- **Pendlay row** — bar path / full
- **Bench press** — bar path / full, filmed from behind
- **Box jump** — jump mode

Everything else in the tracking system is unvalidated against real footage.
That includes sprint, mechanics, med ball, kettlebell swing, sled push and
both rotation modes.

Planned order after these, per Scott: **deadlift**, then **med ball throws**
(the two together), then **Olympic lifts**.

## Trust scores are structurally sound and numerically untuned

Every capture mode now produces a confidence score, normalized into
`workout_set_entries.trust_score_pct` and `skill_session_logs.trust_score_pct`.
The structure is right and the inputs are real signals. **Every threshold in
it is a guess**, made without footage to calibrate against, and the modules
say so.

A trust score is therefore currently a relative signal, not an absolute one.
"This capture scored 40" does not yet mean anything in particular. Calibrating
means running real captures — some deliberately bad — and checking whether the
scores actually separate them.

Note also that a trust score is not accuracy. Adding one changed no reading.
A jump height or a 40 time comes back the same number it did before; what
changed is that it now arrives with a statement of how much to believe it.

## Camera angle changes which axis is measurable

`barPathDeviationCm` takes the median horizontal position across a rep and
reports the 90th percentile distance from it, across **both** horizontal axes
(side-to-side and front-to-back).

The two axes are not equally trustworthy:

- Side-to-side, filming from behind, is real image-plane motion. Measured well.
- Front-to-back, filming from behind, is **depth**, which the pose model
  estimates rather than observes. It is the least reliable number the tracker
  produces.

Squat and bench are currently filmed from behind, which means the axis being
measured best is the one that matters least, and the fault a lifter actually
cares about — the bar drifting forward over the toes, or travelling toward the
face on a press — is being inferred from estimated depth.

A **side view** swaps this: forward-back becomes ordinary image-plane motion.
It should give a materially more trustworthy deviation number for the sagittal
fault. The rear view stays better for left-right bar tilt and for leg-drive
asymmetry, which needs both sides visible.

These are two captures answering two different questions, not a replacement.

**This is reasoning from how the numbers are computed, not from footage.**
Nobody has measured how bad the depth estimate is on real equipment. The test
is to film one set from both angles and compare the deviation each reports.

## Bench press has a known calibration weakness

Calibration resolves a pixels-to-metres scale from a head-to-ankle read
(`calibrateFromFrames` in `pose-tracking.ts`). A lying-flat athlete with feet
out of frame cannot produce one.

A previous attempt worked around this by switching horizontal press/row
barbell sets to a plate-based scale, trading bar-path corroboration for
calibration. Field data the same night showed that made the fused signal noisy
enough to invent readings, and it was reverted — see
`av-bar-tracker-dialog.tsx`'s own comment.

So of the four validated exercises, **bench is where a wrong number is most
likely to be a calibration failure rather than a tracking failure**, and the
two look identical from outside.

## Olympic lifts need their own path model, not a library entry

This is the one that will silently produce wrong numbers if someone treats it
as a new exercise with bar-path tracking switched on.

`barPathDeviationCm` measures departure from a straight vertical line. Peak
velocity is computed on the **vertical component only**. Both are correct for
a squat, bench, row or deadlift, where horizontal bar movement is error.

A correct clean or snatch has a deliberate S-curve: the bar travels back
toward the lifter off the floor, forward under the second pull, then back
again. Under the current model:

- A technically perfect lift reports **large** deviation.
- A lift with no curve at all, which is wrong, reports **clean**.
- Peak velocity **understates** true bar speed, because the horizontal
  component of the second pull does not count — at exactly the moment that
  matters most.

This is the same situation that gave `kb_swing` (an arc) and `horizontal_load`
(straight-line horizontal travel) their own tracking modes rather than folding
them into bar path. An Olympic lift is a third shape again, and needs the same
treatment.

## Deadlift and med ball should be straightforward

Deadlift is bar path / full, the same mode as the three already validated, and
is the friendliest case for the metrics — the intended path really is vertical.
One thing to watch: the bar starts at rest on the floor, and rep segmentation
works from vertical reversals, so a dead-stop reset between reps may segment
differently from a squat's top-start.

Med ball is the mode with the most machinery behind it and the only one where
the object tracker, the body tracker and the physics trajectory check all
cross-check each other. It is the best real test of the three-system design.

## The two trackers now share one referee

Forge points two independent trackers at the same lift: the body tracker finds
the athlete's joints, the object tracker finds the equipment. They had never
compared notes. The object tracker's three guards -- an implausible-jump check,
a physics trajectory fit, and a periodic re-classification -- are all questions
the object tracker asks about the object tracker, and a lock that has slid onto
a plate on the rack behind the lifter answers every one of them correctly about
the wrong object. It jumps nowhere, flies nowhere, and it *is* a plate.

**2026-09-20: the referee now runs on BOTH paths.** Until today `arbitrate()` had
no TypeScript caller -- overwatch lived only in the Swift port, and the web/MediaPipe
path judged its lock with a frame fraction. `client/src/lib/overwatch-tracking.ts`
(`WebOverwatch`) is the web caller, wired into `bar-tracker-dialog.tsx` with the same
order (body first, then the object, then any fresh detection) and the same asymmetry;
`overwatch-tracking.test.ts` scans the dialog for that order. The same day the Swift
side gained per-source yardstick history, a motion-correlation check (the lock has to
move with the hands), a size/edge filter on candidates before the pick, frozen-frame
detection, and a `held` flag on dead-reckoned positions; the three new counters
(`breaksMotionDisagreement`, `candidatesRejectedBySize`, `framesFrozen`) reach the
admin report. `implement-tracker-swift-parity.test.ts` now polices the seven
implement-tracker constants the same way the arbiter's five are policed.

`shared/tracker-arbiter.ts` is the rule that was missing, and it is deliberately
one rule applied in three places rather than three fixes:

1. **Every tracked frame, natively.** A box the body tracker says is nowhere
   near the athlete's hands drops the lock that frame. This is what actually
   fixes drift onto background equipment -- a rack plate fails on every frame,
   while a re-classification boundary comes round only twice a second.
2. **At re-classification.** Candidates are filtered by the same rule *before*
   the most confident one is chosen. The order matters more than the filter:
   choosing first and checking afterwards throws away a good second-place
   detection of the real implement whenever a better-lit duplicate exists
   elsewhere in the room, which for the `plate` class in a gym is most takes.
3. **Once per take, on the client.** `referenceObjectVerdict` decides whether a
   reference-object scale read is allowed to set the scale at all.

**The threshold is expressed in the athlete's own grip widths**, and that is the
whole trick. Grip width is a real-world length the body tracker measures on
every frame, needs no calibration, and shrinks and grows with camera distance
and zoom exactly as the scene does -- so `2.5 grip widths` means the same
physical thing at three feet or thirty, in portrait or landscape, at 1x or 2x. A
threshold in pixels or frame fractions does not, which is why earlier attempts at
this needed per-setup tuning and never got it. It is also a measurement the
object tracker cannot influence, which is what makes it a referee.

**An unanswerable frame PASSES.** A frame with no body reading is ordinary -- the
lifter steps out of shot, a pose read fails -- and absence of a body reading is
not evidence the object is wrong. The gate only fires on a positive finding: the
athlete was measurably right there, and the object was not near them. Inverting
this would reproduce the over-eagerness the whole thing exists to cure.

### Why this was worth doing now, specifically

The mechanism ran all the way to the rep count. A barbell lift tracks the PLATE
(`COREML_TRACKING_MODE_BY_EQUIPMENT` maps `Barbell` to `plate`). A plate further
from the camera measures fewer pixels across; scale is metres per pixel; fewer
pixels for the same 0.45m disc means a larger scale, means every distance in the
take inflated, means settling wobble clearing the rep-amplitude gate. That is the
same inflation that turned eleven bench reps into eighteen. The re-classification
pass, written to *recover* from drift, was itself capable of causing it every
thirty frames.

Two things that were already being measured and then ignored now decide
something: the reference object's aspect ratio (a plate is a disc; the read that
prompted this boxed at 3.12, which is a rack upright) and its median position
relative to the hands. Both had been written into the diagnostics blob purely so
a human could work out after the fact why the numbers had been wrong.

### The part that makes the next change cheap

Every unlock path in the object tracker used to be silent. A take where the lock
broke forty times and a take where it held all set produced byte-identical
diagnostics -- so the one subsystem whose every threshold is an admitted guess
was also the only one producing no evidence about whether the guesses were any
good. That, not the missing check, is why this has been audited three times.

`AvObjectLockTelemetry` now ships with the analysis result, through
`TrackingDiagnostics.objectLock`, onto the admin tracking report. Read two
numbers first: **re-classify corrections** above zero means the detector changed
its mind about which object it was following mid-clip, so any scale derived from
it was measured off more than one thing; **wrist-gate breaks** is the body
tracker catching the object tracker somewhere the athlete was not.

`PLATE_TO_GRIP_RATIO_LOW/HIGH` went from `0.25`-`2.5` to `0.45`-`2.0` at the
same time, derived rather than guessed (the ratio is depth-independent when both
objects are on the same bar, so the honest window is much narrower than a
factor of ten). Do not widen it back without telemetry to justify it -- widening
is what made the check decorative the first time.

### The referee has to referee both teams

The first version of this only judged the object against the body, and that is
a hierarchy rather than cohesion. It also introduced its own bug: making the
body the ruler means a jumped wrist landmark can break a perfectly good object
lock. Vision reports such a landmark with ordinary confidence, because it is
confidently *somewhere* -- just not on a wrist -- and one such frame moves the
hand anchor metres, at which point every object in view is "nowhere near the
athlete".

What catches it is the ruler's own length. The distance between an athlete's
wrists is a physical constant for a set -- they are holding a bar -- so its
apparent length can only change as fast as they rotate relative to the lens,
which is slow. A bar turned well off square reads about half its true width, and
that is the largest honest change available, so a span that doubles between two
sampled frames is a landmark that went somewhere a wrist cannot. **The object
tracker plays no part in detecting that, which is exactly what makes it a
trustworthy check on the body** -- neither half of the arbitration borrows the
other's sensor.

`arbitrate()` returns one of four outcomes -- `agree`, `object_suspect`,
`body_suspect`, `cannot_judge` -- and **the response is deliberately
asymmetric**. A suspect object loses its lock, because a better answer exists:
re-detect. A suspect body gets an abstention: the frame is skipped, the lock is
left exactly as it was, nothing is reported. There is no better body available,
and convicting the object on a measurement just declared untrustworthy is the
worst of both.

The body is checked **first**, before the object gate and before any fresh
detection. Both orderings matter. Judging the object first means a jumped
landmark has already thrown the lock away by the time the jump is noticed; and a
jumped wrist also drags `regionOfInterest` with it, so a detection seeded on
that frame searches the wrong part of the image and locks onto whatever is
there.

One implementation detail that is load-bearing: **only stable spans join the
history**. A rejected reading must never enter the window it was rejected
against, or a run of bad landmark frames teaches the check to accept them and
the guard dissolves precisely when it is needed most.

`framesBodySuspect` rides along in the lock telemetry and onto the report, so a
body-tracking problem cannot be read as an object-tracking one -- which, before
this, is exactly how it would have appeared.

### If you change the rule, change it in both places

The gate has to run natively to correct a lock mid-clip, and there is no Swift
test target in this repo, so the constants exist twice: `shared/tracker-arbiter.ts`
is the source of truth and `AvTrackerArbiter` in `AvBodyTrackingPlugin.swift` is
a port. `shared/tracker-arbiter.test.ts` reads the Swift source and fails if they
drift apart, and also asserts that the gate is still applied per frame, that
candidate filtering still happens before the most-confident pick, that the body
check still precedes both, and that a rejected span cannot reach the history. It is a text
scan and cannot prove the two behave identically -- only that they were handed
the same numbers, which is the half that actually rots.

## Four modes cannot have cross-tracker corroboration at all

Jump, sprint, mechanics and horizontal_load have **no implement in the scene**,
so the object tracker has nothing to look at and body tracking is the only
sensor. Internal corroboration is the ceiling for them, and it has been
reached: jump compares its two independent height estimates (flight time vs.
peak ankle travel, which existed separately and were never compared), and the
checkpoint-timed modes derive a real precision bound from the frame gap
straddling each crossing.

Do not file "add cross-tracker fusion" work against these four. There is no
second tracker to fuse with.

## Not built yet

**Bar-path overlay on video.** The trace is stored per set
(`workout_set_entries.bar_path_trace`) and is drawn today only as an abstract
scatter plot on the coach analytics page. Drawing it over the actual video has
never been built, though the skeleton-replay overlay it would sit alongside
has. The pieces exist and are not connected.

## Bench press vs. a bar-mounted sensor (field report, 2026-09-04)

One bench set (135lb x 9) tracked simultaneously by Forge and by an OVR bar sensor,
which is the reference we are calibrating toward. Forge's numbers against OVR's:

| Metric | OVR | Forge | Ratio |
| --- | --- | --- | --- |
| Range of motion | 15.3 in (38.9 cm) | 154 cm | 4.0x |
| Peak velocity | 1.04 m/s | 3.0 m/s | 2.9x |
| Mean velocity | 0.76 m/s | 1.31 m/s | 1.7x |
| Peak power | 629 W | 3973 W | 6.3x |
| Mean power | 456 W | 1735 W | 3.8x |
| Reps | 9 | 18 | 2.0x |

Every one of those traces back to **one** root cause, now fixed: height calibration
read the vertical drop from head to ankles and called it the athlete's standing
height. On a bench that segment is horizontal, so the vertical component is just
bench incline plus camera tilt, and dividing a real 1.8m into it inflated the scale
about 4x. The rep count doubled as a consequence rather than independently --
BASE_MIN_REP_AMPLITUDE_CM rejects reversals under 20cm as noise, and at 4x the
athlete's ordinary wobble clears that floor. The power ratios also carry a separate
2.2x from the set being logged as 135 **kg** when 135 **lb** was lifted; the unit
toggle was on KG. That is a data-entry trap, not a tracking bug, but it feeds power
directly (power = mass x g x velocity) and 2.9 x 2.2 = 6.3 accounts for peak power
exactly.

**Consequence of the fix: a supine set now calibrates to nothing and reports no
numbers at all**, per this pipeline's standing "no number is better than a wrong
one" rule. That is the correct outcome for the footage above, and it is worse for
the athlete than it sounds -- bench is simply not measurable from where it was
filmed, and was never measurable there.

Two separate things have to be true before bench can be compared to OVR:

1. **Scale.** Height calibration cannot work on a lying athlete from any angle,
   because it needs an upright body. A side view makes head-to-ankle lie flat in
   the image plane, so a supine calibration branch using the segment's FULL length
   (not just its vertical component) would work there. Not built -- it would be
   guesswork without a device to validate against, which is exactly what the
   Olympic-lift note above warns about. The already-built alternative is the CoreML
   plate detector (computeReferenceObjectScale), which needs a bumper plate in shot
   and no upright body at all.
2. **Axis.** Filming from behind the head puts the bar's travel on the estimated
   depth axis, the least reliable number the tracker produces (see the camera-angle
   note above). Even with perfect scale, ROM and velocity from that angle are not
   trustworthy. **Bench has to be filmed from the side** for these numbers to mean
   anything.

Do not tune constants against the table above until bench is re-shot from the side
with a plate in frame. Fitting a fudge factor to depth-axis data would bake the
camera angle into the model.

### Which angle each lift needs, and why it is not the same answer for all of them

The pipeline has ONE camera and no depth on the 2D Vision path
(visionJointsToWorldLandmarks fills z with 0). Two independent things have to survive
whatever angle is chosen:

**Scale** -- how many centimetres a pixel-unit is worth. Today this comes from the
athlete's own body, so the body has to be visible at its true length. A body pointing
away from the lens is foreshortened and its length is unknowable from that frame; no
amount of maths recovers it. There are now three ways a frame can resolve:

| Frame shows | Method | Works for |
| --- | --- | --- |
| Upright body, head over ankles | Vertical head-to-ankle drop | Squat, deadlift, clean, snatch, row, press, jump |
| Upright body, no head | Shoulder-to-ankle / 0.818 | Same, when the head leaves frame |
| Lying body ACROSS the frame at full length | Full head-to-ankle segment length | Bench, floor press, hip thrust |
| Body pointing at or away from the lens | Rejected | -- |

**Axis** -- whether the movement being measured lies in the image plane. Vertical bar
travel is in-plane from ANY azimuth around the lift as long as the camera is LEVEL with
the movement. Filming down at 45 degrees is what breaks it: that mixes real vertical
travel with depth, and depth is the least reliable number the tracker produces. The
failing bench set was shot from a raised corner, which is why its numbers were wrong in
two ways at once.

So, per lift:

- **Squat, deadlift, clean, snatch, Pendlay row, overhead press** -- the athlete is
  upright, so scale resolves from any azimuth. Film from the SIDE, camera level with the
  athlete's mid-torso. Side view also puts the bar's fore-aft drift in plane, which is
  the drift that matters for all of them. Filming from behind still calibrates, but bar
  path becomes a depth measurement and should not be trusted.
- **Bench press, floor press, hip thrust** -- the athlete is horizontal, so scale
  resolves ONLY from the side. Camera square to the side of the bench, level with the
  bar's travel. From the head or foot of the bench the body points down the lens and
  calibration correctly refuses.
- **Box jump** -- upright, and the measured axis is vertical. Any azimuth, camera level.

The one case that genuinely cannot be solved by choosing an angle is measuring BOTH
horizontal bar-drift axes at once. One camera sees one of them. Fore-aft is the one worth
keeping for every lift here, and side-on is where it lives.

### Getting there from any angle (not yet built)

Two routes, both real, neither dependent on the athlete's body being measurable:

1. **Scale off the equipment instead of the athlete.** computeReferenceObjectScale and
   CALIBRATION_REFERENCES already exist. A bumper plate is 450mm and shows as a full
   circle from the side; a bar is ~2.13m sleeve-to-sleeve and shows unforeshortened from
   the head or foot of a bench. So every angle has a known-size object in frame.

   **This is now wired** (it was not when the paragraph above was first written):
   av-bar-tracker-dialog sets coreMlTrackingMode to "plate" for every lift where
   `heightCalibrationUnreliable` is true, which is exactly the lying/seated/supported
   postures -- bench press included -- and plateScaleFromFrames turns the detection into
   a scale. The shipped MedBallDetector model really does carry the plate class (its
   label map is med_ball, plate, baseball, golf_ball, tennis_ball, kettlebell, dumbbell,
   barbell), and the same retrain that kept the plate class usable regressed barbell to
   ~0.02 and dumbbell to ~0.14 confidence, both under the gate.

   What is still open is not the wiring but the evidence: the plate class's supporting
   data is eleven instances from three photos, so a plate-derived bench scale has never
   been checked against a bar sensor. Do that before treating a bench number as settled.
2. **Use the real 3D pose.** VNDetectHumanBodyPose3DRequest (iOS 17+) returns joints in
   actual metres, and visionBody3DToWorldLandmarks already bridges it -- the TRACKING
   path prefers it per frame. Calibration does not: av-bar-tracker-dialog builds
   calibrationInput from visionJointsToWorldLandmarks alone, the depthless 2D bridge.
   On a frame with 3D pose there is nothing to calibrate, the landmarks are already
   metric, and foreshortening stops mattering at any angle. Closing that gap is a
   separate change and needs a device to validate.

### Capture is pinned to 1080p60 (2026-09-04)

`applyHighestFrameRate` previously chose the highest-resolution format that could
clear 60fps, which on a modern iPhone is 3840x2160. That was a fix for preview blur,
not for accuracy, and it cost a great deal for pixels nothing downstream reads:

| Consumer | Resolution it actually uses |
| --- | --- |
| Vision body pose | 1280x720 (`decodeMaxDim` in the reader's outputSettings) |
| Motion-diff implement tracker | 160px long edge (`implementWorkingMaxDim`) |
| CoreML implement detector | 640x640 (the model's own input) |

Because the analysis reader already decodes through `kCVPixelBufferWidth/HeightKey`
at 1280, a 4K source and a 1080p source both arrive at Vision as the same 1280x720
buffer. Tracking accuracy is not merely similar between the two, it is **identical**.

What 4K did cost, all field-reported on 3840x2160@60 clips: 48.2s to analyse a 34.3s
set; `AVAssetReader` dying partway with -11819 `mediaServicesWereReset`, which
restarts the phone's media server and takes the athlete's own music down with it, so
the "analysis stopped early" bug and the "Spotify cuts out at the save step" bug are
the same event; and "Out of offline storage" from the clip sizes.

The frame rate is now pinned to exactly 60 rather than the format's top speed. The
old code set both min and max frame duration to the range's `minFrameDuration` (its
FASTEST rate), so a 1080p format advertising 1-240fps would have been locked to
240fps -- the slow-motion range with binned readout and non-converging autofocus that
the surrounding comments exist to warn against.

Preview softness is the one thing given up. It is a preview-layer problem
(`resizeAspectFill` upscaling a 1080p buffer ~25-30% to a modern iPhone's portrait
pixel count) and wants a preview-layer fix, not a 4x larger recording.

### Bench press: height calibration is refused, and why (2026-09-04)

A simulated sweep over 48 realistic prop positions (camera 0.4-2.0m behind the toes,
0.15-0.90m high, 0-20 degrees of pitch), driving the REAL `calibrateFromFrames` /
`calibrationMethodBreakdown` / `implausibleRangeOfMotion`, against a true bench range
of motion of 39.4cm measured by a bar sensor:

| Outcome | Count | Published range of motion |
| --- | --- | --- |
| Refused | 23 | -- |
| **Published silently** | **25** | **6.1 - 75.4 cm (-85% to +91%)** |

`implausibleRangeOfMotion` fired on **none** of the 25. The athlete's reported 154 /
180.5 / 299cm were the visible tail of a much larger silent band. The flip between
refusing and publishing sits at a camera height of about **0.47m -- the height of the
bench itself**, so moving the phone from the floor onto an adjacent bench turns a loud
refusal into a confident 72cm.

So athlete-height calibration is now refused BY EXERCISE NAME for supine movements
(`isKnownSupineMovement`). Not by inspecting the landmarks: two shipped attempts to infer
posture geometrically were defeated by real footage and a third was defeated in
simulation before shipping. A bench press is performed lying down from every camera
angle, on every rep, for every athlete -- the name is the one signal no prop position
can fool.

`implausibleRangeOfMotion` also gained a FLOOR. It only ever had a ceiling, which catches
a scale read too large; the sweep shows under-reads are just as common, and a 6cm bench
press is exactly as impossible as a 299cm one.

#### What would actually measure a bench, and what it would cost

Shoulder breadth is the best in-plane reference: across the identical 48-position sweep
it gave 36.0-49.5cm, a **1.38x prop-to-prop spread against the height path's 12.4x**.
That ~9x stability gain is the real argument for it -- not accuracy, but that the same
lift stops giving three different answers.

Three findings shape how it must be built, and all three kill the obvious design:

1. **Do not fit `SHOULDER_BREADTH_FRACTION` against bar-sensor data.** The net error is
   the difference of two large opposing terms: geometry (J-path 5-20cm, camera pitch)
   biases LOW by 30%, while 0.245 against a modelled Vision shoulder span biases HIGH by
   21%. They partly cancel, which is why 0.245 looks accidentally right here. That
   cancellation is prop-dependent and fatigue-dependent (the J-path widens as the lifter
   tires), so fitting it bakes in a coincidence that is wrong in the other direction at
   the next camera position.
2. **A dispersion (CV or IQR) refusal gate is backwards.** Measured directly: full
   rep-phase coverage gives CV 5.7% and +6.5% error; lockout-frames-only gives CV 0.9%
   and -0.6%; chest-frames-only gives CV 1.0% and +14.7%. Narrow phase selection of a
   biased landmark is MORE self-consistent than broad sampling of an honest one, so such
   a gate preferentially refuses the good takes.
3. **It must not be a branch inside `impliedStandingHeightPixels`.** That would pollute
   the shared median. It needs its own function and its own sample pool, selected between
   rather than averaged, and gated on `isKnownSupineMovement`.

A regression scenario to respect: a back squat filmed from the corner of the rack with
the feet out of frame currently refuses correctly (fewer than 5 frames have both ankles).
An ungated shoulder branch would resolve on nearly every frame and publish a yaw-corrupted
number. The gate is what keeps that refusing.

**Free validation available with no calibration at all:** time-to-peak-velocity is
scale-invariant. A bar sensor reported 0.26s on footage that already exists. If the
tracker's own time-to-peak does not match that, no amount of scale work will fix the
numbers, and that is worth checking before building any of the above.

## Auditing the pipeline against the execution manual (2026-09-05)

The execution manual describes all 109 camera-trackable exercises one physical action at a time,
from the athlete tapping Start to the athlete tapping Stop. Reading it as a specification and
diffing it against what the code actually computes for each of the 413 seeded library exercises
turned up four defects. All four are now fixed. The per-exercise knowledge lives in
`client/src/lib/exercise-camera-profile.ts`, which is a plain data module with no imports.

### Seated lifts were silently over-scaled by about 30%

This is the one worth remembering. `isKnownSupineMovement` asked whether a lift is done lying
down, which is the right question for a bench press and the wrong shape of question in general.
`uprightEnough` is a DIRECTION test: it compares the head-to-ankle segment's vertical component
against that segment's own length. A seated athlete passes it comfortably, because their head
really is above their ankles. But their head-to-ankle span is roughly 0.77 of their standing
height (sitting height is ~0.52 of stature, and a bench adds ~0.25), so dividing real height by
that span produces a scale factor about 30% too large.

Every centimetre, metre-per-second and watt from a seated cable row, lat pulldown, leg press,
leg extension, machine press, preacher curl or seated calf raise carried that bias, with nothing
flagged. It is small enough to sail through `implausibleRangeOfMotion`, and that is exactly what
made it dangerous: a 4x error announces itself, a 1.3x error looks like a number.

The gate now asks about posture rather than about lying down. `standing` and `hanging` allow
height calibration; `seated`, `lying` and `supported` refuse it and withhold the numbers with a
reason specific to the posture.

Treating a strict dead hang as valid is an ASSUMPTION, not a measurement. The manual specifies
straight arms and a straight body for both pull-up and chin-up, which does span true standing
height, but an athlete who bends their knees breaks it the same way sitting does. Nobody has
checked this against real footage. A dip taken with the ankles crossed and an assisted pull-up
taken kneeling on the platform are both classified `supported` for that reason.

### The whole bench-press family was missing from the refusal list

A board press, pin press, Spoto press, Larsen press, JM press and Tate press are all performed
lying on a bench, and not one of them contains the word "bench". All six fell through the old
`/bench\s*press/` pattern and got a confident number. So did the incline dumbbell press,
chest-supported row, inverted row, reverse hyper, pullovers and the incline and decline flyes.

### The native tracker passed no starting direction at all

`summarizeTrackedSet` takes a `firstPhaseHint` that tells the rep segmenter which phase is the
concentric. The legacy dialog supplied one from the movementType taxonomy. The native AV path --
the one that actually runs on the phone, and the one being calibrated against bar-sensor ground
truth -- passed `undefined`, so every rep's concentric was decided by phase speed alone.

The taxonomy could not have covered it anyway. It has no answer for anything typed Push or
Press, which is every bench press and every overhead press, and it gets three exercises
backwards: a hang clean and a hang snatch both dip to the hang before they pull, and a step-up
drives up before it steps down. The manual answers all 91 bar-path lifts definitively, and that
table is now consulted first in both paths.

### Two mode-routing bugs, and one exercise deliberately left alone

`Med Ball Chest Pass` and `Med Ball Overhead Throw` are both seeded as category `plyometric`, and
the category test ran before the med-ball name test -- so two thrown-object exercises were routed
to jump tracking, which measures ankle displacement. The med-ball check now runs first. `Wall
Ball` and `Suitcase Carry` matched no pattern at all and fell through to bar-path tracking; both
now route correctly.

`Russian Twist` is left routed to bar-path on purpose, against the manual's own suggestion. The
manual notes it should be med ball but also admits the up-down tracker sees almost nothing there,
and med-ball mode's trajectory logic is gated to genuinely thrown, free-flying objects -- a
Russian twist holds the ball throughout. Neither mode measures it. It is classified `seated` for
posture, so it saves the video and withholds numbers rather than inventing them, which is the
honest outcome until a rotational tracker exists.

### ROM buckets

`expectedPatternFromName` was feeding two consumers at once: the ROM ceiling and the
pattern-mismatch trust penalty. The mismatch check only means anything across the four patterns
`guessMovementPattern` can return, so the ROM buckets now come from a separate function. That
split made two fixes possible. An Arnold press and a landmine press are overhead presses whose
names end in "Press", so they were getting the horizontal 0.5x ceiling instead of 0.7x -- tight
enough to reject a real rep. And 48 of the 91 bar-path lifts had no bucket at all and fell to a
1.3x default that catches almost nothing: a calf raise travels about 0.05 of standing height, so
a scale several times too large still landed inside the ceiling and reported as ordinary.

Six new buckets were added, all set generously on purpose. These are anthropometric bounds, not
calibrated thresholds. The job is catching a grossly wrong scale, not judging rep quality: a
false rejection throws away a real set's numbers, which costs more than letting a mildly odd
number through.

## What no longer needs a scale, and what is now measurable (2026-09-05)

Four changes, in the order they matter.

### Numbers that never needed a scale are no longer thrown away

A lift with no real-world scale used to save its video and withhold everything. That discarded
more than it had to. Rep count, how long each rep took, how much the bar slowed across the set,
how long it took to reach top speed, and how far it drifted as a share of its own travel are all
times or ratios, and metres cancel out of every one of them. Velocity loss in particular is the
number a velocity-based-training athlete actually trains against, it is a percentage, and it was
going in the bin alongside the metres it does not need. Bench and every seated lift now return
that half. Only the metres, the metres per second and the watts are withheld.

Reps are segmented relative to the take's own typical rep instead of against the 20cm floor,
which means nothing without a scale and does real damage with a wrong one: at a 4x-inflated scale
an athlete's settling wobble cleared it and 11 real bench reps became 18.

**The trace has to be normalised to a nominal size first**, and finding out why was the useful
part. The acceleration and velocity filters are stated in metres. Handed a trace in arbitrary
units they do not merely stop helping: one whose numbers happen to be large reads as a single
continuous physically-impossible event, so every frame is rejected and the peak collapses to the
ceiling. The same five reps segmented as four at one scale and eight at another until an
invariance test caught it. Normalising is safe precisely because everything reported is a
duration or a ratio, and multiplying every position by a constant changes neither.

There is deliberately no velocity field of any kind in the scale-free output. A number in trace
units per second would look like a speed, sort like a speed, and get compared against last week's
speed by an athlete with no way to know the units changed.

#### "The take's own typical rep" was being measured wrong, and a sticking point paid for it

The relative gate is 40% of a typical reversal, and the typical reversal was the MEDIAN of every
reversal an exploratory pass could find. That is only the size of a rep if reps are the majority
of what the pass returns, and they are nowhere near it. A ten-rep bench trace with a sticking
point came back as five separate amplitude populations -- pose noise, the dip itself, the
remainder of the press once the dip had split it, and two clusters of real reps -- and the reps
were the smallest of the five by count. The median landed a third of the way up a real rep, so
the gate came out below the dip, and the dip became a rep boundary.

That is the defect the OVR paired session found: ten presses reported as fifteen, per-rep peaks
spanning 0.24 to 1.96 m/s against the sensor's 0.91 to 1.10, while the set MEAN stayed within
3.5% because splitting a rep produces a fast half and a slow half that average out. The scale was
never the problem, and several builds were spent looking at it.

Two changes, and both are load-bearing:

**The median is taken over the large reversals only** -- strictest cut first (half the biggest
reversal in the take), dropping to a looser one only when the cut left too few values to take a
median of. A single cut does not work in both directions: too low and the fragments the dip
created stay in the population and drag the gate down onto themselves, too high and one wild pose
frame is the only thing that clears the bar.

**The calibrated path passes a real-world floor** of `MIN_REP_AMPLITUDE_FLOOR_CM`, and it is the
only thing that can tell a take of small reps from a take of no reps. A purely relative gate
cannot: with nothing but noise in the trace, the noise IS the large population, elects itself
typical, and 400 frames of wobble segment into 166 reps. The scale-free path still has no floor
and still cannot answer that question -- correctly, since pixel-space has no centimetres, but
anything consuming it needs to reject an empty take some other way.

A side effect worth knowing about: the better gate absorbs the lone-hand dropout bug outright up
to 30 degrees of camera tilt. `barPointFromSides` is still the actual fix and still the only
thing that holds at 45, but `lone-hand-trace.test.ts` had to narrow its reproduction to that
angle, and the comment there explains why that is the second time it has narrowed.

### The correct camera angle was being scored as a problem

`assessCameraAlignment` asks whether the athlete is squared up to the lens. That is the right
question for a front-view lift and the wrong one for a side-view lift, which is nearly all of
them. A correct side view puts one shoulder behind the other, so the shoulders stop being spread
across the frame, the check returned "unknown", and the take lost 10 trust points to the note
"Camera framing couldn't be confirmed". The one camera position almost every barbell lift
requires was scoring worse than a front view that cannot see bar drift at all.

Footage is now read for which way the athlete is actually facing and judged against the view the
lift needs. A genuine mismatch warns rather than refuses, because everything vertical is still
measured correctly from the wrong side; it is the forward-and-back drift that vanishes.

### Bar-path deviation and peak velocity are withheld on Olympic lifts

The bar deliberately loops back around the knees and in under the athlete. A technically correct
clean scores WORSE on straight-line deviation than a bad one hauled up in a straight line. Those
two numbers are inverted there, not imprecise, so they are withheld rather than shown with a
caveat. Range of motion, timing, velocity loss and rep count are unaffected.

### Thresholds can now be measured instead of argued about

Every threshold in this pipeline is a number somebody picked, because measuring one meant
re-running analysis over real captures and analysis only ever ran once, live, on a phone.

Sets already store their own bar-path trace, and that trace is the input to everything downstream
of tracking. `client/src/lib/capture-replay.ts` replays it, and `scripts/replay-captures.mjs`
runs a batch and diffs against a previous run, so a threshold change that fixes one set and
breaks four is visible instead of invisible. It needs no device, no camera, no video and no
database -- feed it a JSON array of stored set rows.

It is deliberately not a replay of the TRACKING stage. Turning frames into a trace needs the
implement trackers, the CoreML detector and Vision, none of which run outside the app, and
pretending otherwise builds a harness that tests a reimplementation.

**It has already found one thing.** Velocity loss is a ratio and survives losing the scale, but
the calibrated and scale-free paths segment reps differently -- an absolute centimetre floor
versus each reversal's size relative to the take's own typical rep. Same rep count, slightly
different rep boundaries, so the per-rep means the ratio is built from differ. On a synthetic
five-rep squat that is about 1.7 points on a figure near 10, roughly 16% relative. Worth knowing
before anyone compares a bench velocity-loss number against a squat one. The tolerance in the
test is not calibrated; it should be replaced with a measured bound once real captures have been
through the harness.

## A standing calibration pose is off the table

Do not propose one. Taking a standing reference at the start of a supine set would give real
centimetres and watts on bench with code that already exists, and it was considered and rejected
on 2026-09-05: the athlete taps start and gets to their lift. Nothing may be added to the capture
flow that asks them to pose, stand somewhere specific, or hold still for the camera first. The
scale reference has to come from the footage itself -- a plate, the bar, grip width -- or not at
all.

## Full camera-system audit (2026-09-05)

Roughly 13,000 lines across the native capture layer, the six tracker modes, the object
detector, the skill metrics, the trust scores and the video pipeline. Six confirmed defects
fixed. Several reported findings did NOT survive verification and are recorded at the bottom,
because a finding that looks right and is wrong costs more than one nobody raised.

### A transient server error was deleting the athlete's recordings

The worst of them. `flushPendingVideos` treated every `ApiError` as a permanent rejection and
called `clearPersistedVideo`, which deletes the file from disk and the manifest entry. Upload
rejects with `ApiError` for every non-2xx, so a 500, 502, 503, 429 or an expired session all
counted. Film five sets at a gym with no signal, reconnect on the drive home while the server is
cold-starting, and all five clips are erased with a message telling the athlete to re-record
footage that no longer exists.

The workout-log queue had the correct classification all along. The video path never got it. Both
now import one shared `isPermanentUploadRejection`, so they cannot drift apart again: only a 4xx
is permanent, and 401, 408 and 429 are excluded because all three succeed on a later attempt.

### The analysis loop had no autorelease pool

Not one `autoreleasepool` anywhere in the 2,700-line native plugin, and the per-frame loop runs
Vision pose estimation, optional hand pose, a CoreML detection and a camera-drift estimate.
Every autoreleased temporary from all four accumulated until the whole analysis finished --
thousands of frames' worth held at once on a minute of 1080p60.

That is the same memory pressure behind the "Cannot Complete Action" media-services reset that
cut the athlete's music mid-session. Dropping 4K to 1080p addressed one contributor; this was the
other, and it was still there. Wrapped after the sampling guards, since `break` and `continue`
cannot cross a closure boundary in Swift.

### Hip-shoulder separation could report 354 degrees as elite

The headline X-factor number for a swing. The hip and shoulder angle series are unwrapped
independently, each anchored to its own first frame, then differenced with `Math.abs` and no wrap
normalisation. An athlete whose hips read +176 and shoulders -178 has a true separation of four
degrees, near none at all, and was reported at 354 -- which clears every "not enough separation"
threshold and reads as world class. The number is the 95th percentile of that series, so a
wrapped frame is exactly the frame it selects.

### Kettlebell swings were counted twice

`segmentPhases` splits at every direction reversal, so one swing is two phases: the bell falling
back through the legs and the bell driving up. Bar tracking has always classified phases and
counted only the concentric ones; the kettlebell module pushed one rep per phase. A clean
ten-swing set logged about twenty.

### An unfinished drill was reported as a finished one

`detectSprintCrossings` returns a result whenever at least two checkpoints were crossed. A
5-10-5 whose two return legs never registered came back as a completed drill carrying a single
split. The arithmetic was self-consistent -- distance only summed the legs actually detected, so
the speed was right for the ground covered -- but nothing said it was a fraction of the drill.
It now reports how many checkpoints were crossed against how many the drill defines.

### The scale-free path was saving zeros

Found by re-reading the previous change rather than reported. The scale-free save inherited the
empty-metrics zeros for velocity, range of motion and drift, so a bench set showed 0 m/s and 0cm
rather than a blank. Zero is a different lie from absent: a chart plots it and a coach reads it.
Those fields are now explicitly null, which meant widening four types and teaching the
range-of-motion check that "no scale" means "no judgment" rather than "impossible".

### Reported but not confirmed

Worth recording so nobody re-investigates them from scratch:

- **A sprint drill terminating after its first leg.** The claim was that the dialog runs crossing
  detection per frame and finishes on the first non-null result. It does not: detection runs once,
  after recording stops, over the complete point array. The related real problem was the missing
  completeness check, fixed above.
- **Kettlebell speed clamped to the ceiling on garbage input.** Real, but not a kettlebell bug:
  bar tracking's own `robustPeakSpeed` does the same thing deliberately, and the two agree. It is
  a shared design decision worth revisiting on its own terms -- reporting the ceiling as though it
  were a measurement is still questionable -- not a defect in one module.

### THE BARBELL SHOULDER PRESS WAS MAPPED SEATED AND IS STANDING

Scott, 2026-10-06, reading the comparison: "Make barbell shoulder press standing, I am doing it
standing, a barbell seated shoulder press is something different."

That settles the push press row above and it is not cosmetic. `postureAllowsHeightCalibration`
is false for `seated`, so **every Barbell Shoulder Press ever filmed was denied its height
ruler** and scaled on the shoulder and 3D rulers alone -- which is exactly the candidate list
the 10-06 take carried when it read range of motion +15.6%. The library's own instructions said
"Seated, bar at collarbone ... removing leg drive isolates the shoulders more than a standing
Overhead Press", so the app was telling the athlete to sit down for a lift he does standing;
that text and the camera profile's "The seat, both plates" framing note are fixed in the same
change.

**Same class as the RDL hinge (2026-10-05), opposite direction.** There a ruler was wrongly
PRESENT and cost -7.0%; here one was wrongly ABSENT. Both were a static name-to-posture table
being wrong about a lift, and in both cases nothing in the pipeline could notice, because
posture has only ever been read off the exercise NAME.

What the corrected posture does to the number is NOT predictable from this export: the height
ruler was never computed on that take, so there is no candidate to add to the blend offline.
The next filmed shoulder press answers it.

### The frames now say what posture they saw -- `measurePostureFromFrames`

Two posture mislabels in two days, each costing a ruler, and neither visible in any export. So
the take now records what the BODY looked like beside what the exercise claimed:
`calibration.posture` (the profile's answer) and `calibration.measuredPosture`:

- `torsoFromVerticalDeg` -- median angle of the hip->shoulder vector from the image vertical.
  Near 0 standing or seated, approaching 90 on a hinge. This is what would have caught the RDL.
- `heightToShoulderRatio` -- median (ankle->shoulder vertical extent) / (shoulder span). This is
  what separates SEATED from STANDING, which the torso angle cannot, since both are upright.
  Compare against `MIN_HEIGHT_TO_SHOULDER_RATIO` (2.5). This is what would have caught the
  shoulder press.

**It measures and records, and nothing reads it back to choose a ruler.** One mislabelled take
is not evidence enough to let the frames outvote the library, and a posture that flipped
mid-pipeline would move every ruler under it at once. Both numbers are angles or ratios, so
neither needs a scale -- which is the point, since they have to be readable on a take whose
ruler is the thing in question. `measured-posture.test.ts` pins the three cases and the
no-override. The export carries the whole `trackingDiagnostics` column, so these arrive with
the build and need no Render deploy.

### The row's -18.6% is NOT a projection error, and that was worth ruling out

The obvious suspect, given a bent-over lift and a gravity-derived movement axis, is that the bar
travels diagonally and Forge reports only its vertical component. Measured off the trace, per
rep, the across-axis travel is 0.6 to 4.7cm on nine of the ten reps against 41-60cm along it, so
the full 2D path magnitude would raise the set's range of motion by **1.3%**, not 19%.

So the row is a genuine scale error, and on that take every ruler was low: `shoulder_width`
-13.0%, `body_3d` -36.3%, `depth` -45.2%. No voter was right, which is why the blend could not
save it. **No mechanism is proposed here on purpose** -- one paired take on this build, against
31.9 / 56.0 / 51.3 cm across one earlier session, is not enough to fit anything to. It is the
next thing to film deliberately.

### Still open, ranked

Not fixed here, in the order they are worth taking:

1. **Mixed coordinate systems between the 2D and 3D pose bridges.** The 2D bridge is image-space
   with a negated y and a scale factor applied; the 3D bridge is metres in a hip-relative frame
   with Vision's own y sign. The native plugin runs the 3D request on a stride of 3, so on iOS 17
   every third frame may be in a different origin from its neighbours. If that is real it would
   corrupt jump height, kettlebell speed and swing tempo. It needs verifying against a real
   device capture before anything is changed, because the fix is large and the failure is silent.
2. **Anisotropic pixels-per-metre in the implement tracker.** Shoulder span is measured with x and
   y scaled by different frame dimensions, then used to convert vertical offsets. If correct, bar
   range of motion is off by the frame aspect ratio whenever the object tracker contributes.
3. **The trust score can report 100 on a capture of someone standing still.** Nothing in it asks
   whether any rotation actually occurred.
4. **`armSlot` ignores depth**, so a genuine sidearm filmed from front or behind reads as 86
   degrees, "overhand", with no angle gate.
5. **The plate detector class is unreachable.** No call site can request it, though the training
   notes suggest it is one of the healthier classes in the shipped model -- healthier than the
   barbell and dumbbell classes the app does wire up.

## Three fixes from the audit's open list (2026-09-05)

### The two pose bridges really were in different coordinate spaces

I hedged on this in the notes above, saying it needed a device capture before anyone touched it.
That was half right and I should have gone and read it. Whether the spaces differ is settled by
reading; only how OFTEN the 3D path fires needs a device, and if the spaces differ the fix is
needed either way.

They differ, and the code says so itself. `visionJointsToWorldLandmarks` returns absolute
image-space pixels with the vertical axis negated. `visionBody3DToWorldLandmarks` returns metres
relative to the skeleton's root joint, the centre of the hip, per Apple's own convention -- the
native plugin's comment on `.position` states it outright. Every trace-building dialog picked
between them per frame with `body3D ?? 2D`, and the plugin runs the 3D request on a stride of 3.

A squat is close to the worst case: the bar rides the shoulders, which ride the hips, so in a
hip-anchored frame the wrist barely moves while its absolute height changes by half a metre. The
trace picked up a sawtooth at a third of the frame rate with an amplitude near the athlete's own
hip height. The implausible-velocity filter would then have discarded those frames and counted
each one as a tracking glitch.

The original comment at those call sites addressed the units and was right about them. The origin
is what was missed, and no sign correction fixes it. Six trace-building dialogs now use the
absolute 2D path consistently. Two single-frame posture captures still prefer 3D, correctly: a
hip-relative frame is fine for an angle or a ratio measured within one frame, and invalid only
for anything compared across frames. That rule now lives in the bridge's own comment.

Recovering the depth properly means re-basing the 3D landmarks onto the hip's absolute position
from the 2D bridge on the same frame. Worth doing, not done here: Vision's 3D vertical sign has
to be confirmed against a real capture first, and guessing it would replace a visible sawtooth
with a quiet inversion.

### Pixels per metre, and a correction to the audit

The reported finding was that `shoulderPixelsPerMeter` mixes axes and corrupts every vertical
distance the implement tracker contributes. That is wrong, and worth writing down so nobody
"fixes" working code. Normalized landmarks are normalized per axis, so multiplying x by width and
y by height recovers true pixels; the internal call site passes the real working dimensions and
is correct.

One caller was not. The web-detector seeding passed 1x1, asking for normalized-units-per-metre,
and its comment argued the scale works out the same either way. It does not: one x-unit spans the
frame's width and one y-unit its height. Shoulders are near-horizontal in every lift, so the
measured scale was effectively x-units-per-metre, and using it on the detection box's VERTICAL
offset understated that offset by the aspect ratio -- about 44% short on portrait video, on the
axis the bar actually travels. It now asks for true pixels per metre and converts both offsets in
true pixels.

### The plate detector is switched on for the lifts that have no scale

`plateScaleFromFrames` was fully built and had never once run, because nothing ever set the
tracking mode to "plate". The reference plate's measured diameter, the larger-axis rule for a
foreshortened plate, the averaging against a height-derived scale -- all of it was already there
waiting for a caller.

Any lift whose posture rules out height calibration now asks for the plate class. Those are
exactly the lifts with no scale at all, a barbell lift done lying down has loaded plates square
in frame, and the equipment classes cost nothing to give up: the shipped model regressed barbell
to about 0.02 and dumbbell to about 0.14 confidence, both far under the gate, while the plate
class came through that same retrain intact.

A plate box is a scale reference, not a second opinion on where the grip is, so it is deliberately
excluded from the position corroboration. That path rewards a detection near the fused point and
penalises a confident one further than half a metre away, and on a bench press the inner plate
legitimately sits about that far from the hands -- it would have docked confidence on every frame
for the plate being exactly where a plate belongs.

Held loosely, and instrumented to stay that way. The scale's source -- height, plate, or both
averaged -- is now recorded in the capture diagnostics, so the first numbers a plate produces are
attributable rather than blended anonymously into everything else. The plate class's supporting
data is eleven instances from three photos and the training script rebuilds from scratch each
time, so this needs measuring through the replay harness before a plate-derived scale is treated
as settled. It is a candidate for real bench numbers, not a promise of them.

## The squat's agreement with a bar sensor was two errors cancelling (2026-09-21)

Twenty captures exported from the admin report, eight of them back squats at 135 lb x 5,
filmed alongside an OVR bar sensor reading **75.7 cm ROM**. Set-level ROM averaged 75.4 cm.
That looks like a calibrated tracker. It is not, and the way it is wrong matters more than
the number.

**A terminal phantom rep -- the re-rack -- is being counted, and it is large.**

Six of the eight sets counted 6 or 7 reps on a set of 5. In every case the extra rep is the
LAST one, and it is the bar going back into the hooks:

| set | last rep ROM | last rep concentric | the set's real reps |
|---|---|---|---|
| seq10 | 122.6 cm | 7.23 s | ~1.3 s |
| seq11 | 134.2 cm | 2.50 s | ~1.2 s |
| seq15 | 141.2 cm | 6.30 s | ~1.0 s |
| seq12 | 77.8 cm | 5.00 s | ~1.1 s |
| seq16 | 56.8 cm | 3.93 s | ~1.0 s |
| seq4 | 87.3 cm | 1.90 s | ~0.8 s |

**The discriminator is concentric DURATION, not velocity.** An earlier attempt at this gate
used mean-velocity ratios and was reverted, correctly -- instrumented against the miscounting
sets, the edge phases came back at 0.99, 2.02, 1.21, 0.74 with no usable separation. Duration
separates cleanly: every artifact is 2.4x to 6.3x the set's median, and every real rep sits
within +-30% of it. A rule of "the last rep, when its concentric is >=2.5x the median of the
preceding reps OR its ROM is >=1.5x that median" fires on all six artifacts, on no real rep,
and lands five of the six sets on exactly the logged five.

**Then the ROM story inverts.** Drop the phantom and the remaining reps average **69.2 cm,
which is 8.6% UNDER the sensor** (sd 5.3, so the spread is real but not wild). The phantom's
enormous excursion had been dragging the set average UP onto the sensor's number. The tracker
under-reads real ROM by roughly 9% and the miscount was hiding it. Anyone comparing set
averages to a sensor and stopping there will conclude the squat is calibrated; it is the
per-rep numbers that show it is not.

Two sets in the same export are a different failure and should not be pooled with these:
- **seq5** reads 35-41 cm on every rep, about half of everything else -- a scale failure, the
  same class as the bench-press weakness above, not a segmentation one.
- **seq4** (the newest) counts 7, with a LEADING artifact too: rep 1 at 32.3 cm against a
  54 cm median. One instance is not a pattern, and no rule should be written from it yet.

**Bench is worse and has had no attention.** The same export has bench sets of 10 reps
segmenting to 1, 2, 2 and 4. The squat's +1 is a rounding error next to that.


## Bench press, 2026-09-22: segmentation and the shoulder-width ruler

One bench set (135lb x 10) filmed alongside an OVR bar sensor, plus the 19 other stored
captures replayed through `scripts/replay-captures.mjs`. Two separate defects, found because
the sensor gave a number to disagree with.

**Sensor:** 10 reps, mean 0.75 m/s, peak 1.08 m/s, ROM 14.7 in (37.2 cm).
**Forge, before:** 11 reps (device reported 9), ROM 18.9 in, mean 1.09 m/s, peak 1.86 m/s.

1. **A phase several times longer than the set's own reps was counted as a rep.** The un-rack
   and settle ran 6.4 s against a set median concentric of 1.03 s; every genuine rep sat
   between 0.83 s and 1.97 s. The long-duration test already existed but only ran on the FIRST
   and LAST concentric of a set, on the reasoning that a rack artifact can only sit at an edge.
   True of a rack artifact, false of the phenomenon. `isOverlongPhantom` now applies the same
   2.5x ratio mid-set. Across every calibration set no genuine rep exceeded ~1.3x its set's own
   median and the artifacts started at 2.4x, with nothing in between -- which is what makes a
   ratio test safe rather than a judgement call. Replay: bench 11 -> 10, two back squat sets
   6 -> 5, and the known residual phantom on set 11945 (recorded in `walkout-phantom-rep.test.ts`
   as a separate defect) went with it. No set moved the wrong way.

2. **Bench calibrated off SHOULDER WIDTH, and a supine athlete's shoulders point at the lens.**
   The take's only scale candidate was `shoulder_width` at 0.004981 m/unit; the same phone's
   squats, which calibrate off standing height, sat at 0.0035-0.0042. Dividing a real breadth
   by a foreshortened pixel span inflates metres-per-pixel and with it every distance and
   velocity in the take -- the 41% ROM error, and a velocity error LARGER than the ROM error
   because peak is additionally picked off single-frame jumps (see below). The existing guard
   leans on Vision's z, the least trustworthy axis it produces, and did not separate a supine
   torso at all. The torso's ORIENTATION needs no z: standing, shoulders-to-hips is near
   vertical in the image; lying down it is near horizontal. A torso nearer horizontal than
   vertical now refuses the frame.

**Still open, deliberately not guessed at:**

- **Peak velocity is picked off unsmoothed frame-to-frame jumps.** Even after the scale fix the
  peak error exceeds the ROM error (1.73x vs 1.29x on this set), and rep 1's curve carries a
  lone 3.00 m/s sample between neighbours of 2.36 and 2.61. That is a separate fix and needs
  its own evidence.
- **There is no bench ruler yet.** With shoulder width refused, a side-on bench has no scale
  source at all and takes the scale-free path. The plate candidate is the obvious ruler for it
  and is currently only produced on squats. Until then bench reports shape, not distance.
- **The Sept 8 bench sets had NO scale candidate** (`scaleSource: null`, fallback 0.00068 to
  0.0012 m/unit, ~4x too small) which is what produced the 7-9 cm ROMs and 19-second
  "concentrics" recorded earlier in this file. Same root area, not the same bug.
- **Box jump rep counts were untouched** by either fix and remain 4-9 against a logged 5.
  Different tracker (`jump-tracking.ts`), different work.

## Bench calibration, build 515: what the second set settled

Two bench sets of 10 at 135lb, same session, same camera position, both against an OVR bar
sensor. Set 1 was filmed on build 512, set 2 on 515.

**The segmentation fix works.** Set 2 found 10 reps against 10 logged. Set 1, replayed, went
11 -> 10. Nothing else moved.

**The shoulder-width ruler is not a ruler, and now there is proof rather than geometry.** The
same athlete's shoulders measured 88.0px on set 1 and 115.3px on set 2, minutes apart, with the
camera untouched: a 31% spread. The scales that came out were 0.004981 and 0.003799 m/unit,
against 0.0035-0.0042 for the same phone's squats. Set 2's ROM landed 10% over the sensor and
set 1's 41% over -- the closeness of set 2 is the ruler being wrong by less, not being right.

**The geometric refusal shipped in 515 and refused nothing.** It read the torso's orientation
out of `worldLandmarks`, which are body-centred, so a supine athlete's torso is "vertical" in
them exactly like a standing one's. Replaced with a refusal by POSTURE: `postureForExercise`
already says a bench press is filmed lying, it is known before a frame is read, and it cannot
be defeated by which landmark space the caller passes.

**The plate window is NOT too tight -- the bench plate read is junk.** This was the open
question the instrumentation was added for, and the number settles it: the detector boxed
582.8 x 567.4px at aspect 1.03, centred at (0.43, 0.46), against a grip span of 129.5px --
a ratio of 4.51 where a real plate on the same bar lands between 0.56 and 1.6. Taken as a
45cm plate it implies 0.00077 m/unit, five times smaller than any other source, which would
have put this set's ROM at about 8cm. `plateReadIsPlausibleAgainstGrip` rejected it correctly.
Do not widen that window; the work is in the detector.

**The per-rep numbers are noise even when the set mean is not.** Set 2's per-rep excursions ran
22.0, 31.3, 22.6, 50.1, 59.4, 56.1, 94.5, 29.2, 25.7cm against the sensor's 14.6-17.3in
(37-44cm) -- one rep at 94.5cm is more than double the next. The mean of 42.9cm sitting 10%
off the sensor's 39.0cm is two large errors cancelling, not a measurement. Peak velocity runs
0.33 to 2.93 m/s within one set where the sensor reads 0.92 to 1.12. **Any future scale work is
worthless until the trace itself is stable**: a correct metres-per-pixel applied to this trace
produces correctly-scaled noise.

That is the next piece of work, and it is a trace problem rather than a calibration one.

## Back squat against OVR, 2026-09-28: three separate errors, each with its own piece of code

Scott filmed a 135lb x 5 back squat beside an OVR bar sensor and exported the last twenty
captures (`/api/admin/tracking-report/captures/recent`). Sensor: 0.79 m/s mean, 1.22 m/s peak,
29.2in (74cm) range, five reps. Forge: 0.34 mean, 1.07 peak, 60cm, four reps. Those are THREE
errors, not one, and the export separates them. Recorded here so the next person knows which
file to open for which symptom.

**Mean velocity (0.34 vs 0.79) -- `trimPhaseToTravel` in `client/src/lib/bar-tracking.ts`.**
The concentric window used to start on speed: the first sample above a tenth of the phase's
peak. Every rep's stored curve shows the same shape at the bottom -- the bar wobbles up 1.7cm at
0.13-0.16 m/s, sinks back to 1cm, sits for half a second, then drives. The speed trim started
the clock on the wobble and counted the sit as lifting (1.4s of "concentric" for a 0.9s lift).
The window is now anchored on the peak and walks back to the last sample within 1cm of the
bottom, forward to the first within 1cm of the top. On rep 1 that lands on the same 0.9s the
sensor used. The centimetre was fitted to two sensor sets at once -- the squat above and the
bench fixture in `overlong-phantom-rep.test.ts` (sensor 0.75) -- and a share of range (1.8cm)
misses both. `concentric-window-matches-sensor.test.ts` walks that real rep through it.
Mean is now RANGE OVER THAT WINDOW, a sensor's definition, instead of the sample mean of
smoothed speeds; the two agree only when nothing in the window is slow.

**Peak (1.07 vs 1.22) and range (60 vs 74cm) -- the SCALE, `client/src/lib/pose-tracking.ts`.**
Both are 19% low, which is one number: the metres-per-pixel for this take. The scale came from
the height ruler (shoulder-to-ankle span against a fraction of the athlete's height) and was
correct on 2026-09-14 (73.6 vs 74.2cm, same athlete, same load) and 19% short today. The plate
was rejected correctly (it measured 494px against a 263px grip -- the detector locked onto
something 1.9 grips wide, not a plate). The shoulder-width ruler read 1.36x the height ruler;
on 09-14 it read 1.25-1.42x and the height ruler was right, so a blend is not the answer either.
What is different today is the camera geometry ("camera was angled" on every rep's trust note).
NOT FIXED. The candidate fix is a ruler at the bar's own height that assumes nothing about the
athlete: a plate the detector actually locks, or a measured shoulder width stored on the athlete
once. Do not "calibrate" this with a constant from one set.

**Rep count (4 vs 5) -- the edge filters in `summarizeTrackedSet`, same file.** The last
concentric of a set is tested for being a re-rack: too short, too slow, or too LONG (over 2.5x
the median moving duration). With the speed trim, a final rep followed by walking the bar into
the hooks could stay "moving" through the walk (a walk is faster than a tenth of a squat's
peak), read as one long phase and be dropped. The travel window ends when the bar reaches the
top, so the walk is outside it. Unverified on the export (the trace is not stored), so if the
next five-rep set still reports four, the rep-level `jumpEvents`-style log is the next thing to
add for lifts.

**Box jump (2 of 5) -- `summarizeJumpSet` in `client/src/lib/jump-tracking.ts`.** The state
machine has four ways to decline a candidate jump (dismount, a settle point floating above the
box, the recovery valve, a flight over 1.2s) and every one of them was a silent `continue`.
Every decision is now logged into `trackingDiagnostics.jumpEvents` with its time and the number
that decided it, on the no-rep path too. The next set answers this itself.

**The bench fixture was right by accident.** `overlong-phantom-rep.test.ts` pinned ten reps to
match the sensor. Rep by rep the ten were the un-rack (a 0.13s "concentric" at 2.1-4.0s, seven
seconds before the set) plus nine real reps, with the tenth real rep inside a 1.1s hole in the
trace at 18.4-19.5s where the tracker lost the bar. The travel window drops the un-rack; the
count is nine; the test now says so and why.

**What the diagnostics export now carries, and which code writes each field.**
- `recording.liveAttempted / liveFallbackReason / liveCoverage / liveDropRate` --
  `AvBodyTrackingPlugin.swift`, `liveAnalysisResult` and the file path's result. Why a take was
  analysed after the fact instead of during it. All twenty captures in the 09-28 export were
  "file"; none said why.
- `recording.analysisPath` -- which feeder produced the trace ("live" or "file").
- `jumpEvents[]` -- `jump-tracking.ts`, the state machine's decisions in take order.
- `repBreakdown[].concentricSeconds / meanVelocityMps` -- now the travel window and range over
  it (`bar-tracking.ts`, `trimPhaseToTravel` and the `phaseStats` block).
- The upload copy's presence is in the native diagnostic log ("upload copy: ... MB"), not the
  export: it is about the save, not the measurement.

### Same day, two additions queued for the next calibration build

Scott, after the OVR set: "For the barbell back squat let's track the bar too and the plates,
will only help boost accuracy on faulty body detectors", and "can the floor be detected? Would
that matter? Would it boost confidence?" Both held from shipping on his instruction: "queue them
so we can upload them with next camera calibration."

**The equipment votes on bar position -- `client/src/lib/equipment-bar-point.ts`, wired into
the per-frame loop of `av-bar-tracker-dialog.tsx`.** A barbell lift already asked the detector
for the plate (bar as the second class), but the boxes only ever set scale; the bar's position
came from the wrists and the motion-diff tracker alone, so a frame where the body tracker lost
a wrist produced no point. Now the bar box (preferred) or the plate box (fallback -- a plate on
the bar sits at bar height) fills exactly those frames, and only those. It earns the vote by
agreeing with the hands: the box-to-hands offset is learned on every frame that has both, and
the box may substitute only after `MIN_EQUIPMENT_AGREEMENT_FRAMES` of them whose spread
(median absolute deviation) is under `MAX_EQUIPMENT_OFFSET_SPREAD_GRIPS` of the athlete's grip
width. A lock on a rack plate never agrees with the hands for long and never votes. The
substituted point goes through the same `isPlausibleVelocity` gate as a hand-built one. On the
09-28 squat the plate lock was on the wrong object (494px against a 263px grip), so this would
not have fired there; the diagnostics say when it does:
- `trace.barPointFromEquipment` / `barPointFromEquipmentRejected` -- frames filled, and offered
  but refused by the speed gate.
- `trace.equipmentVoteLabel`, `equipmentAgreementFrames`, `equipmentOffsetSpreadGrips` -- which
  class earned the vote, on how many frames, and how far the agreement wandered. The spread is
  the number to revise the 0.25-grip threshold from.
Both thresholds are admitted guesses. Blending the equipment into frames the hands answered
was considered and not done: it would change the number on every calibrated take to fix the
frames on a few.

**Camera tilt, not floor detection -- `startGravitySampling` in `AvBodyTrackingPlugin.swift`.**
Vision has no floor detector and a floor line carries no scale, so it could not have fixed the
19%. What the floor would have said -- how the phone was pointed -- the accelerometer says
directly. CoreMotion's gravity vector is sampled five times a second for the length of the
recording and the median lands in `recording.cameraPitchDeg` (positive when the lens tilts
down toward the floor), `cameraRollDeg` (sideways lean) and `cameraTiltSamples`. Nothing is
corrected yet. Every rep of the 09-28 squat said "camera was angled" and no number said how
much; the next set will, and if the height ruler's error tracks the pitch, the correction is
`cos(pitch)` on the vertical span and belongs in `pose-tracking.ts` beside the height ruler.

## Build 553 on the phone, 2026-09-28 afternoon: what the second session found

Scott filmed set 2 of the same 135lb x 5 squat and a box jump on build 553 (the concentric
window fix), beside OVR. Sensor set 2: 0.91 m/s mean (0.87 / 0.93 / 0.94 / 0.91 / 0.94), 1.42
peak, 29.3in range. Forge on screen: 0.74 avg, five reps found (the edge-filter fix worked).
The capture never reached the server (see the save chain below), so the comparison is from the
screen only. Everything here shipped together on the next `beta`, with the two items queued
above (the equipment vote, the camera tilt).

**Every save after the first was refused, and the day was then deleted from the queue --
`workout.tsx` (the save's catch block) and `offline-queue.ts` (`runFlush`).** The debug
console: 57:09 save ok; 57:16 save fails "Load failed" (a transport error -- the request had
landed, the response had not); every save from then on gets 409 "updated somewhere else",
because the page still claimed the revision from before the lost one. Each 409 was queued;
Scott signed in as admin; the flush replayed the athlete's day under the admin session, got
403, and DROPPED it with "open that day and re-enter it". Two camera sets exist on the phone's
screen only. Fixes: (1) a 409 after a lost response re-reads the day, and when the stored
revision is exactly one ahead, adopts it and re-sends -- the day moved because of us; anything
else still reloads. (2) A 403 in the flush never deletes an entry; it waits for the account
that owns it. The owner stamp is null on an entry queued before the session resolved, which is
how it flushed under the wrong account at all.

**"Finishing" took twenty seconds -- `liveAnalysisResult` and the file re-read.** The live
trace was attempted on both takes and thrown out: coverage 0.37 and 0.46, drop rate 2.5 and
2.2 (the camera hands Vision two and a half frames for every one it finishes). So the whole
clip was re-read after Stop, which is the wait. On the 30s squat the file read was 33.6s, of
which the 3D body pose was 5.6s and hand pose 8.5s. The 3D pass is now OFF for the bar and
jump trackers (`body3D: false` at Record and at Stop, both feeders, same measurement), which
takes a sixth off the file read and helps live coverage by about the same. NOT ENOUGH ON ITS
OWN: the live path still hands Vision full 1920x1080 buffers where the file path decodes at
1280, and that is the next thing to change (`captureOutput` -> a scaled pixel buffer before
`processFrame`). The coverage numbers above are the target to beat: 0.9 keeps the trace.

**"Couldn't get a clean read" on the box jump -- `summarizeJumpSet`, `bestEffortJump`.** Rule
#1, and it fired anyway: the state machine declined every candidate (now logged in
`jumpEvents`) and the dialog reported nothing. There is now no null return for a trace with
samples in it: the best-effort read is the highest the ankle rose above standing, with the
flight around that peak if the trace shows one, flagged `bestEffort` on the rep and the set and
said so in the toast. `likelyTrackingGlitch` is set so it never becomes a PR.

**The torso-stillness check was deleting the bottom of the squat -- `torsoWasAtRest`.** The
export said the squat's torso was "still" (spread 0.093 grips) and 94 frames were rejected as
jumped pose. A squat set is mostly standing, so the median frame IS standing and the MAD is
small; the frames furthest from it are the bottom of every rep. Two rules now, either
disqualifies: a run of `TORSO_EXCURSION_MIN_FRAMES` (15) consecutive anchors more than half a
grip from the median is a lift, not a glitch; and a movement type that squats, hinges, lunges,
jumps or carries never gets the check. `torsoLongestExcursionFrames` is in the trace
diagnostics. This is a candidate for some of the "19% low" range, on top of the scale.

**The plate lock was on something 1.9 grips wide -- `candidateBoxIsUsable`
(`maxPlateSizeInYardsticks`) and `referenceObjectVerdict` (`MAX_PLATE_SIZE_IN_YARDSTICKS`).**
A plate is a 45cm disc and every barbell grip is wider, so a "plate" wider than a grip and a
quarter is filtered BEFORE the pick natively and refused as a scale ruler on the client. Both
1.25, pinned by `tracker-arbiter.test.ts`.

**The jump's own gravity ruler now corrects the jump -- `applyGravityCorrection`.** The box
jump reported 50.8cm from the height ruler while its own flight-time check said the scale was
45% out (uncertainty 0.125). When the verdict is under `GRAVITY_CORRECTION_MAX_UNCERTAINTY`
(0.2) and more than 5% from 1.0, every scaled number on the set is divided by the ratio and the
heights rebuilt from flight time; `uncorrectedJumpHeightCm` stays on the rep and
`gravity.applied` in the diagnostics says it happened.

**Box-jump contact is a reset -- `groundContactIsBoxReset`.** 2.7s of "ground contact" was
the step-down. The set-level average and the RSI are withheld as not applicable on a box jump;
per-rep times stay on `repBreakdown`.

### Build 554 beside OVR, same afternoon: the range gap closed, the jump gate found

Squat set 3, OVR: 0.95 mean (0.95 / 0.99 / 0.99 / 0.94 / 0.91), 1.47 peak (1.53 / 1.58 / 1.49 /
1.43 / 1.32), 29.2in. Forge 554: 0.75 mean, 1.66 peak, 28.2in (71.7cm), five reps, the first
flagged "tracking briefly lost" (a 2.07s hole; rep 1 runs 1.07s to 7.47s and includes the
walk-out). Reps 2-5: means 0.83 / 0.81 / 0.87 / 0.81, peaks 1.66 / 1.65 / 1.66 / 1.63.

- **Range is within 3.4% now** (was 19% low). `torsoJumpRejections` 0, `torsoStillThisTake`
  false, `torsoLongestExcursionFrames` 92 -- the torso fix did it. BUT the scale was "both":
  the height ruler alone (0.00325) would have read 64.6cm (13% low) and the shoulder ruler
  alone (0.00397) 78.9cm (6% high); the average landed near the sensor. Two rulers 22% apart
  agreeing by averaging is not a calibrated scale. Camera pitch was 14.6 degrees down on both
  takes (`recording.cameraPitchDeg`, first time recorded); it does NOT explain the height
  ruler's shortfall by simple foreshortening, because the bar travels in the same plane as the
  athlete and the ratio cancels. Still open.
- **Peak is now 13% HIGH** (1.66 vs 1.47) with range 3% low, so it is not scale: it is the
  derivative. With the bottom of the rep no longer deleted the smoothed speed overshoots at the
  drive. Sensor peaks fall across the set (1.58 -> 1.32); Forge's are flat. Next: compare
  `robustPeakSpeed` and the 165ms smoothing against the sensor's rep-by-rep peaks
  (`bar-tracking.ts`).
- **Mean is 13% low on the clean reps** (0.83 vs 0.96): Forge's concentric window is 0.87-0.93s
  for 70cm where the sensor's implied window is about 0.76s. The 1cm travel margin
  (`TRAVEL_ONSET_MARGIN_M`) is wider than the sensor's; a share of a centimetre less is the next
  thing to fit, on this take plus the 09-28 morning one.
- **The plate size gate worked**: the lock at (0.82, 0.16) -- top-right, the rack -- measured
  1.28 grips and was refused as `too_large_for_a_plate`; scale never touched it.
- **"Finishing" of 31s is the file re-read**: analysis 39.4s for a 27.5s clip, live coverage
  0.34 (worse than the morning's 0.37). Hand pose was 11.3s of the 39.4. body3D was 0 (off).
  The jump's hand pose was 7.2 of 16.5s and a jump never reads a hand: hand pose is now
  opt-out per take like body3D, and the jump turns it off on both feeders. The bar tracker
  keeps it. The live path still hands Vision full-size buffers; scaling them is the next
  change for live coverage.
- **The jump gate that declined every landing -- `boxTopWorldY` in `av-jump-tracker-dialog.tsx`.**
  Set 2's `jumpEvents`: takeoff, then `floating_above_box` on every settle, recovery valve,
  again, `flight_too_long`, dismount. The box top the gate used was the TYPED height (24in)
  at the take's scale, 187px above the floor; the detector's box implied a 23-inch athlete,
  i.e. a rectangle three times the size. Nobody checked they agreed, and every real landing on
  the box sat well above the typed line. The gate and the clearance now get a box top only
  when the two reads agree within `BOX_TOP_AGREEMENT_FRACTION` (25%) of the box height; both
  reads and the verdict are in `calibration.boxTopFromHeightM / boxTopFromDetectorM /
  boxTopCorroborated`. The 3.5cm best-effort read that came back is Rule #1 working: a wrong
  number that carried the events that found this.
- `baseline_reanchored -127cm` at 3.07s on the jump is unexplained: the standing ankle height
  moved 1.27m at the take's scale. Watch for it on the next set.
- The debug console now survives a force close (`client/src/lib/debug-console.ts`,
  localStorage, 400 lines, marked "app relaunched").

### Build 555 beside OVR: the head-on squat, and the box as a ruler

Squat (Scott's set 1 on 555, OVR set 4): sensor 0.84 mean, 1.24 peak, 29.6in. Forge 0.27 mean,
0.71 peak, 9.1in (23cm), five reps. Camera pitch 5.3 degrees -- a different placement from the
earlier 14.6, and the on-screen note said "filmed head-on or from behind".

**The bar point was not on the bar -- `bar-on-back.ts`, wired into `av-bar-tracker-dialog.tsx`.**
The stored trace moves about 20cm per rep (per-second y ranges -38 to -17cm) where set 3's
moves 73. Every frame had a body and both wrists at 0.8 confidence, no torso rejections, no
velocity rejections: the tracker was confident and wrong. On a back squat filmed from the
front the wrists are BEHIND THE HEAD, Vision places them near the shoulders, and they barely
move. The plate was edge-on (941 candidates, 404 refused by size, 537 by confidence, no lock),
so the equipment vote had nothing to vote with. The shoulders never lost the bar, because the
bar sits on them. On lifts named as bar-on-back (back squat, high/low bar, box, pause, tempo
squat, good morning, split squat, lunge, step-up; never front, overhead, zercher, press,
thruster, SSB, goblet, landmine) the combined bar point is now the shoulder midpoint, in the
same world space, before the speed gate. The hands still supply grip width (overwatch's
yardstick), tilt and the half-span. `trace.barWitness` says which ran and
`barPointFromShoulders` how often. This is the body tracker doing its own job; the change is
which joint is asked.

**The box is a ruler -- `applyBoxRiseCorrection` in `jump-tracking.ts`.** Scott: "Be mindful, I
am jumping to a 24 inch box." Jump set 3's box reps rose 73-77cm onto a 61cm box: the take's
scale was 1.26x. Gravity cannot rule a box set (no flat rep), but the typed box height is a
distance the ankle MUST rise by on every box rep, and the median rise over the box reps
divided by it is the scale error. Applied when at least two reps rose past half the box and
the ratio is more than 5% from 1.0; `boxRise` in the diagnostics carries ratio, reps and
whether it applied. The four box reps corrected to 61cm; the two 4-6cm "reps" between them
are the step-downs read as tiny hops (the yellow 14.6in and 18.6in chips), and are the next
thing to name in the events.

**Takeoff velocity is on the rep -- `JumpRep.takeoffVelocityMps`, chips in `workout.tsx`.**
Scott: "I'm looking for velocity and velocity stops when I land." It was computed and thrown
away after becoming a height. Re-derived after any scale correction.

**The gate fix worked.** Set 3's events: takeoff / rep on every box rep, no `floating_above_box`
(the detector's box top read 1.54m above the floor against the typed 0.61; `boxTopCorroborated`
false, gate off). `flight_too_long` twice at 1.6-1.8s are the step-down-and-reset stretches.

**Saves: every one landed first time** (3.5-4.2s for 4-5MB, no 409). The "ran out of offline
storage" toast came from the page's UNMOUNT re-queue, which queued the whole 5MB day on
navigating to /login although every save had synced; it then replayed under the admin session
(403, kept now, not dropped). `dirtySinceSyncRef` in `workout.tsx`: the unmount queues only
when something changed since a save reached the server. The 5MB localStorage ceiling for a
genuinely offline tracked day is still real and the queue should move to the Filesystem store
the video queue uses; not done here.

**Live coverage with hand pose off: 0.68 on the jump** (was 0.46), still 0.33 on the squat with
hand pose on. Scaling the live buffers remains the next native change.

### Build 556, same evening: the replay harness could not reproduce the device

Trying to fit the squat's peak overshoot and window margin offline, the harness ran set 3's
own stored trace and got means of 1.07-1.16 and peaks of 1.9 where the device had reported
0.83 and 1.66. Two causes, both closed: stored trace points carried no confidence (the device
filters samples under `MIN_TRACKING_CONFIDENCE` in `robustPeakSpeed`; the harness read every
point at 1), and the harness measured along the vertical where the device measured along the
grip axis and applied the movement profile's position scale correction. `PathTracePoint.c`,
`calibration.movementAxis` and `calibration.positionScaleCorrection` now travel with every
capture and `capture-replay.ts` reads them. Traces from before this build stay unreplayable
for calibration purposes; the fit waits for the first export after it. No constant was moved.

Hand pose is off for the bar tracker too (see the comment at the Stop call): the jump with it
off finished in 4 seconds on 556, the squat with it on took 30.

### The squat fit, 2026-09-28 evening: what moved, what did not, and why

Three OVR-paired back squats now exist with per-rep sensor numbers (morning set 1; 555 set 3;
556 set 2 = OVR set 5, shoulders as witness). Scott: "The goal is to get to 0% difference and
90+% confidence." What the fit found, so nobody re-derives it:

**Scale -- `reconcileScaleEstimates`, the body-pair blend. MOVED.** Height alone read 6%, 13%
and 19% low on the three sets; shoulder breadth alone 6-17% high; the mean of the two within 5%
on all three. The old rule averaged them only inside an agreement tolerance, so on two of three
it kept height alone. Now: when height and shoulder breadth are the ONLY rulers, they are
averaged whatever their disagreement, reported as `blended`, never as corroborated. A plate, a
measured grip or a learned bone still wins the cluster. Both rulers are population guesses;
the way to 0% on range and mean is a real ruler (a tape-measured grip typed once), not a
better blend.

**Peak -- NOT MOVED, and the reason is the finding.** Eight clean reps: Forge reads 11% high with
8% scatter. Extra smoothing lowers the mean ratio without touching the scatter (k=9 samples,
half a second, to reach 1.0) and a plateau rule (mean of k consecutive samples) does the same
-- so the overshoot is not the derivative and no constant fits it. The ratios CLIMB within each
set: 1.01 / 1.04 / 1.06 / 1.24 and 1.06 / 1.11 / 1.16 / 1.25. The sensor's peaks fall about 15%
from rep 2 to rep 5 (fatigue at RPE 8); Forge's stay flat. The means show the same. Raw secant
speeds over the stored SHOULDER trace (set 5) peak 1.34 / 1.41 / 1.32 / 1.31 against the
sensor's 1.51 / 1.47 / 1.42 / 1.27: flat in the trace itself, so it is Vision's joint
positions, not our maths. Range per rep is flat on both sides, so it is not scale drift. Next
test: sensor on the bar, Forge from the side, and a rep-by-rep look at the clip; candidates are
bar tilt ("~9 degrees toward the right arm", so the sensor's end of the bar moves differently
from the middle), or the shoulder joint sliding on the bar as the athlete tires.

**Window -- right on the shoulder set.** Set 5 concentrics 0.80-0.83s against the sensor's
implied 0.74-0.86s; the earlier 13% mean shortfall on the hands sets was the window, on the
shoulders set it is scale. Not moved.

**90% confidence** is a dataset problem: every trust threshold is an admitted guess and needs
about twenty sensor-paired sets across angles to calibrate. A week of sessions, not a change.

## Bench at an angle, 2026-09-29: three reps out of ten, and it was never the scale

Build 560, 135lb x 10, OVR beside it, phone on a rack post about 45 degrees off the foot of
the bench. The device reported THREE reps, a 116cm range of motion, a 0.87 mean and a 1.95
peak, and raised the scale-suspect banner telling Scott to film square to the side. The
sensor read ten reps, 0.70 mean, 1.01 peak, 14.4in (36.6cm). The stored trace is
`client/src/lib/__fixtures__/bench-oblique-2026-09-29.json` and the sensor rows are
`OVR_BENCH_OBLIQUE_2026_09_29` in `tracker-ground-truth.ts`.

**What went wrong, by piece of code:**

- **`segmentPhasesRelative` picked the setup as the typical rep.** The wrists were tracked
  from the walk-in, so the take's largest reversals were lying down onto the bench (153cm),
  the un-rack (120, 112, 192cm) and the re-rack (67, 80cm). Four of those cleared the 0.5 cut
  of `LARGE_REVERSAL_FRACTIONS_OF_MAX`, which is at least `MIN_REVERSALS_FOR_RELATIVE_GATE`,
  so "typical" came out at 136cm and the gate at 54cm. Twenty-three real presses at 26 to
  49cm fell under it. The three "reps" reported were lying down, a merge of the whole set,
  and standing up. The 116cm range of motion was the athlete's torso, not the bar.
- **`implausibleRangeOfMotion` then blamed the scale, and the banner blamed the angle.** The
  scale was within 10% (below). A rep-splitting fault produced a number the plausibility
  check could only read as a scale fault, and the copy on it told the athlete where to stand.
  That copy is gone (Rule #1 in CLAUDE.md now says so); the outcome still lands in the
  diagnostics as `scale_suspect` for this report.

**What changed, both in `bar-tracking.ts`:**

- **The athlete's rep count chooses among the gates the trace proposes.** `summarizeTrackedSet`
  takes `expectedReps` (the set's prescribed reps from the dialog, `loggedReps` in the replay
  harness). `relativeGateCandidates` lists every cut on the ladder plus a 0.2 and a 0.15 cut,
  the WHOLE extraction runs at each, and the gate whose final rep count lands nearest the
  athlete's number wins, ties to the strictest. The count is compared after the phantom
  filters, because a gate's raw phase count is not its rep count once the walk-in is split
  off. The athlete's number cannot invent a rep; it picks between answers the trace already
  gave. On this take the 0.2 cut (gate 20.8cm) found the ten presses at 9.7 to 21.0s.
- **A run of reps standing apart from the set is a rack move** (`isolatedRackMoves`). At that
  gate three phases survived every shape test: lying down (50cm, fast), the un-rack (21cm) and
  the re-rack (52cm, fast). Not short, not slow, not twice the median, and only two of them at
  an edge. What they share is isolation: a phase the shape tests threw out sits between each
  of them and the set. The surviving concentrics are grouped into runs; the largest run is
  the set; a run a quarter of its size or smaller goes. Two equal runs (a grip adjustment
  mid-set) are both kept.

**Replayed after the change** (`bench-oblique-rack-moves.test.ts` pins it):

| | sensor | device, build 560 | replayed |
|---|---|---|---|
| reps | 10 | 3 | 10 |
| range of motion | 36.6cm | 116.3 | 32.9 (per rep 22 to 52) |
| mean velocity | 0.70 | 0.87 | 0.58 |
| peak velocity | 1.01 | 1.95 | 1.63 (per rep 0.15 to 1.63) |

**What is still wrong, and whose it is:**

- **The per-rep spread is the tracker's, not the ruler's.** Range of motion per rep ran 22 to
  52cm against the sensor's 34 to 42, and per-rep peaks ran 0.15 to 1.63 against 0.94 to 1.12.
  The set median (32.9cm, 0.58 m/s) is within 10 to 17% of the sensor, so the shoulder-width
  scale (`shoulderWidthScaleFromFrames`, 98.9px, 0.00443 m/px) is roughly right at this angle.
  The noise is in the bar point: 252 of 548 usable frames carried a lone hand
  (`barPointFromLoneHandCarried`) and the point flipped sides 92 times
  (`barPointSideFlipped`). No constant was moved on the strength of this take; a scale fit
  from a trace this noisy would fit the noise.
- **The plate detector saw nothing.** `framesWithCoreMlImplement` 0, best candidate confidence
  0.34 against the gate, on a take where two bumper plates are in plain view. That is the
  ruler this lift wants (the shoulder one carries a tenth of uncertainty by construction) and
  it never voted. Open.
- **The 16:9 frame.** `activeFormat` read "16:9 fallback" because the format choice ranked
  120fps above the 4:3 shape; fixed in the same change (shape before rate,
  `applyHighestFrameRate`), so the next take has a third more picture down each side.
- **The two 09-28 bench sets** (seq 8 and 9 in the same export) replay to ten reps each now,
  but set 2's ten include fragments under 11cm; that trace has a 1.1s hole and the same lone-
  hand problem. Not fitted.
- **Peak velocity on the squats** is unchanged from the 09-28 evening fit: 11% high with the
  within-set drift, still Vision's positions, still open.

**Next filmed session:** three sets of five, one triple, one single, all with the sensor, any
angle. The single and the triple are the cases the rep count cannot help with (two runs of
one look identical), so they test the shape filters on their own.

## Rulers the camera finds by itself, 2026-09-29 afternoon

Scott: "I'm not measuring anything the camera should know. Everything should be remote." And:
"The camera has a 3d scanner and should be able to measure real world accurately based off of
the data I've uploaded, and the known height of the athlete." Then, on the plate: "the plate is
in there but it's distorted, again camera system should register that. Plate doesn't magically
change size at a different angle."

**The 3D skeleton is a ruler now** (`client/src/lib/body-3d-ruler.ts`, source `body_3d`).
Vision's 3D body pose reports every joint in metres relative to the hip, and a bone's length in
that space is the same whichever way the athlete is turned. The ruler is that length over the
same bone's longest 2D projection in the tracker's units (`measureLimbSpansInUnits`, the same
measurement the learned limb model divides by, read once and shared). Two kinds of metre:
`heightEstimation == .measured` (a depth sensor) is taken as is; `.reference` means Vision
scaled the skeleton to a reference stature, which it reports in `bodyHeight`, and the client
corrects every 3D length by (athlete's height on file / reference height). The native plugin
emits `body3DHeightM` and `body3DHeightSource` on each 3D frame for this. No height on file:
the reference skeleton is still offered, at 12% stated uncertainty (Rule #1). A correction
outside 1.35x either way is refused as a correction, not as a ruler. Trust order in
`reconcileScaleEstimates`: plate, measured grip, **body_3d**, learned bone, height, shoulders.
It is one candidate among the others and decides nothing alone (Rule #2). Recorded in
`scaleCandidates` as `body_3d:<bone>:<measured|reference_corrected|reference_uncorrected>`
with the bone length in metres and the 3D frame count.

**The plate at an angle.** Two facts, one fix, one open item:
- `plateScaleFromFrames` already reads the LARGER box axis as the diameter, and an oblique
  plate is an ellipse squashed sideways only, so the height it reads is the true 450mm at any
  yaw. The shape gate (`MAX_PLATE_ASPECT_RATIO` 2.5) accepts a plate up to about 66 degrees
  off square. The distance gate is in grip widths, and the grip and the plate's offset lie
  along the same bar, so they foreshorten together and the ratio holds at any angle. None of
  the gates was what refused the bench's plates.
- What refused them was that the model was never shown them: 902 frames, about 300 searches,
  FOUR plate candidates in the whole take (`candidatesSeenOfClass`). The search region was
  drawn around the wrists (or the last box), and from the foot of the bench the plates sit
  outside it. `AvCoreMlImplementDetector` now drops the region on every other unlocked search
  (`fullFrameSearchEveryNSearches`, telemetry `fullFrameSearches`), so a plate anywhere in
  shot is offered to the model; every candidate still clears the same gates afterwards.
- OPEN: the plate model itself. Its training set is a handful of instances from three photos,
  face-on. A squashed plate at 45 degrees may simply not score for it. If the next angled take
  still shows single-digit candidates with the full-frame searches counted, the fix is training
  data cut from Scott's own takes, not another gate.

**Parked: the bar's own length as a ruler.** Men's and women's Olympic bars share the same
1.31m between collars, which would make a ruler that needs no typing. Two reasons it is not
built yet: the shipped detector's barbell class is the one that regressed (see the dialog's
COREML notes), and unlike a plate the bar has no angle-invariant axis -- its projected length
shrinks with yaw and nothing in one frame says by how much. The 3D skeleton answers that
question (it gives the bar's direction from the two wrists, in metres), so the bar ruler is the
step after this one, built on it.

**Next: the box measures itself.** With the 3D skeleton the ankle height at rest on the floor
and at rest on the box is a height difference in metres, no typing. Not in this change.

## The camera audit, 2026-09-29 evening: every other tracker held to Rule #1

Scott: "Audit the rest of the cameras to make sure they work the same way, remember nothing
should reject video. Rule number 1." A sweep of all fifteen tracker dialogs found the bench
banner's sentence in eleven spellings, each attached to an empty save. What changed, on the
branch (held while 564 is tested):

- **Every post-take message is neutral.** "make sure your feet leave the ground clearly in
  frame", "try again with your whole body in frame", "make sure both hands and the kettlebell
  stay in frame", "Numbers are withheld rather than guessed" and the rest are gone. The athlete
  is told what happened and that the clip is saved, never where to stand.
  `no-framing-advice-after-a-take.test.ts` scans every dialog's string literals for the
  phrases and fails on the next one.
- **The jump, kettlebell and med ball trackers get the same rulers as the bar.** Each had one
  (standing height) and saved an empty set when it failed. `body-scale-fallback.ts` hands
  every dialog the 3D skeleton and the shoulder breadth as candidates, reconciled with height
  through `reconcileScaleEstimates`; the empty path is reached only when no body was seen at
  all. `scaleSource`, `scaleCandidates` and `scaleCorroborated` are now written by those
  dialogs too, so the report can say which ruler a jump or a swing used.
- **The web bar dialog keeps a take that measured nothing.** `bar-tracker-dialog.tsx` used to
  toast and send the athlete back to setup with no save; it saves an empty set to review now,
  same as the native dialogs.
- **A short mechanics capture is kept.** Both mechanics dialogs sent the athlete back to the
  camera under six frames; they analyse what there is and say it was short.

Still open from the audit: the med ball dialog empties the whole set when only the best rep's
peak is null (keep the other reps); the mechanics dialog nulls speed and distance without a
scale where the fallback rulers now apply (wire `bodyScaleFallbacks` there next); the
kettlebell and swing dialogs have no scale-free fallback of the bar tracker's shape when even
the fallbacks fail. None of those three prescribes an angle any more.

## Build 564 beside OVR, 2026-09-29 evening: the 3D ruler's first take, the re-rack, the plate

Set 2, 135lb x 10, phone at the foot of the bench. Sensor: 10 reps, 0.70 mean, 1.01 peak,
14.1in (35.8cm). Device: 11 reps, 0.35 mean, 0.59 peak, 19.3cm. Export seq 1; fixture
`bench-rerack-2026-09-29.json`. Three findings, each with its code:

- **The 3D ruler scaled the set 1.8x too small, off one bone** (`body3DScaleFromFrames`).
  `scaleCandidates`: `body_3d:torso:reference_corrected` 0.00207 m/unit (torso 0.563m over a
  272-unit 2D span) against `shoulder_width` 0.00368 (119 units). The shoulder ruler was
  within 5% of the sensor this time; the 3D ruler outranked it and lost the cluster. The 2D
  torso span was the fault: 272 units on a supine athlete whose shoulders span 119 is a hip
  landmark that was not on the hip, and the longest-bone rule took exactly that bone. The
  ruler now takes the MEDIAN scale across every bone measured both ways and records each
  (`calibration.body3DRuler`), so the next take says which bone disagreed. The correction
  itself (reference stature to the athlete's height) is not implicated; the torso came out at
  0.56m, which is a real torso.
- **The eleventh rep was the re-rack** (`isEdgeRackArtifact`): 20.1 to 21.6s, 12.4cm, 1.9x
  slower than the median rep -- under the 2.5x duration ratio and above the 0.5 amplitude
  ratio, so both shape tests passed it. Scott: "doesn't the camera know a bench press will
  move a certain amount of inches per rep?" It does, in `MIN_ROM_FRACTION_OF_HEIGHT` (bench
  0.08 of stature, 15.2cm for him). An EDGE phase under that floor is a rack move now. The
  segmenter itself still does not gate on the floor (an arched bench can be short and a wrong
  scale shrinks every rep together), and a scale-free trace never sees it. Replays to ten.
- **The plate was found 495 times and refused every time by the size cap**
  (`maxPlateSizeInYardsticks`, `MAX_PLATE_SIZE_IN_YARDSTICKS`). The full-frame search from
  build 563 did its job: `candidatesSeenOfClass` 4 became 495, best confidence 0.48. Eighteen
  cleared the confidence floor and all eighteen died at `candidatesRejectedBySize`. From the
  foot of the bench the near plate is much closer to the lens than the hands and reads far
  larger than the grip: perspective, not a rack. The cap moves from 1.25 grips to 2.0, the
  upper edge of the client's own plate-to-grip window, so the two gates agree; the distance
  gate still refuses the rack across the room. Both sides, pin test holds them equal.

**The frame.** 564 ran 1920x1440 at 60fps, 4:3, fov 72.0 of 74.6. Scott: "keeping the fps
higher is better ... Isn't the camera more accurate at 120fps? We should go back." Rate ranks
first again in `applyHighestFrameRate`: clean 4:3 at 120, then a BINNED 4:3 at 120 (a softer
readout is thinning, not cutting; `isAcceptableHighRate` used to refuse it outright), then the
16:9 crop at 120, then 4:3 at 60. Which of those this phone lands on is in the next console
line; "BINNED" is printed when it is that one.

**Not yet explained:** even with the scale corrected, per-rep peaks on this take ran 0.09 to
0.59 at a scale where the sensor's 1.01 would read about 0.55 -- so several reps' peaks are
still a third of the others'. Per-rep peak is the noisiest number the pipeline produces on a
lone-hand trace (`barPointFromLoneHandCarried` 121 of 556 here); the next take with the plate
locked is the one that separates ruler error from tracker error.

## Build 566 beside OVR, 2026-09-29 night: the 3D ruler wrong the same way twice, and the settle after the un-rack

Set 3, bench, 135lb x 10, phone at the foot of the bench, 1920x1080 @ 120fps (this lens has
no 4:3 format at 120, clean or binned; the log says so). Device: 12 reps, 0.48 mean, 19.3cm.
Sensor: 10 reps, 0.70 mean, 36.3cm (14.3in). Export `forge-captures-recent.json`, capture 1;
fixture `bench-settle-2026-09-29.json`.

**The scale, `body-3d-ruler.ts`.** Chosen source `body_3d` at 0.00246 m/unit (the shin,
reference-corrected); the shoulder ruler said 0.00413 and was called the outlier at 1.68x. The
sensor's ROM puts the truth near 0.0046. Replayed at the shoulder ruler's scale the set reads
32.4cm and 0.66 mean against 36.3 and 0.70 -- within a tenth, and the same story on sets 1 and
2 (shoulder within 10% on all three benches). So the 3D ruler was 1.9x small on set 3 after
being 1.8x small on set 2, and the fix on set 2 (median across bones) did not touch it, because
on set 3 EVERY bone read the same way: upper arm 176 units, forearm 159, femur 188, shin 209,
torso 273, shoulders 134, against a grip of 173 units. At the sensor's scale that is an 0.8m
upper arm and a 1m shin. The 95th-percentile "longest projection" is not the bone's square-on
view on this take -- with 82 body-suspect frames in 914 it is one of the jumped ones -- and the
legs are nearer the lens than the bar from the foot of a bench besides. The method is wrong,
not a bone.

- The plugin now emits every 3D joint in the CAMERA's frame as well (`cx`, `cy`, `cz`: the
  observation's `cameraOriginMatrix` inverted), beside the scene coordinates. A bone's visible
  length is then known per frame -- hypot of the camera-space x and y -- and divided by the same
  bone's 2D span on the same frame gives a scale sample with no maximum and no percentile to be
  captured by a bad frame. Median over (frame, bone, side), then across bones. A bone pointing
  at the lens (in-plane part under `MIN_IN_PLANE_FRACTION`) is skipped for that frame.
  `calibration.body3DRuler.method` says `in_plane` when this ran.
- Frames with no camera-space joints fall back to the longest-projection method, flagged
  `longest_projection`, at the widest uncertainty and DEMOTED below the shoulder ruler in
  `reconcileScaleEstimates` (`ScaleEstimate.demoted`). Still computed, still recorded, still
  joins an agreeing cluster; it no longer anchors one.
- `rejectImplausibleScales` gets the grip as a second yardstick (`gripWidthPx`, measured on 818
  frames here) because the body-height check had nothing to read: a lying athlete resolved a
  body length on 0 of 914 frames, so the check that saved the squats was silent on exactly the
  take that needed it. A candidate implying a grip under 0.2m or over 1.4m goes, with the grip
  it implied in `scalesRejectedAsImplausible`. Deliberately loose: set 3's bad candidate implies
  a 0.42m grip and survives it; the demotion is what handles that one.
- `body3DRuler.medianWristDepthM` is recorded (camera-space z of the wrists). With the lens's
  field of view (74.6 degrees, in `captureDeviceInfo.activeFormat`) that is a third ruler --
  metres per unit at the bar's own depth = depth x 2 tan(fov/2) / frame width -- and the next
  comparison can say whether it is any good before it becomes a candidate.
- The plate candidate (0.00141, "height" 319px) was rightly refused: a 45cm plate at 319px is a
  1.5m athlete. The box was the rack upright or the bench end, not the plate; the detector's
  training data (three photos) is still the open item.

**The count, `bar-tracking.ts`, the count-trim rule.** Twelve at every candidate gate: the ten
presses (12.1s to 23.0s, one a second) and before them 7.5-9.9s and 9.9-12.1s, the bar settling
over the chest after the un-rack. Concentrics of 14 and 17cm against a median of 19, 0.77s and
0.23s against 0.47, peaks at 0.6x the median: not short, not slow, not overlong, and contiguous
with the set so `isolatedRackMoves` cannot see them. Their descents are the tell (15cm in 1.5s,
12cm in 1.2s, a quarter of the set's descent speed), and a rule on that was written and
withdrawn in the same hour: set 11945 in `walkout-captures.json` is a real back squat whose
first descent is 59cm over 3.4s after a pause at the top, and it reads identically on the
clock. So the athlete's count decides how many, and the set's own medians decide which: when
every gate lands above `expectedReps`, the edge rep that sits furthest from the set's medians
(whole window, amplitude, descent speed, as summed log ratios) goes, one at a time, until the
count is the athlete's. Set 3's settles score 2.3 and 2.1, its real last rep 0.35, a real first
squat rep after a pause about 1.3. Bounded: never below the athlete's count, never more than two
from either end, never a rep scoring under 1.0. Replayed: 10 reps, 12.1s to 23.0s.

**Per rep at the shoulder ruler's scale**, reps 2-10 device vs sensor mean: 0.87/0.79,
0.79/0.74, 0.79/0.73, 0.47/0.68, 0.84/0.70, 0.55/0.71, 0.72/0.67, 0.86/0.71, 0.77/0.56 --
average 0.74 against 0.70, individual reps up to a third off either way. That spread is the
lone-hand bar point (92 carried, 16 side flips) and is the next thing after the scale.

**Still open from this take:** the lens has no 4:3 120fps format, so 16:9 at 120 is what a
rate-first chain gets on this phone; the per-rep spread above; the plate model.

### Queued after 569: the lone-hand carry and what the plate needs

**The lone-hand carry, `barPointFromSides` / `carryHalfSpan`.** Set 3's per-rep means ran up
to a third off the sensor either way with the set average within a twentieth, and 92 of its 914
bar points were a lone hand carried to the middle by the SET's median half-span, in short runs
mid-rep. The bar was tilted 26 degrees toward one arm, so half a grip's along-axis component is
17cm true; whenever the tilt at that moment differed from the set's typical tilt, the trace
stepped by the difference at the transition in and out, and a step is velocity as far as the
segmenter can tell. `carryHalfSpan` carries by the median of the measurements within the last
`RECENT_HALF_SPAN_FRAMES` (12) when at least `MIN_RECENT_HALF_SPANS` (3) exist -- a bar does
not change its tilt in a tenth of a second -- and by the set's median otherwise, which keeps
the stale-last-reading fix intact. Unverified against the sensor until the next take; what
makes it verifiable is the other half: every stored trace point now carries `s`, which witness
built it (`BarPointSource`: both hands, carried, carried-and-flipped, bare hand, equipment,
shoulders, interpolated), and `replayCapture` reports `repSources` per rep -- the inferred
fraction and the side flips -- so the per-rep spread can finally be read beside the number
that is suspected of causing it. The `s` tag is declared in `barPathPointSchema`.

**The plate detector.** Set 3's telemetry: 178 full-frame searches, 32 plate-class candidates
seen in the whole take, 28 under the 0.4 floor, best 0.48, one low-confidence accept (the rack
upright, 134x319px, rightly refused by the implied-height check). The low-confidence fallback
with the body as referee already exists in the plugin (`lowConfidenceAccepts`); lowering a
floor cannot help a model that fires on 32 of some 900 frames with the plate face-on in shot.
The model's plate class is eleven instances from three photos. What it needs is labelled
frames of Scott's own plates from his own gym, at the angles he films from, and a Create ML
retrain; nothing in this repo can do that without the photos. Not built.

### Build 569: the set that was counted right and never saved

Set 4, bench, the first take this pipeline ever counted correctly (10 of 10, device 0.71 mean
against the sensor's 0.77). The save answered `400 String must contain at most 40
character(s)`: `scaleCandidates[].source` was capped at 40 in `trackingDiagnosticsSchema` and
the 3D ruler's label had just grown to `body_3d:<bone>:<heightSource>:<method>` (up to 62). The
client classified the 400 as permanent and did not queue it. The set is not in the export.

- `shared/schema.ts`: the three `source` caps are 120. `shared/diagnostics-labels-fit-the-schema
  .test.ts` parses the longest label every ruler can produce through the real schema.
- `workout.tsx`: a 400 is queued like a 409. `offline-queue.ts`: a 400 on replay HOLDS the entry
  (`heldSince`, `lastHeldAttemptAt`) -- retried every ten minutes on the first day, hourly for
  a week, daily after that, and NEVER dropped (Scott: "It shouldn't be on the athlete to
  remember that for our server error"); after a week the athlete is told once that it is
  still trying, not asked to re-enter. `a-400-does-not-delete-a-set.test.ts`. The rule: our own validator refusing
  our own client's payload is a bug in the validator until proven otherwise, and the payload is
  the only copy of the set.

## Build 571 beside OVR, set 5: the rulers agreed, the count did not

Set 5, bench, 135lb x 10, phone at the foot of the bench, 1920x1080 @ 120fps. Device: 8 reps,
1.11 mean, 37.9cm. Sensor: 10, 0.77, 36.1cm (14.2in). Fixture `bench-dropout-2026-09-29.json`.

**The scale is right, and two rulers said so.** `body_3d:forearm:reference_corrected:in_plane`
at 0.00342 and `shoulder_width` at 0.00424 clustered (`scaleSource: both`, corroborated) --
the first take on which the in-plane method ran, and the first on which any two rulers agreed
on a bench. ROM 37.9 against 36.1 is 5%. `medianWristDepthM` 2.80m is recorded for the depth
ruler. The plate class fired 13 times in 122 full-frame searches; still the model.

**The count was the trace.** 270 of 629 bar points were a lone hand carried (43%), 79 side
flips, and a frozen carried stretch at 19.7-21.0s. Three things followed, each fixed in
`bar-tracking.ts`:

- The un-rack was a 70cm wrist jump in 0.23s -- 3 m/s -- and passed every ratio test. A phase
  whose travel over its moving time exceeds `MAX_PLAUSIBLE_LIFT_VELOCITY_MPS` is a phantom
  (`isImplausiblyFast`). A phase, never a take; never on a scale-free trace.
- Three pairs of real presses had a dip of 24-27cm between them, under the 28cm gate the count
  had chosen, so each pair was one 1.4-2.2s "concentric" and the overlong test deleted it.
  `splitMergedPhases`: a phase over 1.5x the median span with a reversal of at least half the
  median amplitude inside it is three phases (up, the dip, up). The finer gate had split them
  correctly and over-counted elsewhere, which is why a finer gate everywhere is not the fix.
- Three "reps" of lying down and settling (1.1-4.5s) stood apart from the set behind the
  un-rack phantom, and at 3 of 11 sat just over the quarter the isolation rule allows. With the
  total across runs above the athlete's count, a run standing apart from the largest goes
  first, smallest first (`isolatedRackMoves`, count-informed). At or under the count nothing
  changes: two runs of five on a ten are still a grip adjustment.

Replayed: 11 reps at 8.7-19.3s, 0.73 mean against 0.77, 31.3cm against 36.1. The eleventh is
one press split by jitter (21.9 and 23.1cm reps against a 30cm median), and two real presses
after 19.3s are gone with the frozen carried point. Both are the lone-hand carry; build 571's
witness tags (`repSources` in the harness) are what say so per rep from here on.

**From a tenth to a twentieth.** On this take the set mean is 5% off once the count is right;
the ROM is 13% off because the jitter-split reps are short. What is left is the trace, not the
maths: the carried lone hand is the whole residual, and the equipment (the bar or plate box)
is the witness that should carry those frames -- `barPointFromEquipment` was 1 of 629 here
because the plate lock held 135 frames. That is the plate model again.

## Build 572 beside OVR, set 6: within 5% for the wrong reason, and what 3% takes

Set 6 (logged as set 1 of a fresh day), bench, 135lb x 10, wrists 3.18m from the lens. Device:
10 reps, 0.81 mean, 26cm. Sensor: 10, 0.84, 35cm (13.8in). Ground truth
`OVR_BENCH_SET6_2026_09_29`. The count is right (the set 5 rules held: 564 of 646 bar points
from both hands this time, 6 flips). The mean is 4% off and it is a cancellation:

- **The scale is 26% low.** `body_3d:femur:in_plane` at 0.00303 won alone; the shoulder ruler
  at 0.00408 was called the outlier (1.34x) and would have given 35cm exactly. Set 5 was the
  other way round (in-plane 6% low, shoulders 16% high, their average 5% high). Neither body
  ruler is a 5% instrument: one is Vision's canonical skeleton scaled to a stated height, the
  other a population fraction of it, and each wanders by 10-25% per take.
- **The concentric window is 24% short.** Device 0.32s over the set (0.27-0.43 per rep); the
  sensor's ROM over its mean is 0.42s. ROM low and time short in the same ratio gave a mean
  within 4%. Set 5's window was right (0.49s against 0.47); set 3's 10% short. Fittable, now
  that three sensor-paired sets carry per-rep numbers, and not yet fitted.
- **The depth ruler read 8% low on BOTH sets 5 and 6**, at 2.80m and 3.18m: wrist depth from
  the camera-space 3D joints x 2 tan(fov/2) / the frame's long axis in units
  (`depthRulerScale`, `body3DRuler.depthRulerScale`, with `frameWidth`/`frameHeight` recorded so
  the harness can recompute it). A constant bias at two distances is the shape of a ruler that
  can be zeroed; the in-plane and shoulder rulers' errors are not constant. Recorded, not yet a
  candidate: the next sensor-paired take says whether 8% holds.

**From 5% to 3%, then 1%, in order:** a ruler that is not a body proportion (the depth ruler if
its bias holds, the plate when the model can find one); the concentric window fitted to the
sensor's per-rep windows; the equipment box carrying the frames the hands miss; and last, a
per-athlete zero from a sensor-paired session, the way any instrument is zeroed.

## Build 573 beside OVR, set 7: the count held, the rulers agreed, and the window is the residual

Set 7, bench, 135lb x 10, wrists 2.67m from the lens, bar tilted 29 degrees in frame. Device:
10 reps, 0.93 mean, 38.3cm, `scaleSource: both` at 0.003815. Sensor: 10, 0.77 mean, 36.6cm
(14.4in). Ground truth `OVR_BENCH_SET7_2026_09_29`; fixture `bench-set7-2026-09-29.json`,
pinned by `bench-set7-count.test.ts` (ten reps, the un-rack settle folded into rep 1's window).

- **The count is right for the third set running.** The set 5 rules (`isImplausiblyFast`,
  `splitMergedPhases`, count-informed isolation) have now held on sets 5, 6 and 7.
- **The scale is 4.5% high, and both body rulers said the same thing.** In-plane 0.0038,
  shoulders 0.00383, sensor-implied 0.00365. Their average (`both`) is what shipped. After
  set 5 (in-plane 6% low, shoulders 16% high) and set 6 (26% low, 0.5% low) this is the first
  take where the two agreed, and they agreed on a number 4.5% off, which is the shape of a
  shared bias rather than two wanderers cancelling.
- **The depth ruler read 13% low** (0.003176 against 0.00365), after 8% and 8% on sets 5 and
  6. Not the constant it looked like at two distances. Three readings, 0.92 / 0.92 / 0.87:
  `DEPTH_RULER_BIAS` is their mean, 0.9, and `depth-ruler.test.ts` pins the mean to the
  constant so the next sensor-paired set moves it in one place. With the three rulers blended
  (`BODY_RULERS`) set 7 replays to within 5% of the sensor; sets 5 and 6 within 3%.
- **The velocity residual is the concentric window, not the scale.** With the scale 4.5%
  high, mean velocity is 21% high (0.93 against 0.77): the device's windows ran 0.33-0.47s
  against the sensor's 0.475 (range over mean). The trace is the reason: 230 of 720 points
  carried by one hand (`PathTracePoint.s`) and 80 side flips, so the arrival at the top
  flickers and the window closes early. A cleaner trace (the plate model, once Scott's photos
  train it; the equipment box carrying the frames the hands miss) is the fix; a rule fitted
  to the jitter is not, and two such rules were tried and discarded this build (a rise-time
  window broke every fixture; an end-mirror in `trimPhaseToTravel` moved nothing).
- **The head-on toast is gone from the athlete's screen.** `cameraViewMismatch`'s note
  ("Filmed head-on or from behind ...") was still toasted after a take. It is
  `trackingDiagnostics.cameraView` now, with the facing and the expected view beside it;
  `no-framing-advice-after-a-take.test.ts` refuses the toast. Rule #1, 2026-09-29 clause.

## Build 578 beside OVR, the first squat since the window was fitted: the window is the drive

Back squat, 2026-10-01, 135lb x 5, filmed head-on from the front of the rack (Scott's photo:
phone upright at the rack, the plates both visible). The shoulders carried the bar on 602
points. Ground truth `OVR_SQUAT_SET1_2026_10_01`; fixture `squat-set1-2026-10-01.json`,
pinned by `squat-drive-window.test.ts`.

| | Device (578) | Sensor | Replayed (579) |
|---|---|---|---|
| Reps | 5 | 5 | 5 |
| Range of motion | 69.9cm | 72.9cm | 69.9cm |
| Mean velocity | 0.65 m/s | 1.00 | 0.95 |
| Concentric window | 1.11s | 0.73s | 0.75s |
| Peak velocity | 1.27 | 1.60 | 1.45 |

- **Count exact and range of motion within 4%; the time was wrong.** The centimetre travel
  margin (`trimPhaseToTravel`) was fitted on a single squat rep on 09-28 whose bottom wobbled;
  this squat's bottom is a dead-flat 0.6s sit within a centimetre of the floor of the rep,
  and the margin counted the sit as lifting. Mean velocity 35% low with the distance right.
- **The window is now the drive** (`trimPhaseToDrive`, `DRIVE_ONSET_FRACTION` 0.07): open
  at the last sample before the peak still under seven hundredths of that rep's peak speed,
  close at the first after it that drops under the line. The sensor's definition, in effect.
  Swept through the real pipeline on six sensor-paired sets: at a tenth every take read 7%
  short; at seven hundredths the three clean benches land within 4% of the sensor's window
  (0.46/0.475, 0.49/0.48, 0.50/0.47) and the squat at 0.75/0.73. No per-lift table needed.
- **Two windows, two jobs.** Every phantom and rack-move filter was fitted on the travel
  margin's duration, so that window still decides which phases are reps; the drive window is
  what is reported (concentric seconds, mean, peak, time to peak). Same split as `speedsMps`
  against `speedsReportedMps`: changing what a number is read over must not change which reps
  exist. Counts on every fixture are unchanged.
- **The set's mean is distance over time**, not the average of the reps' ratios. A rep whose
  hands dropped out mid-drive gets a short window and a mean of 1.2 on a set lifted at 0.8;
  summing distance and time weights it by what it was. On the 09-30 benches the average of
  ratios ran 12-18% over the sensor, distance-over-time 2-5%. Mean power follows.
- **Replayed, ratio to the sensor's mean:** squat 0.95, bench 7 1.05, bench 10 1.03, bench 5
  0.94, bench 6 0.79 (its scale is the 26% in-plane miss from 09-29, unchanged here).
- **Peak is still 10% low on the squat** (1.45 against 1.60). The 165ms velocity smoothing
  flattens a 0.7s drive's peak; a bench at 0.45s would be flatter still, and the bench peaks
  read within 2% because they are bounded by the mean and averaged. Open.
- **The box jump from the same session** read 65.8cm with the box as its ruler and two reps
  inside it at 81 and 74cm. Nothing has ever checked the jump tracker against anything; Scott
  will jump with the OVR on next time, and its range of motion is the comparison (hip rise
  from standing to the top), not a velocity, which the jump path does not report.

## Build 578 beside OVR, squat set 2 and a jump squat: the oblique squat's window is wide

Same session as the squat above, 2026-10-01, filmed on build 578 before 579 reached the phone.
Ground truth in `OVR_SQUAT_SET2_2026_10_01` and `OVR_JUMP_SQUAT_2026_10_01`; the squat's fixture
is `squat-set2-2026-10-01.json`, pinned in `squat-drive-window.test.ts`.

**Squat set 2, oblique (`cameraView.subjectFacing: oblique`), shoulders carrying the bar.**

| | sensor | phone (578) | replay (579, drive window) |
|---|---|---|---|
| reps | 5 | 5 | 5 |
| range of motion | 67.3cm | 66.0 | 66.0 |
| mean | 0.93 | 0.77 | 0.77 |
| peak | 1.56 | 1.07 | 1.07 |
| concentric (range over mean) | 0.72s | 0.88 | 0.88 |

Set 1 moved from 0.65 to 0.95 under the drive window; set 2 does not move at all. The per-rep
windows are 0.80-0.93s against the sensor's 0.70-0.78s, so each rep is ~0.15s wide, and the
velocity curve is a flat plateau at 1.04 m/s from 20cm to 44cm of travel where the sensor saw a
1.56 peak. The sit in the hole IS trimmed (the samples under 7% of the peak are dropped, as
designed); the width is in the drive itself.

**Smoothing is ruled out as the cause** (`VELOCITY_SMOOTHING_MS`, replayed at 165, 100 and 66ms
across both squats and benches 7, 9 and 10):

| smoothing | squat1 mean/peak | squat2 mean/peak | bench7 | bench9 | bench10 |
|---|---|---|---|---|---|
| 165 | 0.95 / 1.45 | 0.77 / 1.07 | 0.87 / 1.11 | 1.71 / 1.79 | 0.82 / 1.08 |
| 100 | 0.95 / 1.48 | 0.77 / 1.08 | 0.87 / 1.14 | 1.62 / 1.77 | 0.82 / 1.14 |
| 66 | 0.95 / 1.79 | 0.77 / 1.34 | 0.87 / 1.40 | 1.68 / 1.94 | 0.92 / 1.40 |

The mean never moves, because it is range over the window and the window is set by the
threshold crossing, not the smoothing. The peak climbs at 66ms on every set, including the ones
already on the sensor, which is noise being counted, not a lift being recovered. 165 stays.

**Open suspect: the shoulder witness on an oblique view.** Both squats were carried by the
shoulders (`barWitness: "shoulders"`); set 1 head-on landed, set 2 oblique did not. The 2D
shoulder landmark is a joint estimate, and on a rotated torso Vision can drift it along the
trapezius as the athlete rises, which would stretch the window in time while leaving the total
rise (range of motion, correct here) alone. The test is a take where the plate carries the bar
on the same lift (`barPointFromEquipment` was 0 on both; the plate vote agreed on 45 frames and
was outvoted), or the replay with the bar point taken from the hands where both were seen (642
frames). Not done tonight; the fixture is in place for it.

**Jump squat on the sensor.** Scott: "I noticed ovr was a little short, but it also starts
about 3 inches above the ground, so not a great measurement but, good start." The sensor's range
of motion on a jump is the tether's travel from the bottom of the countermovement to the apex;
the camera's jump height is takeoff to apex. Different quantities, so recorded and not held
against each other. What the sensor does give is a velocity: peak 3.16 m/s, which by v^2/2g is
~51cm of rise after peak velocity. The camera read 63-69cm per rep (72.3 for the set) on a 24in
box. The camera's takeoff velocity is computed per rep (build 556) but is not in the export; add
it to `jumpEvents` or the rep breakdown before the next paired jump, or this comparison cannot
be made either.

## Build 580 beside OVR at the hip: the box jump's takeoff velocity is 20% high

2026-10-01, the sensor on a finger with hands on hips, five box jumps to 24in (the sensor's own
rep 1 was Scott grabbing the cord; ignored). `OVR_BOX_JUMP_HIP_2026_10_01`.

| rep | sensor peak m/s | camera takeoff m/s | sensor ROM in | camera height in |
|---|---|---|---|---|
| 1 | 2.75 | 3.47 | 27.0 | 27.1 |
| 2 | 3.00 | 3.46 | 27.0 | 26.9 |
| 3 | 3.19 | 3.47 | 27.2 | 29.0 |
| 4 | 2.82 | 3.55 | 27.4 | 28.2 |
| 5 | 2.84 | 3.51 | 28.5 | 29.4 |

The camera's takeoff velocity is high by 10-26%, about 20% on the set, and flat across reps
where the sensor varies by 15%. On a box jump `takeoffVelocityMps` is rebuilt from flight time
and the net rise onto the box (`applyBoxRiseCorrection`), so it inherits the scale through the
net rise, and the ankle lands on the box with the knee bent. The sensor's range of motion
(dip bottom to apex) lands beside the camera's jump height, which is a coincidence of two
different quantities, not agreement: once the countermovement is on the phone the camera's
matching number is `concentricRiseCm + jumpHeightCm`, and it will read higher than the sensor
if the height is right. A flat jump with the sensor at the hip is the take that settles both.

Squat set 3 the same morning: sensor 0.85 / 1.28 / 27.9in (`OVR_SQUAT_SET3_2026_10_01`); the
camera side waits on the export.

A Render deploy from PR #199 landed while this session was being filmed and the app showed
"Can't reach Forge" on a comment POST. The sets queued. Do not merge while Scott is testing.

## Queued: the tracker that films a set follows the exercise (the med ball that met the bar tracker)

2026-10-01. The ten-throw med ball set above came back from the camera as FOUR bar-path reps
(0.66, 2.57, 1.46, 2.14 m/s), a 51cm "range of motion" and `scale_suspect`, with
`medBallRepBreakdown` empty: `trackingLevel: "full"`. The program exercise was saved under the
generic level before `VideoTrackingToggle` learned to pick `med_ball` from the name, and
`workout.tsx` routed the dialog on the saved level alone. Both trackers did what they do; the
wrong one ran.

`client/src/lib/resolve-tracking-mode.ts` is now the one resolver, read by the toggle when
tracking is switched on and by the workout page when the item is built. A SPECIFIC saved level
stands (the coach's decision); a GENERIC one ("full", "bar_path") resolves from the exercise's
name and its library equipment ("Medicine Ball" catches a throw whose name never says ball);
"none" stays off. Category is read only by the toggle at switch-on (plyometric -> jump): a "full"
already saved on a barbell jump squat is a bar lift the coach kept as one, and remapping it at
capture time would change what an existing program films. `resolve-tracking-mode.test.ts`.

The squat the same morning, set 3, is the first on the drive window on the phone: 5 reps, ROM
within 2%, mean 1.14 of the sensor (sets 1-3 of the session: 0.95, 0.83, 1.14). The per-rep
window wanders +-0.1s against the sensor's; see `OVR_SQUAT_SET3_2026_10_01`. The box jump with
the sensor at the hip replayed from the export matches the screen (`jumpBreakdown` is in the
export now; `countermovement` arrives with the queued build).

## Med ball throw beside OVR, 2026-10-01: the sensor side

Ten throws of a 12lb ball, the sensor on a box with the tether horizontal to a finger
(`OVR_MED_BALL_THROW_2026_10_01`; the sensor's reps 1 and 7 were cord setup, ignored). Peak 5.59
to 7.15 m/s, 6.6 across the set; mean 1.9 to 3.8; tether travel 49 to 57in. The camera's
matching number is `peakHorizontalSpeedMps` per rep (build 580), held against the sensor's
peak; the sensor's mean spans the tether's whole travel, which the camera's throw window does
not define yet. The camera side is written when the export arrives.

## Queued: the loading dip and the drive, read off the hip (jump)

Added 2026-10-01. Scott: "Will the camera differentiate between the loading drop portion, and
the rise concentric, back to the landing eccentric?" It did not. The jump tracker marks three
MOMENTS from the ankle trace (takeoff, landing, next takeoff) and the dip happens at the hip,
which no jump number read. "Build it. Queue it. Upload with next calibration batch."

**Body tracker, one more reading from the same sensor; nothing removed, nothing appointed.**
`deriveHipPoint` (pose-tracking.ts) is the hip midpoint; the jump dialog builds a hip trace
beside the ankle trace from the same scaled frames and hands it to `summarizeJumpSet` as
`options.hipTrace`. `measureCountermovement` (jump-tracking.ts) reads, per rep, off the
Kalman-smoothed hip y, walking back from the ankle's takeoff instant:

- the **drive**: back while the hip was lower earlier, with 1cm of hysteresis
  (`COUNTERMOVEMENT_HYSTERESIS_M`); the lowest hip is the bottom;
- the **eccentric**: back from the bottom while the hip was higher earlier, to the standing
  level, then forward to the last moment the hip was still within 1cm of it (a still hip
  jitters under the hysteresis for as long as the athlete stands, and the first cut counted the
  whole stand as the eccentric);
- bounded by the previous landing and `COUNTERMOVEMENT_MAX_SECONDS` (2.5).

`JumpRep.countermovement` carries `dipDepthCm`, `eccentricSeconds`, `eccentricMeanVelocityMps`,
`concentricSeconds`, `concentricRiseCm`, `concentricMeanVelocityMps`, `concentricPeakVelocityMps`
and the two timestamps. It is attached BEFORE the gravity and box-rise corrections so both scale
it by the same ratio as the heights (`scaleCountermovement`; durations are clocks and stay).
Null, never a number, when the hip did not dip. It reads nothing the state machine decided
from, so it cannot move a rep count. Declared in `jumpBreakdownEntrySchema`.

**What it makes comparable, for the OVR on a finger with hands on hips:** the sensor's mean
velocity is the drive's mean, which is `concentricMeanVelocityMps`; its peak is
`concentricPeakVelocityMps` (and `takeoffVelocityMps` from flight time is a second read of the
same instant); its range of motion is the tether's travel from the bottom to the apex, which is
`concentricRiseCm + jumpHeightCm`. The two previous jump pairings could compare none of these.

`jump-countermovement.test.ts`: a synthetic hip (30cm dip over 0.4s, 36cm drive over 0.3s) read
within 1cm and 0.05s; a still hip returns null; the window does not reach past the previous
landing; a correction scales the centimetres and not the clocks; the dialog wires the trace and
both corrections scale it.

## Build 580: the export carries every per-rep number, and the med ball gets the sensor's axis

Added 2026-10-01 for the next two sensor pairings Scott described:

- **Box jump with the OVR clipped to the shoe laces**, the sensor on the floor, the tether
  starting about 3.5 inches off the ground. Scott: "that needs to be added to our total." A
  tether reads a CHANGE in length, so the starting height does not add to its number: the laces
  rise the same distance whether the clip starts at 0 or at 3.5 inches. What the offset does do
  is sit the sensor's zero at the laces rather than the hip, so the sensor measures the FOOT's
  rise (standing to apex) and the camera measures the hip's (takeoff to apex). A tucked landing
  on a box lifts the feet further than the hips. Both are recorded (`OVR_JUMP_SQUAT_2026_10_01`
  and the next entry); neither is corrected toward the other until a flat jump, where the feet
  and hips rise together, says which way the gap runs.
- **Med ball throw with the OVR on a box, tether pulled out horizontally to a finger.** The
  sensor reads the component of the hand's motion ALONG the tether, which is the room's
  horizontal. The camera's `peakSpeedMps` is the in-plane speed (x and y together). So each
  med-ball rep now also carries `peakHorizontalSpeedMps` (the ball's image-x speed, same 95th
  percentile pool) and the two witnesses before the blend, `ballSpeedMps` and `wristSpeedMps`,
  so the comparison can say which witness was right rather than only how the blend did. Image-x
  is the room's horizontal only as far as the phone is level; `recording.cameraRollDeg` says how
  level it was. `medBallRepBreakdownEntrySchema` declares all three (a zod object strips what it
  does not declare).

**The export was missing both modes' per-rep numbers.** `jumpBreakdown` (per-rep
`takeoffVelocityMps`, `flightSeconds`, `jumpHeightCm`, `peakHeightCm`) and every `medBall*`
column were written on every capture and never read by `/api/admin/tracking-report/captures/recent`,
which is why the 2026-10-01 jump could not be compared on velocity. Both are in `reported` now.
That half is server-side and ships on Render; the med-ball fields are client-side and ship in
the build.

## Build 578 beside OVR, set 12 and the two rows

Bench set 12 (Sep 30, set 4), the first take through the weighted blend on the phone. Ground
truth `OVR_BENCH_SET12_2026_09_30`.

| | Device | Sensor |
|---|---|---|
| Reps | 10 | 10 |
| Mean velocity | 0.71 m/s | 0.68 |
| Peak velocity (average of reps) | 1.01 | 1.03 |
| Mean power | 426W | 409W |
| Range of motion (median rep) | 40.3cm | 35.3cm |

- **Count, mean, peak and power within 5%; range of motion 14% high.** The shoulder ruler
  read 1.23 of the sensor on this take (its worst of eight) and carried the weight, so the
  scale came out 0.0040 against an implied 0.0035. The mean still landed because the
  concentric window ran long (0.59s against the sensor's 0.52), which is the cancellation
  the set 6 notes describe. Two right-looking numbers built on two wrong ones; the
  diagnostics show it, the athlete's screen does not.
- **The shoulder ruler's ratios across the eight sensor-paired benches** are now 1.16, 1.00,
  1.05, 1.00, 1.07, 1.00, 1.00, 1.23. Its 0.1 uncertainty is honest as a spread but it is
  the only ruler with weight, and one bad read moves the take. The way past this is not a
  fourth body ruler; it is the plate.
- **The two Pendlay rows** (`OVR_ROW_SETS_2026_09_30`) were filmed from behind with one arm
  visible and are count comparisons only: 9 against 9, 11 against 11. Both scaled 17-21%
  low. The plate detector saw the plate on both and read a scale 0.47 of the sensor, refused
  correctly as the outlier. From behind, the plate is the one thing square to the lens and
  the body rulers are all foreshortened (the height ruler on a bent-over athlete read 0.70).
  The row is the plate detector's clearest case.

## Build 577 beside OVR, set 11: two rulers from one sensor were two votes

Set 11 (Sep 30, set 3), bench, 135lb x 10, same framing as sets 9 and 10, both hands seen on
628 of 764 frames. Device: 11 reps, 0.49 m/s, 21.5cm median rep. Sensor: 10, 0.73, 35.8cm.
Ground truth `OVR_BENCH_SET11_2026_09_30`. A Pendlay row in the same export was filmed from
behind with one arm visible (410 of 660 points carried) and is not a scale comparison; its
count of nine matched the sensor's nine.

- **The scale was 27% low, and the vote was the fault.** Three rulers: the in-plane 3D ruler
  0.00294, the depth ruler 0.00275, the shoulder ruler 0.00391. The first two agreed and
  outvoted the third; the third was right (set 10 minutes earlier, and the grip in pixels
  between the two takes, both say 0.0039). The in-plane and depth rulers are both read off
  Vision's 3D body pose. When it scales the skeleton wrong they go wrong together, and they
  were counted as two independent witnesses. Rule #2: two readings from one sensor are one
  vote. `reconcileScaleEstimates` now collapses the pair into one witness before clustering
  (both sources still reported).
- **The blend is weighted by evidence.** Across seven sensor-paired benches the shoulder
  ruler read 1.16, 1.00, 1.05, 1.00, 1.07, 1.00 of the sensor; the in-plane ruler 0.94, 0.74,
  1.04, 0.85, 1.23, 0.98, 0.75; the zeroed depth ruler 1.02, 1.03, 0.97, 0.95, 1.16, 0.64,
  0.78 (its wrist depth shortened from 2.8m to 1.7m over one afternoon at one framing). So
  `BODY_3D_CORRECTED_UNCERTAINTY` and `DEPTH_RULER_UNCERTAINTY` are 0.2 now, not 0.08, and a
  blend is an inverse-variance mean rather than a plain one. No ruler is appointed by name;
  the weights follow the constants, and the constants follow the sensor.
- **Replayed through the weighted blend**, ratio to the sensor: set 5 1.12, set 6 0.97, set 7
  1.04, set 8 0.98, set 10 1.02, set 11 0.95. Set 5 is the price: its shoulder ruler read
  1.16 and now carries the weight; it was 1.07 under the plain mean. `depth-ruler.test.ts`
  pins all of it, set 5's 1.12 included.
- **The grip ruler is the way out of body proportions altogether.** `users.gripWidthIn` has
  existed since the grip ruler was written and nothing has ever been entered in it. The
  sensor-paired benches put Scott's wrist-to-wrist span at 0.70-0.73m: 28 inches. With that
  on the profile every bench gets a ruler that owes nothing to the pose scale and is visible
  on every frame, ranked under only a plate. A per-exercise grip is open work.
- **The eleventh rep is the un-rack** (6.1-10.4s, 11.7cm). The count-trim rule did not take
  it; open.

## Build 577: a rep's peak is bounded by its mean, and the set's peak is the reps' average

From set 10's one number still out (peak 1.34 against the sensor's 1.09 with everything
else within 3%). Two changes in `summarizeTrackedSet`:

- **Per rep, the peak is floored at the rep's mean and capped at `MAX_PEAK_TO_MEAN_RATIO`
  (2.0) times it.** A peak below the mean of its own window is impossible; set 10's rep 2 read
  0.15 against 0.52 because a hand dropout froze the trace and the 95th percentile of
  near-zero instantaneous speeds was near zero. The sensor's own peak/mean ratio is 1.35-1.5
  on all sixty bench reps it has reported; past two is a spike. Bounded, never dropped (Rule
  #1), and counted (`trace.repPeaksFlooredToMean`, `trace.repPeaksCappedToMeanRatio`).
- **The set's peak is the average of the reps' peaks**, which is the sensor's own definition
  (its per-set "Peak" row is the average of the rep rows on every screenshot). It was the max,
  so one jumpy rep set the number. Peak power follows.

Replayed: set 10 1.00 against 1.09 (two reps floored, two capped: the trace, not the rule);
set 7 1.12 against 1.11; set 5 0.96 against 1.10. `bench-set10-on-the-sensor.test.ts` pins
the bound and the average.

## Build 576 beside OVR, set 10: on the sensor

Set 10 (Sep 30, set 2), bench, 135lb x 10, same oblique framing as set 9, phone roll -3.9.
The first take segmented along gravity (`axisSource: "gravity"`, the grip's own axis 9.5
degrees off it). Ground truth `OVR_BENCH_SET10_2026_09_30`; fixture
`bench-set10-2026-09-30.json`, pinned by `bench-set10-on-the-sensor.test.ts`.

| | Device | Sensor |
|---|---|---|
| Reps | 10 | 10 |
| Mean velocity | 0.80 m/s | 0.78 |
| Range of motion (median rep) | 38.6cm | 37.6cm (14.8in) |
| Mean power | 481W | 472W |
| Peak velocity | 1.34 m/s | 1.09 |

- **Count, mean velocity, range of motion and mean power all within 3%.** Eight sensor-paired
  benches to get here, and the last three errors were all the same thing: the axis. The scale
  (`both`: in-plane upper arm 0.00342 and shoulders 0.00376, blended to 0.00359 against a
  sensor-implied 0.0035) is 3% high, which is where the 3% on the range of motion comes from.
- **Peak velocity is 23% high**, the one number still out. The per-rep peaks (1.05, 0.15,
  1.26, 0.79 ...) scatter far more than the sensor's (1.03-1.17), and a peak of 0.15 on a rep
  whose mean is 0.52 is impossible: a peak is read off a smoothed trace in a window that can
  miss the rep's fastest sample when a hand drops out (178 frames with no wrist on this take,
  largest gap 2.0s). The set's peak is the max of those, so one jumpy rep sets it. Next.
- **The depth ruler was wrong by more than its zero for the first time**: a wrist depth of
  1.7m against 2.5-3.2m on every other bench at this framing, a ruler 42% low. Reconciliation
  called it the outlier and dropped it, which is the right answer and the reason the blend is
  there. Its five readings are now 0.92, 0.92, 0.87, 0.85, 0.58: not a constant, and
  `DEPTH_RULER_BIAS` stays a zero for the good takes rather than a trust in the ruler.
- **The harness reproduces the device's ten presses rep for rep** and adds the un-rack settle
  as an eleventh phase, because the device dropped that phase on the velocity-rejection
  events of the un-rack second and a stored trace does not carry them (`capture-replay.ts`).
  The test filters to the presses; carrying the rejection timestamps in the export is the
  fix, and it is a diagnostics field away.

## Build 575 beside OVR, set 9: the bar travels along gravity, and the grip line never said so

Set 9 (Sep 30, set 1), bench, 135lb x 10, wrists 2.48m from the lens, oblique from the foot of
the bench. Device: 7 reps, 1.04 m/s, 43cm. Sensor: 10, 0.80, 36cm (14.1in). Ground truth
`OVR_BENCH_SET9_2026_09_30`; fixture `bench-set9-2026-09-30.json`, pinned by
`bench-set9-gravity-axis.test.ts`. Four frames of the clip were in hand for this one.

- **The grip axis was 28 degrees from vertical and passed the 45-degree check**, so the take
  was rotated 28 degrees off the lift and lost three reps. The frames show why: the phone is
  upright and the bar goes straight up and down in the image, but the wrist-to-wrist line is
  tilted because the near plate sits lower and larger than the far one. Perspective. The
  perpendicular to the grip is the travel direction only for a level bar seen square-on,
  which is the one framing Rule #1 says never to require.
- **Gravity is the axis** (`reconcileMovementAxis`, `axisSource: "gravity"`). CoreMotion
  records the phone's roll on every take (`cameraRollDeg`: -3.1, -2.7, -3.0, -4.2 on the
  sensor-paired benches), and under `MAX_ROLL_FOR_IMAGE_VERTICAL_DEG` (15) the image vertical
  is gravity to within a percent. The grip's axis is still measured and recorded beside it
  (`gripAxisFromVerticalDeg`), and governs only when the roll cannot be read or exceeds the
  limit. Every bench fixture segmented both ways: the vertical finds the sensor's ten on sets
  5, 7, 8, 9, the oblique take, the settle take and the 564 re-rack take (which the grip axis
  gave eleven); set 6 reads eleven under the vertical against ten under the grip, one press
  split. Seven of eight, and the eighth is a segmentation edge, not an axis error.
- **What is left on this take is the trace.** 78 frames with no wrist, 139 carried by one
  hand, 48 side flips, 76 interpolated, and both-hands points wandering 100 units sideways
  mid-set. Along gravity the count is right and the mean is 1.03 against 0.80: the same
  concentric-window residual, larger here because the trace is worse. Only one 3D bone had
  enough samples to be a ruler (shoulderWidth) and the shoulder ruler itself was absent.
- **The depth ruler read 0.96 of the sensor-implied scale**, after 0.92, 0.92, 0.87, 0.85 --
  but the sensor-implied scale on this take is soft (the replay's ROM is inflated by jitter),
  so `DEPTH_RULER_BIAS` stays at 0.9 and set 9 is not in the bias test.

## Build 574 beside OVR, set 8: the grip axis was 78 degrees wrong and nothing checked it

Set 8 (logged over set 3), bench, 135lb x 10, wrists 2.61m from the lens. Device: 9 reps,
2.03 m/s, 60cm. Sensor: 10, 0.76, 36cm (14.3in). Ground truth `OVR_BENCH_SET8_2026_09_29`;
fixture `bench-set8-2026-09-29.json`, pinned by `bench-set8-axis-witness.test.ts`.

- **The scale was fine.** In-plane 0.0031, depth 0.00345 (zeroed), shoulders 0.00364, blended
  to 0.0034 against a sensor-implied 0.00364: 7% low. The depth ruler fired for the first time
  on the device (set 7's reading was computed in the harness; the frame dimensions the ruler
  needs were absent on that take and present on this one). Raw it read 0.85 of the sensor,
  after 0.92, 0.92, 0.87: `DEPTH_RULER_BIAS` stays at 0.9, the mean of four.
- **The axis was the whole error.** `movementAxisFromGrip` returned (0.978, 0.209), an axis 78
  degrees from the image vertical, and `summarizeTrackedSet` rotated the trace onto it, so the
  segmenter measured the hands' side jitter as the press: nine "reps" of 44 to 119cm. The same
  trace segmented along the image vertical gives ten reps of 34cm at 0.87 m/s. The trace's own
  covariance axis was no better (five reps at 2.15): a take whose grip pairs are wrong is a
  take whose jitter is large, and the covariance follows the jitter.
- **The fix is the Rule #2 shape**, `reconcileMovementAxis`: the grip axis is a witness held
  against the image vertical, and further than `MAX_GRIP_AXIS_FROM_VERTICAL_DEG` (45) from it
  the vertical governs (`axisSource: "vertical_over_grip"`, `gripAxisFromVerticalDeg` recorded
  whichever won). A barbell lift filmed by an upright phone moves within a few tens of degrees
  of the image vertical; a grip axis that says otherwise is the pair being wrong. The no-grip
  fallback stays the covariance. The 45 is a guess with one take behind it; the field is there
  to revise it.
- **The harness was rotating stored traces twice.** `buildPathTrace` writes the points AFTER
  `dominantAxisFrame` rotated them, so a stored trace is already in the movement frame, and
  `capture-replay.ts` was applying the stored axis to it again. On the near-vertical axes of
  sets 5 to 7 (8 to 17 degrees) the second rotation moved the numbers a little; on set 8 it
  happened to undo the device's wrong rotation, and the harness reported ten good reps for a
  take the phone scored at 2.03 m/s. Fixed (`STORED_TRACE_ALONG_AXIS`). Consequences, because
  every segmentation rule since 09-28 was fitted through the double rotation:
  `bench-dropout` now replays at ten (was eleven; the sensor said ten), set 7 at 37.4cm and
  0.90 (was 38.3 and 0.93; sensor 36.6 and 0.77), the oblique take's shortest rep at 21.6cm
  against a 44cm median (a real short press with a dip in it), and **the 564-era re-rack take
  keeps its eleventh rep** on its true trace: `bench-rerack-is-not-a-rep` is `it.fails` until
  the edge rule is right on it. That take's scale is 1.8x too small, so the centimetre floor
  the rule leans on reads through the wrong ruler.
- **Set 5 reappeared in the export as seq 1** because the whole log is re-POSTed on every
  save; it is the 571 take, not a new one.

## Build 574: the depth ruler zeroed and in the room, the margin keyed by lift, body rulers blended

Planned against the three sensor-paired benches of 2026-09-29 while 573 processed. Scott:
"how do we bring it down to 1% or even 0%". The honest ceiling is a few percent: the sensor
is quoted at a few percent itself, and two instruments differ by where each says a rep starts
and ends. Three changes, each fitted on the evidence in hand and none proven past it:

- **The depth ruler is a candidate** (`source: "depth"`, `DEPTH_RULER_BIAS` 0.9,
  `DEPTH_RULER_UNCERTAINTY` 0.08), ranked below a plate and a measured grip, above every
  proportion ruler. Zeroed by what sets 5 and 6 measured, so on those two takes it lands
  within a percent by construction; `depth-ruler.test.ts` replays both through reconciliation
  and gets within 3% and 5% of the sensor. The next sensor-paired set is its first real test.
- **Body rulers blend when nothing anchored is present** (`BODY_RULERS` in
  `reconcileScaleEstimates`): height, shoulders, the 3D skeleton and the depth ruler. Set 6
  chose the in-plane ruler alone at 26% low over an exact shoulder ruler; two body guesses
  pull opposite ways more often than not, as the squats and set 5 showed.
- **The travel margin is keyed by lift** (`TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M`,
  `travelOnsetMarginFor`): a press trims at 0.75cm, everything else keeps the squat's
  centimetre. Against the sensor's per-rep windows (range over mean) on the three benches, a
  centimetre ran 6%, 0% and 9% short and half a centimetre 4%, 12% and 2% long; on the squat
  fixture 0.75cm moved the onset two samples into the sit. Scott: "Squat and bench are
  technically different no? The camera knows that it's filming before so we could
  differentiate." The concentric window is a 5% effect; the scale was the 25% one.

**Not done, and why:** the concentric window could also be defined the sensor's way outright
(range over the window from leaving the bottom to reaching the top); with three sets the
per-movement margin reaches the same place with fewer moving parts. Zero is not on the table.

## Three lifts beside OVR, build 621, 2026-10-06

Bench press, Pendlay row and push press, set 1 of each, filmed beside the sensor. Export of
2026-10-06.

| Lift | Forge ROM | OVR ROM | err | Forge mean | OVR mean | err | reps |
|---|---|---|---|---|---|---|---|
| Bench 135x10 | 37.4 cm | 37.1 cm | **+0.9%** | 0.81 | 0.70 | +15.7% | **12 / 10** |
| Pendlay Row 135x10 | 46.1 cm | 56.6 cm | **-18.6%** | 1.11 | 0.97 | +14.4% | 10 / 10 |
| Push Press 95x10 | 74.0 cm | 64.0 cm | **+15.6%** | 0.97 | 0.97 | **+0.0%** | 10 / 10 |

The bench's range of motion is the best this pipeline has produced. Three ROM errors in three
directions is scatter, not bias.

### EVERY RULER MEASURED AGAINST THE SENSOR, AND THE BLEND BEATS ALL OF THEM

With the two sensor-paired takes from 10-05 (squat, RDL) that makes five. Each candidate's own
error against the scale the sensor requires, from `calibration.scaleCandidates`:

| ruler | Push | Row | Bench | RDL | Squat | median | median abs |
|---|---|---|---|---|---|---|---|
| `shoulder_width` | +22.4% | -13.0% | +5.5% | +1.3% | +25.1% | +5.5% | 13.0% |
| `body_3d` | -13.2% | -36.3% | -21.4% | -16.9% | +4.4% | -16.9% | 16.9% |
| `depth` | -9.9% | -45.2% | -13.9% | +7.9% | +47.0% | -9.9% | 13.9% |
| `height` | -- | -- | -- | -15.8% | -17.5% | -16.7% | 16.7% |
| **BLEND** | +15.6% | -18.6% | +0.9% | -7.0% | +6.0% | **+0.9%** | **7.0%** |

**The blend's median absolute error is 7.0% where every individual ruler is 13-17%.** That is
inverse-variance weighting doing exactly what it is for, and it is the first direct evidence of
it. Do not "simplify" the blend to a single best ruler; there isn't one.

**AND IT CORRECTS THE 10-05 NOTE BELOW.** That section recorded `shoulder_width` as the highest
candidate on 19 of 19 captures, median 1.29x, and said it was refittable once a lift was read
against the sensor with the hinge fix in. This is that reading, and the answer is the opposite
of what it looked like: that 1.29x was measured against the OTHER CANDIDATES, and against the
SENSOR the shoulder ruler is the LEAST biased of the four (+5.5% median). The other rulers were
low, not the shoulder high. **The 10-05 decision not to refit it was right**, and the reasoning
offered there was wrong; this is the corrected reasoning.

### NO CORRECTION CONSTANT, AND THIS TIME THE SWEEP SAYS SO

`body_3d` and `height` both read ~17% low on median, which is the shape of an instrument that can
be zeroed (`DEPTH_RULER_BIAS`). Driving `reconcileScaleEstimates` with the five real candidate
lists and the RDL modelled as the hinge it now is:

| | Push | Row | Bench | RDL | Squat | worst | rms |
|---|---|---|---|---|---|---|---|
| as shipped | +15.6% | -18.6% | +0.9% | +0.0% | +6.0% | 18.6% | **11.2%** |
| `body_3d` x1.2 | +17.3% | -17.5% | +2.4% | +1.8% | +7.3% | 17.5% | 11.6% |
| `body_3d`+`depth` x1.15 | +18.3% | -16.8% | +3.3% | +2.9% | +28.6% | 28.6% | 17.1% |
| `shoulder` x0.95 | +10.7% | -22.1% | -3.4% | -4.0% | +3.2% | 22.1% | 11.3% |

Every variant is worse on rms, and the larger ones blow the squat out to +28% -- a shifted
candidate changes which agreement CLUSTER wins, so the blend moves discontinuously. **No
constant was applied.** Third pairing in a row to reach that answer, and the first to prove it
rather than argue it.

The sweep also confirms the hinge fix: the RDL reads **0.0%** with its height ruler removed,
against -7.0% with it.

### THE UN-RACK WAS COUNTING AS REP 1 -- `bar-tracking.ts`, the count-trim's oddness score

**This is the bench's +15.7% mean, and none of it was scale.** Range of motion was +0.9%. The
segmenter returned TWELVE reps for a ten-rep set:

```
rep 1  44.4cm  2.48 m/s  conc 0.20s  ecc 0.13s   <- the un-rack
rep 2  20.1cm  0.49 m/s  conc 0.40s  ecc 1.67s   <- the settle
rep 3  39.2cm  1.42 m/s  conc 0.30s  ecc 5.40s   <- the hold before the first press
reps 4-12: nine presses, 0.60-1.01 m/s, mean 0.741
```

`repConsistency` flagged rep 2 (20.1cm against a 39.2 median) and **could not flag rep 1**, whose
44.4cm is 13% off the median -- perfectly ordinary. Rep 1 is impossible only in SPEED: 2.48 m/s
is 3.5x the set median. The count-trim's oddness score weighed amplitude, the whole window and
the ECCENTRIC's speed, and never the concentric's own, so the bar coming off the hooks looked
like a rep to every term that was scored.

Replaying the real trace through `capture-replay.ts` is what settled it, rather than reading the
code: 14 phases, trimmed to 12 by the count rule, and `MAX_COUNT_TRIM_PER_EDGE` was 2 while the
junk at the front was 3.

**Raising the cap alone is wrong and a sensor-paired take says so.** At 4 it takes set 10 --
which landed on the OVR -- from ten reps to nine, because without a speed term the scorer cannot
separate that set's real last press from this set's un-rack: their oddness scores are 1.34/1.61
against 1.39/1.61. Nearly identical. So the fix is the TERM, and the cap follows it:

- `concSpeed` (the concentric's amplitude over its own duration) joins the oddness score as a
  fourth log-ratio against the set median. A ratio is scale-free, which is why it works on a take
  whose ruler is wrong by 1.8x where a centimetre floor does not.
- `MAX_COUNT_TRIM_PER_EDGE` 2 -> 4, which only matters once the scorer can be trusted that far.

Bench 10-06 then reads **ten reps and 0.73 m/s against the sensor's 0.70 (+4.3%)**, from twelve
and 0.81 (+15.7%). Set 10 holds at ten and stays on its sensor. And it **closes a known gap**:
`bench-rerack-is-not-a-rep.test.ts` has stood as `it.fails` since build 575 with the note "the
day it drops the re-rack this test fails the other way and gets rewritten as a plain assertion" --
that re-rack is 12.4cm at 0.13 m/s against a 18.7cm / 0.36 median, a speed outlier nothing
scored. One term fixes both ends of the same set.

**Rule #1 holds and is proved, not asserted.** The trim loop is
`while (remaining.length > expectedReps && remaining.length > 2)`: it stops AT the athlete's own
count and can never go under it, whatever the cap. `count-trim-never-empties-a-set.test.ts`
replays every capture in the corpus and asserts each still produces numbers -- 20 of 20, the box
jump included. Five captures DO return fewer reps than logged (7, 8, 9, 9, 9 against 10); all
five fail identically with this change reverted, so they are the segmenter missing reps, not the
trim removing them, and they are pinned as a list that shrinks.

### Still open

- **The row is the outlier at -18.6%, and every ruler is low on it** (-13.0%, -36.3%, -45.2%).
  Not a blend problem: no voter is right. The row has been the noisiest lift since 10-02
  (31.9 / 56.0 / 51.3 cm across one session). Next thing to chase.
- **The push press reads ROM +15.6% and mean +0.0%**, which can only mean its concentric window
  is long by about as much as its distance. Worth reading `trimPhaseToDrive` against this take.
- **A 15MB video upload failed** (`NetworkError`, queued for retry) while the log POST beside it
  at 1277KB succeeded. The autosave fix is holding -- saves after the first are 41-80KB -- but
  the VIDEO path still sends 11-15MB in one request.

## Four lifts beside OVR, build 620, 2026-10-05

Scott re-recorded set 1 of every lift on build 620 and filmed set 4 on the OVR beside it:
"I re-recorded over set 1 for all. Disregard first rep on jump squat. On 'cleans' only used reps
above 2.0, set 4 for all OVR readings." So **Forge set 1 is the 620 take and OVR set 4 is the
sensor read.** Export: twenty captures, 2026-10-05.

### Two fixes from 619/620 confirmed working on the phone

- **THE 3D POSE IS BACK.** `recording.body3DFrameCount` on the three set-1 takes: 24 (Back
  Squat), 17 (RDL), 25 (Box Jump), against **0 on both 618 takes**. The derived phase offset in
  `AvBodyTrackingPlugin.swift`'s `body3DPhaseOffset` fixed the regression 618 shipped, and with
  it the `body_3d`, `depth` and ankle rulers are all voting again.
- **THE 13MB AUTOSAVE IS FIXED.** The 620 debug console: the session's first save at
  `13153KB (traces 13015KB)` -- expected, nothing persisted yet -- then every save after it at
  **134KB, 135KB, 137KB, traces 0KB**. `autosaveNow`'s `omitPersistedCapture` is doing its job.
- **THE BARBELL DETECTOR IS DETECTING.** `minDetectionConfidence` 0.4 -> 0.25 (619) moved
  `objectDetection.framesWithCoreMlImplement` from 18-of-840 on 10-04 to **124 on the Pendlay
  row, 51 on the press, 16 on the squat**, with `objectLock.framesLockHeld` of 139 / 123 / 83.
  The secondary witness holds locks now too. The model is still undertrained (barbell has 3
  labelled boxes; see `scripts/med-ball-detector/README.md`) and the plate scale it produces is
  not yet usable -- see the last section below.

### Range of motion against the sensor: the bias is gone, the scatter is not

| Lift | Forge set 1 | OVR set 4 | error | at the old constant (617) |
|---|---|---|---|---|
| Back Squat 135x5 | 78.1 cm | 73.7 cm (29.0 in) | **+6.0%** | -8.0% |
| RDL 135x5 | 60.0 cm | 64.5 cm (25.4 in) | **-7.0%** | -7.9% |

`HEIGHT_RULER_UNCERTAINTY` 0.05 -> 0.1 in 617 did what it was fitted to do: the two lifts no
longer err **together** (-8.0% / -7.9%, one scale error) but in opposite directions, so the mean
error is -0.5% where it was -8.0%. **There is no longer a bias to calibrate out** -- a single
correction constant applied now would make one of the two lifts worse by as much as it improved
the other. What is left is per-take scatter, and the rest of this section is where it comes from.

Velocity, for the record: squat mean 0.98 against 0.90, RDL 0.87 against 1.03. The squat's +8.9%
is substantially the known definition difference -- Forge reports the mean over the DRIVE
(`trimPhaseToDrive`, `DRIVE_ONSET_FRACTION` 0.07), the OVR over the whole concentric -- so a
Forge mean reading HIGH on a squat is expected. The RDL's -15.5% is the scale error below, in
the same direction and roughly twice the size, which is consistent with velocity carrying the
scale through both a distance and a trimmed window.

### THE ROMANIAN DEADLIFT IS A HINGE AND WAS CLASSIFIED AS STANDING

**`client/src/lib/exercise-camera-profile.ts`, the `bent_over` posture map.** This is the RDL's
-7.0%, and it is the same bug `bent_over` was built for on 2026-10-02 -- the list got the eleven
rows and Good Morning, and not the hip hinge.

The RDL's candidate list, scales x1000, off `calibration.scaleCandidates`:

| source | scale | uncertainty | weightPct |
|---|---|---|---|
| `body_3d:torso:reference_corrected:in_plane` | 3.385 | 0.2 | 11.1 |
| `depth` | 4.394 | 0.2 | 0 |
| **`height`** | **3.430** | 0.1 | **44.4** |
| `shoulder_width` | 4.127 | 0.1 | 44.4 |

The scale the sensor's 64.5cm requires is **4.071**. The height ruler is 16% below it and carries
44.4% of the weight. Driving `reconcileScaleEstimates` with that exact list:

| | with the height ruler | without it |
|---|---|---|
| RDL | **-7.0%** | **0.0%** |
| Back Squat (control) | +6.0% | +24.8% |

So the hinge fix is exercise-keyed and costs the squat nothing, and the control says plainly that
the height ruler BELONGS on a standing lift -- dropping it there is 25% high.

**Why a hinge beats the tenth-percentile correction when a squat does not**, which the row's own
2026-10-02 note missed: `calibrateFromFrames` corrects one-sided **compression** along the image
vertical, which is what a squat does to the nose-to-ankle span. A hinge **rotates the torso out
of plane**, carrying the nose forward and toward the lens, so the apparent span gets LONGER than
stature -- and a longer span is a SMALLER scale. The correction is fitted in the wrong direction
for it. The "it starts and finishes upright, so the median carries it" argument that kept the RDL
standing in 10-02 is therefore wrong for the hinge specifically, and still right for a
conventional deadlift, which is deliberately left standing.

Added with it: `Stiff-Leg Deadlift`, `Hip Hinge`, their aliases, and `/\bromanian\b/i` for the
library names the map does not spell out. `four-lifts-beside-ovr-2026-10-05.test.ts` pins the
outcome rather than the mechanism.

### A 61CM BOX JUMP REPORTED 238.4CM

**`client/src/lib/jump-tracking.ts`, `bestJumpHeightCm` / `repsForSetBest`.** The worst single
number in the export, and the information to avoid it was already computed.

`boxRise.netRisesCm` on Box Jump set 1, seven reps for a five-rep set:

```
[70.6, 71.5, 2.4, 71.7, 70.3, 67.5, 265.5]
```

Five of them agree to 1.6cm -- a **2.3% spread**, which is the box ruler working well. The 2.4
and the 265.5 each follow a `baseline_reanchored` event in `jumpEvents` (-42.4cm and -70.0cm
respectively), so each was measured from a baseline that had walked off. **Both were already
flagged** by `summarizeJumpSet`'s own `outlierAgainstSet` check -- 97% and 276% off the median
against a 35% threshold -- and `rep.likelyTrackingGlitch` was set on both.

`const bestJumpHeightCm = Math.max(...reps.map(r => r.jumpHeightCm))` did not read the flag, so
the set's headline number was the single worst rep it had. With the flagged reps out the set
reads 71.7 before `boxRise`'s 1.173 correction and **61.1cm after it, against the 61cm box.**
`bestHorizontalDistanceCm` (76.1cm of forward travel on a box jump), `bestBoxClearanceCm` and
the RSI were the same line and are fixed with it.

**This withholds nothing** (Rule #1): `repsForSetBest` falls back to every rep when every rep is
flagged, every rep keeps its row in `repBreakdown` with its flag, and the full rise list stays in
`trackingDiagnostics.boxRise`. It is choosing a representative statistic, which is exactly what
build 577 did for the bar's peak velocity (`MAX_PEAK_TO_MEAN_RATIO`) after one rep's spike became
a set's headline. The same shape has now been found twice; the next place to look for it is any
other set-level `Math.max` over reps.

The two older box jumps in the export read 45.5 and 46.0 against the same box (-25%) and are
618-era takes with `body3DFrameCount: 0` on one of them -- the regression above. The 620 take is
the only one worth reading, and the five clean reps in it are the best box-jump evidence so far.

### The ankle 3D ruler ran, and came back honest

**`client/src/lib/ankle-3d-ruler.ts`.** First take where it could run at all (619 fixed the 3D
pose). `ankle3D` on Box Jump set 1: `outcome: "no_second_level"`, `framesAtFloor: 1`,
`framesAtBox: 2`, `framesUsed: 22`. With 25 3D frames across a 23-second six-rep set there are
simply not enough frames standing still at either level to separate them, and it said so instead
of inventing a step. That is the right failure.

Worth noting beside it: the same blob's `twoDRiseCm` is **60.2 against a typed 61** -- the 2D
ankle rise is within 1.3%. The 3D ruler's problem is frame COUNT, not geometry, and the lever is
the 3D stride on a box set rather than anything in the ruler.

### KNOWN, MEASURED, AND DELIBERATELY NOT FIXED: the shoulder ruler reads high on every take

**`client/src/lib/pose-tracking.ts`, `BIACROMIAL_HEIGHT_FRACTION`.** Written down so the next
session does not rediscover it and act on it.

Against the median of the other candidates on the same take, `shoulder_width` was the HIGHEST
candidate on **19 of 19** captures in this export -- median **1.29x**, range 1.05 to 1.86. That
is a bias, not noise, and it carries 44.4% of the blend weight at an uncertainty of 0.1.

There is a mechanism and it is measurable. `BIACROMIAL_HEIGHT_FRACTION` is 0.23, the adult
anatomical biacromial breadth -- but the pixel span it divides is measured between **Vision's
shoulder landmarks, which sit inboard of the acromia.** The 3D skeleton measures that span
directly: across fifteen captures its median is **0.1934 of stature** (0.188-0.202 on the six
standing lifts; the press and bench read 0.14-0.17, where the shoulders genuinely are rotated).
0.23 / 0.1934 = **1.19x**, most of the 1.29 observed; the remainder is foreshortening, which
only ever adds.

**And nothing was changed, because acting on it alone makes the numbers worse.** Sweeping the
fraction through the real blend with the real candidate lists:

| fraction | squat vs sensor | RDL vs sensor | worst |
|---|---|---|---|
| **0.23** | +6.0% | -7.0% | **7.0%** |
| 0.22 | +3.6% | -8.9% | 8.9% |
| 0.21 | +1.1% | -10.9% | 10.9% |
| 0.205 | -0.1% | -11.9% | 11.9% |
| 0.195 (the measured value) | -2.5% | -13.8% | 13.8% |

The shoulder ruler's high bias has been **compensating** for the RDL's height ruler being 16%
low. Correct the fraction and the hinge at the same time and the RDL goes from -7.0% to -13.8%;
fix the hinge alone and it goes to 0.0%. So the hinge is the change that belongs, and the
fraction cannot be refitted until a pairing exists where it is the error rather than the
counterweight -- which means a standing lift, with the hinge fix already in, read against the
sensor. **That is the thing to look for in the next export.** Pinned as a deliberate
non-change in `four-lifts-beside-ovr-2026-10-05.test.ts`.

### Also read, not acted on

- **`depth` carries `weightPct: 0` on both set-1 barbell lifts.** It is collapsed into `body_3d`
  before the vote (two readings from one sensor are one vote, Rule #2, build 578), so a zero
  there is the collapse working, not the ruler being ignored. Worth saying because it reads like
  a silenced sensor in the export and is not one.
- **The plate scale is still unusable where it votes.** Pendlay Row set 1: `plate` 1.307 against
  `shoulder_width` 4.750, with `measured: 344px` in a 720-wide frame -- half the image is not a
  plate. Barbell Shoulder Press set 1: `plate` 2.105, `measured: 214px`, `scaleCorroborated:
  false`. The lone-uncorroborated-plate rule (594) kept both out of the blend, which is why the
  row's set 1 still landed near its height/depth cluster. The detector is finding the barbell far
  more often now and what it hands back is not yet a ruler; that is the labelling work, not a
  constant.
- **The RDL's own sets disagree with each other** (60.0 / 54.6 / 67.9 cm, means 0.87 / 0.58 /
  0.83). Only set 1 is on build 620 and only set 1 has a sensor read, so the spread is not
  attributable yet. Flagged for the next pairing.

## Four lifts beside OVR, 2026-10-04 (read 2026-10-05)

Scott filmed four sets with the OVR on the bar. His mapping, because the OVR has no entry for
two of them: "Back squat is back squat, jump squat is box jump, clean is med ball throw, and
deadlift is the rdl, ovr doesn't have those standard in their unit, so I just chose a
different path."

**Only three of the four reached the server.** The Medicine Ball Rotational Throw is absent
from `/api/admin/tracking-report/captures/recent` entirely (the twenty-capture window holds
seq 1-3 from that night and then jumps back to 2026-10-01). Scott's own guess was the length
of the take. It is not a cap: `av-medball-tracker-dialog.tsx` has no `MAX_RECORDING_MS` (only
sprint and horizontal load do), and all sixteen of its exits call `onCapture`, so the dialog
did not refuse it. What length DOES do is make the body bigger, which is the case
`client/src/lib/pending-log-files.ts` exists for. The answer is in the debug console's
`logDebug("SAVE", ...)` lines for that take, and nowhere else.

### What the three captures measured

| | Forge | OVR | ratio |
|---|---|---|---|
| Back Squat 135x5, mean velocity | 0.93 | 0.83 m/s | **+12%** |
| Back Squat, peak velocity | 1.26 | 1.23 m/s | +2% |
| Back Squat, range of motion | 68.0 | 73.9 cm | **0.920** |
| Back Squat, mean power | 556 | 503 W | +11% |
| RDL 135x5, mean velocity | 0.71 | 0.92 m/s | **-23%** |
| RDL, peak velocity | 1.21 | 1.60 m/s | -24% |
| RDL, range of motion | 54.7 | 59.4 cm | **0.921** |
| Box Jump, height | 44 cm | cleared a 24in (61cm) box | **-28%** |

**Scott's instruction was "we need to calibrate these numbers down", and the evidence does not
support it.** Range of motion reads LOW on both barbell lifts, the whole RDL reads low, and the
box jump reads 28% low. The only thing reading high is squat mean velocity and the mean power
derived from it, and that one is a definition difference rather than an error. A global
downward correction would make three of the four comparisons worse.

### Finding 1: range of motion is 8% low on both lifts, and it is one scale error

0.920 and 0.921 agree to one part in a thousand. `reconcileScaleEstimates`
(`client/src/lib/pose-tracking.ts`) returned a metres-per-unit about 8% small on both takes,
and both reported `scaleCorroborated: true` -- the blend was agreeing with itself while being
wrong together.

The candidate lists say where it went. On the Back Squat the blend chose 3.655e-3 and the
scale the sensor requires is 3.973e-3; the `body_3d:upperArm:reference_corrected:in_plane`
candidate read **3.970e-3**, within 0.1% of the sensor. On the RDL the blend chose 3.433e-3
against a required 3.728e-3, and the mean of its `body_3d:femur` (3.388e-3) and `depth`
(4.113e-3) candidates is 3.751e-3, within 0.6%. On both takes `height` was the LOWEST
candidate present (3.381e-3 and 3.275e-3) and the chosen number sits beside it.

So the shape of the fault is that the blend is weighted toward a ruler that reads low --
but **the weights were not in the export**, so which one cannot be stated from this session's
evidence. That is fixed in the same change (see below) rather than guessed at here. Do not
apply a x1.086 constant: it would paper over whichever ruler is biased and would be wrong
again the moment the weights move.

- `plateRejectedAgainstGrip` behaved correctly on both. The RDL's plate candidate was
  1.693e-3, less than half every other witness, and `scalesRejectedAsImplausible` caught it
  (`impliedHeightIn: 37.6`) before anything was ranked -- which is why `scaleOutliers` came
  back `[]`. The squat's plate was rejected on `size_vs_grip`, `aspect_ratio` and
  `too_large_for_a_plate`. Neither rejection is the 8%.

### Finding 2: the squat's +12% mean velocity is `trimPhaseToDrive`, not an error

A +12% mean against a +2% peak is the signature of `DRIVE_ONSET_FRACTION` (0.07, build 579):
Forge reports the mean over the DRIVE and the OVR reports it over the whole concentric, so
Forge's mean is higher by construction while the peaks agree. Leave it alone, and stop
reading squat mean velocity as a disagreement with the sensor.

### Finding 3: the RDL's -23% is the live path, undersampled, on a head-on take

Two things in `trackingDiagnostics.recording` that were not being read before:

- **The RDL ran on the live path and the squat fell back to the file path.** The squat's
  `liveFallbackReason` is `coverage=0.84 dropRate=3.002 maxGap=0.48s`; the RDL's
  `liveCoverage` was 0.864 and it passed. A hair's difference in coverage put the two lifts
  through two different pipelines, and the one that stayed live is the one whose numbers are
  wrong.
- **`liveDropRate` was 2.98 on the RDL and 2.05 on the box jump.** Three frames dropped for
  every frame processed: 585 frames over 22.6 seconds is about 26 retained from a ~104fps
  capture. The RDL's per-rep ranges came back 56 / 53.2 / 69 / 59.1 / 36 cm against the OVR's
  steady 58-61, which is what `splitMergedPhases` and `isImplausiblyFast`
  (`client/src/lib/pose-tracking.ts`) produce when they are fed a quarter of the frames -- one
  rep merged with its neighbour's tail, one cut short.
- **The RDL was filmed head-on** (`cameraView.subjectFacing: "facing_camera"`, grip axis 40.5
  degrees off the image vertical, against 4.4 on the squat). A hinge filmed head-on puts the
  bar's forward travel straight down the lens. That is a known ceiling, not a fault, and it is
  NOT a reason to say anything to the athlete about where he stood (Rule #1).

The work this points at is the live path's drop rate, not a velocity constant. `axisSource`
came back `gravity` on both barbell lifts, which is correct and is not the problem.

### Finding 4: the box jump told him he missed the box. Fixed.

`boxClearanceCm` came back -10.3 and -6.9 and `av-jump-tracker-dialog.tsx` said "Did not clear
the box, feet peaked 6.9 cm below the top". He cleared a 24 inch box; the jump height on that
same take read 44cm against the 61cm the box required, so the clearance was negative for the
same reason the height was low. The existing plausibility guard cannot catch it, because 6.9cm
IS physically possible -- it just is not what happened.

"Cleared it by N" is a measurement; "did not clear it" is a statement about the athlete's
performance, and this pipeline is not calibrated well enough to make one. The warning toast is
removed. The number still rides on `repBreakdown` to the admin tracking report, which is where
a finding of this kind belongs and nowhere else.

### Added to the export in the same change

`scaleCandidates` now carries `uncertainty` and `weightPct` per candidate
(`reconcileScaleEstimates` returns the per-voter weights, `av-bar-tracker-dialog.tsx` attaches
them, `shared/schema.ts` declares them so the zod parse cannot strip them, and
`server/tracking-report.ts` prints them on the "Scale sources" line). Without them Finding 1
cannot be attributed to a ruler, and the next pairing would hit the same wall.

## Four lifts beside OVR on build 618, 2026-10-05 (OVR side recorded; Forge side pending)

Scott refilmed the same four lifts on build 618 (`aba3cdf0`). The OVR screenshots are below as
ground truth. **The Forge side of this comparison is not in yet** -- it needs the diagnostics
export (`/api/admin/tracking-report/captures/recent`), and nothing here is a comparison until
it arrives.

**What build 618 actually carries**, because it decides what this pairing can and cannot test.
618 was cut from `aba3cdf0`, which is BEFORE the Rule #4 tracker audit (`40a49804`) and before
the accuracy batch (`cff85511`). So 618 has:

- the height ruler refit, `HEIGHT_RULER_UNCERTAINTY` 0.05 -> 0.1 (the one thing this pairing is
  really a test of: range of motion should move from -8% to about +1%);
- the box ruler always running and reporting an `outcome` instead of a bare null;
- the 3D ankle ruler (`ankle3D` in the jump's diagnostics);
- the 3D/hand-pose frame collision fix and `liveMissRate`;
- trace shedding and the 413 rules.

618 does NOT have: the lowered detection confidence floor, the static-decoy rule, the source-gap
verdict, scale drift, the per-tracker strides, the swing's rulers or `rotation3D`. **So this
pairing cannot say anything about the object detector.** It tests the scale refit and the two
new jump witnesses, and nothing else.

### OVR ground truth, Oct 05

Scott's exclusions, in his words: "Disregard set 2, I recorded the whole thing on 616 not 618,
also disregard the very small numbers, those are setup numbers on the OVR, also disregard the
.85 on the deadlifts, also a setup number."

**BACK SQUAT, 135lb x 5** (ROM in inches as the OVR reports it; cm converted)

| | Avg m/s | Peak m/s | ROM in | ROM cm | Avg W | Peak W | TPV s |
|---|---|---|---|---|---|---|---|
| Set 1 | 0.83 | 1.23 | 29.1 | 73.9 | 503 | 741 | 0.59 |
| Set 3 | 0.89 | 1.34 | 29.1 | 73.9 | 535 | 804 | 0.56 |

Set 3's per-rep ROM: 27.9, 28.7, 29.1, 28.9, 31.0 in. Set 3 EAI 2.40.
**29.1 in / 73.9 cm on both sets, and the same 73.9 the 2026-10-04 squat gave** -- the sensor is
repeatable across days, which is what makes it usable as ground truth at all.

**JUMP SQUAT (Scott's stand-in for the box jump), 1lb x 6**

Set 3's rows, with the 0.39 / 0.63 / 36.0 opening row excluded as an OVR setup number:
1.45/2.85/27.2, 1.38/2.82/27.0, 1.40/2.42/25.7, 1.37/2.56/25.8, 1.33/2.42/25.4.
Excluding that setup row the five real jumps average **1.39 m/s, peak 2.61 m/s, ROM 26.2 in
(66.6 cm)**. The on-screen set summary of 1.22 / 2.27 / 27.8 INCLUDES the setup row and is
therefore not the number to compare against.

**CLEAN (Scott's stand-in for the med ball throw), 12lb x 12**

Set 3 summary 2.29 / 5.82 / 53.0 in / 122 W / 310 W / 0.38, over twelve rows of which two are
setup (0.83/1.76/49.5 and 0.68/1.02/18.7). The ten real throws run 2.17-3.02 m/s average and
5.91-7.27 m/s peak, ROM 53.0-59.8 in.

**RDL:** Scott excluded a 0.85 as a setup number; the deadlift screenshot is not in this batch.

### What to check the moment the export lands

1. **Range of motion on the squat.** The sensor says 73.9 cm. On 10-04 Forge said 68.0 (0.920).
   `HEIGHT_RULER_UNCERTAINTY` 0.1 predicts about 74.8 (+1.2%). If it lands there the refit is
   confirmed; if it is still near 68 the refit did not reach the build or the blend is being
   driven by something the 10-04 candidate list did not contain.
2. **`trackingDiagnostics.calibration.scaleCandidates[].weightPct`.** New in 617 and the whole
   point of it: it says which ruler the blend actually followed, which 10-04 could not.
3. **`trackingDiagnostics.ankle3D` on the jump.** `outcome: "measured"` with a `stepM` near the
   box height is the first evidence the 3D ankle ruler works at all; any other `outcome` names
   which branch it took.
4. **`trackingDiagnostics.boxRise.outcome` on the jump.** The 10-04 take returned a bare null.
   `too_few_box_reps` with the per-rep `netRisesCm` would confirm the landing is being assigned
   to the floor rather than the box top -- Scott's "it thinks I'm doing a broad jump".
5. **Whether the med ball throw saved this time.** It was destroyed by its own size on 10-04;
   618 carries the trace shedding and the 413 rules that should make that impossible.

## The posture sweep, and what is actually shared between lifts, 2026-10-06

Scott, after the second bench of the day read -43.2% where the first had read +0.9%: "does our
camera system share everything with every lift? Or does each lift get its own 'camera system' so
bench and squat are different" / "Or whether a fix for squat screws up bench because they are
different" / "audit the posture table, keep it as is right now as far as numbers, but make sure
each lift that we are recording has its own numbers so when we calibrate one lift it isn't
screwing up others."

**The answer, stated plainly: one code path, per-lift VALUES.** There is no per-lift camera
system. Eight trackers exist (bar, jump, med ball, kettlebell swing, golf/bat swing, sprint,
mechanics, horizontal load) and bench, squat, row and press are all the SAME tracker -- the bar
tracker, `client/src/lib/bar-tracking.ts`. What differs between them is a handful of values
looked up from the exercise's name:

| Looked up by exercise | Where | What it decides |
|---|---|---|
| `postureForExercise` | `exercise-camera-profile.ts` | Whether the HEIGHT ruler may vote at all (standing and hanging yes; seated, lying, supported, bent_over no) |
| `romBucketForExercise` | same file | Which `MIN_ROM_FRACTION_OF_HEIGHT` entry gates a rep |
| `TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M` | `bar-tracking.ts` | How far the bar must move before travel counts |
| `firstMoveForExercise` | `exercise-camera-profile.ts` | Whether the first phase of a rep is the concentric or the eccentric |
| `expectedCameraView`, `filmGuidanceForExercise` | same file | What is DESCRIBED before recording (never after -- Rule #1) |
| `movementProfiles` row | DB | Form-fault thresholds, jump outlier percent, position scale correction |

**Everything else is shared by every lift**, and this is the part to keep in mind before fitting
a constant: `reconcileScaleEstimates` and all eight ruler uncertainties, `HEIGHT_RULER_UNCERTAINTY`,
`BIACROMIAL_HEIGHT_FRACTION`, the count-trim oddness scorer and `MAX_COUNT_TRIM_PER_EDGE`,
`MAX_PEAK_TO_MEAN_RATIO`, `DRIVE_ONSET_FRACTION`, the plausibility gates, the arbiter's grip-width
threshold, and the segmenter itself. **So yes: a constant fitted on the squat moves the bench.**
That is exactly what the 2026-10-06 bench fix demonstrated in the other direction -- the
`concSpeed` term was added for a bench un-rack and had to be checked against set 10 (a bench) and
against the squat and RDL before the cap could go to 4.

The only safe way to make a lift its own is to make the thing that differs a LOOKUP, not a
constant. Posture is the model for that: it is per-lift by construction, and the hinge fix on
2026-10-05 took the RDL from -7.0% to 0.0% while leaving the Back Squat's number bit-identical.

### What the sweep found

All 413 library exercises run through `postureForExercise`. (A correction to this section's first
version, from Scott the same day: only **54** of the 413 can actually be filmed --
`CANONICAL_VIDEO_ELIGIBLE_NAMES` in `server/seed.ts`, enforced by `exercises.videoEligible` and
`resolveVideoCheckEnabled`, because video storage scales with how many distinct exercises are
eligible. `VideoTrackingToggle` excludes nothing, which is what made "all 413 are filmable" look
true; the gate is the column, not the control. **None of the twenty-two below is on that list**,
so the sweep is a correctness fix against the day one becomes eligible, not a change to a number
anyone can produce today -- and the per-lift/shared map above is unaffected, since it is about
which constants are shared, not about how many lifts reach them.) Before: standing 308, lying 62, seated 22, bent_over 14,
supported 5, hanging 2. **Twenty-two of the 308 were not standing.** They were reaching the
default because `postureForExercise` falls through to "standing" for anything it does not
recognise, and the patterns are a list of spellings:

- **Face-down on a bench or in a plank, resolving standing:** Seal Row, Spider Curl, Frog Pump,
  Renegade Row (and the two combinations that contain it), Stir the Pot, McGill Curl-Up. The
  `plank` pattern exists; none of these names says plank.
- **Hinged, resolving standing:** Bent-Over Dumbbell Rear Delt Raise (the bent-over pattern
  required the word "row" after it), Cable Pull-Through, Jefferson Curl, Dumbbell and Cable
  Kickback, Single-Leg RDL to Row, Suitcase Deadlift to Row.
- **Seated with the chest on a pad, resolving standing:** Machine Row, Pec Deck.
- **From the knees or a hang, resolving standing:** Toes-to-Bar, Nordic Hamstring Curl, Adductor
  Rock Back, Dead Hang (which is the one case where moving off standing changes NOTHING -- a hang
  is one straight line and "hanging" allows the height ruler too).

Each is a label, not a number. **No constant moved in this change** and
`the-posture-sweep-2026-10-06.test.ts` pins both halves: the twenty-two, and the ten
sensor-paired lifts resolving exactly as they did before (Back Squat standing, Bench lying,
Pendlay Row and Romanian Deadlift bent_over, Barbell Shoulder Press standing, Box Jump standing),
plus the five deadlift variants that stay standing on purpose.

### What the sweep does NOT explain

**The 40% bench spike is not a posture problem and not a code change.** Both 10-06 benches ran on
the SAME build in the SAME session minutes apart -- +0.9% then -43.2% -- so nothing in the repo
can account for the difference, and on the second set all three rulers read ~40% low TOGETHER,
which also rules out the blend picking a bad voter. That remains open and is the thing to look for
in the 624 export.

The tracker distribution, for the record: of 413 exercises, 377 resolve to the bar tracker, 20 to
jump, 9 to med ball, 5 to horizontal load, 2 to kettlebell swing. Sprint and mechanics are in the
SKILL library and are not among the 413.

### The filmable 54, audited the same day

Every one of them resolves a posture, and every bar-tracked one has a ROM bucket, a first move and
film guidance -- `every-filmable-lift-is-profiled.test.ts` asserts it, because a lift added to the
canonical list with no entry in those tables falls silently through to the defaults (posture
"standing", `DEFAULT_MIN_ROM_FRACTION`) and nothing on the take says which numbers came from a
table and which from a fallback.

Breakdown: 46 bar-tracked (22 strength, 24 Olympic) and 8 jump-tracked. The eight jumps read none
of the bar-path profile -- `jump-tracking.ts` does not ask for it -- and are listed explicitly in
that test rather than detected, so a new jump lift has to be added deliberately.

Postures across the 54: standing 46, bent_over 5 (the four rows and the Romanian deadlift), lying
3 (the four bench variants and the hip thrust). That is the whole blast radius of the hinge and
lying rules on anything that can currently be filmed.

**One gap, recorded rather than filled: Hip Thrust has no ROM bucket.** Its rep gate is
`DEFAULT_MIN_ROM_FRACTION`, which may well be right for a short-travel thrust, but no hip thrust
has been filmed beside the sensor and Scott's instruction on the sweep was to leave the numbers
alone. `NO_ROM_BUCKET_YET` in that test is the list, and it shrinks when one is measured.

## One set of numbers per filmable thing, 2026-10-06 (270 records)

Scott, after being told that bench and squat share one code path and that a constant fitted on
one moves the other: "give each 54 exercises, and while you're at it all of the speed/agility,
and skills that can be filmed too, I don't know that number, but every single thing that can be
filmed needs its own system, because again, if we're testing let's say a 40 yard dash, it
shouldn't change any bench press numbers." Then, on what the numbers start as: "Don't change the
numbers that are already there, just make sure they are their own separate individual numbers" /
"So copy and paste."

**The number he did not know is 216.** 54 filmable exercises plus 216 filmable skill drills =
**270 identities**, each with its own record in `shared/camera-tunables-by-lift.ts`.

### What is now per-lift

Twelve constants, every one of them a number a sensor comparison has moved or could move:
`minRomFractionOfHeight`, `maxRomFractionOfHeight`, `travelOnsetMarginM`, `maxPeakToMeanRatio`,
`driveOnsetFraction`, `maxDeviationFractionOfHeight`, `maxCountTrimPerEdge`,
`minCountTrimOddness`, `heightRulerUncertainty`, `depthRulerBias`, `depthRulerUncertainty`,
`ankle3DRulerUncertainty`.

`cameraTunablesFor(name, romBucket)` returns a FRESH record every call, plus a `sources` map
saying for each number whether it is the shared starting value, a rom-bucket value, or one
FITTED on this lift. `summarizeTrackedSet` takes the record as its last argument and reads every
one of those constants off it; `implausibleRangeOfMotion` and `implausibleBarPathDeviation` take
it too. `av-bar-tracker-dialog.tsx` resolves it once per take from the exercise's name.

### Why a factory and not 270 hand-typed blocks

"Copy and paste" is the semantics, and the semantics is what was built: one independent,
separately writable record per identity, with nothing shared between them at read time. Typing
the same twelve numbers out 270 times would be ~4,000 lines nobody can review, and the first typo
in it would be a per-lift calibration nobody intended -- the exact failure this is meant to
prevent. The values live in one place to read rather than 270 places to compare, and a fitted
number is a one-line override beside the lift's name, which is the line a reviewer actually needs
to see.

### What is deliberately NOT per-lift

The plausibility gates (a frame implying an impossible velocity), the occlusion windows and the
arbiter's grip-width threshold. Those are statements about physics and about the camera, not
about the lift, and splitting them 270 ways would mean 270 uncalibrated guesses where today there
is one considered number. Rule #2 applies to constants as much as to sensors: a number nobody can
fit is not improved by having more copies of it.

### Nothing moved, and it is proved three ways

- `camera-tunables-are-a-copy.test.ts` asserts every value in the registry against the constant
  it was copied from (the originals are now exported from `bar-tracking.ts` for exactly this, the
  same "change one, change both" rule as the Swift arbiter port). A value edited in one place and
  not the other fails rather than drifting.
- The whole suite, including the four OVR fixture comparisons and the 20-capture replay corpus
  (`count-trim-never-empties-a-set.test.ts`), is green and unchanged -- 326 files, 3,602 tests.
- `every-filmable-thing-has-its-own-numbers.test.ts` resolves all 270, asserts no two share a
  record and none is the frozen template, and scribbles on one to assert the other 269 are
  untouched. Scott's own example is an assertion by name: **A 40-YARD DASH CALIBRATION DOES NOT
  REACH THE BENCH PRESS.**

`FITTED_OVERRIDES` is **empty**, and the test fails if an entry appears. That is the correct state
today: not one constant in this pipeline has ever been fitted on a single lift in isolation --
the RDL, the box jump and the bench were all fixed by changing a LABEL or a RULE, and the 10-06
bias sweep is on the record as evidence against fitting blind. The registry is the machinery for
doing it safely when a sensor-paired take justifies it; it is not permission to start guessing.

### The gates are split too, 2026-10-06 (and one of them is only half-split)

Scott, on the first version leaving the plausibility gates shared: "Split those too, every single
thing should be the same but separate, if we change the gate on med ball throws it might change
the gate on a golf swing and yes they are similar but very different."

**He is right, and the argument for leaving them shared was wrong in a way worth writing down.**
The claim was that a gate describes physics and the camera rather than the lift. But a gate is
only "physics" once you have already fixed WHICH movement you are talking about: 3 m/s is
impossible for a bar and ordinary for a thrown med ball; 15 m/s is a sane ceiling for a grip on a
golf club and nonsense for a kettlebell. The constants were in fact ALREADY per-tracker for
exactly that reason -- they just shared one value across every lift inside a tracker, so 46 bar
lifts shared one number and the 8 jumps shared another.

Eleven more fields, each copied from the tracker's own constant: `maxPlausibleSpeedMps`
(bar 3 / kb 8 / golf and bat 15 / mechanics 20 / med ball 25), `maxPlausibleAccelG`,
`maxPlausibleVelocityChangePct`, `minTrackingConfidence`, the two occlusion windows, and
overwatch's `maxLockDistanceInYardsticks`, `maxPlateAspectRatio`, `maxPlateSizeInYardsticks`,
`maxYardstickDeviationRatio`. `GATES_BY_TRACKER` holds each tracker's values and
`cameraTunablesFor(identity, romBucket, tracker)` copies them into the identity's own record,
tagging each `"tracker"` in the sources map. `robustPeakSpeed`, `plausibleMean` and
`rejectImplausibleAccelerationSpikes` now take their gate as a parameter, defaulted to the
constant, so every existing caller is unchanged and `summarizeTrackedSet` passes the record's.

**ONE IS ONLY HALF-SPLIT, AND THAT IS RECORDED RATHER THAN HIDDEN: overwatch's four gates.**
Overwatch has to act mid-clip, so it runs natively (`AvTrackerArbiter`), and the native side is
handed a tracking MODE, not a tunables record. The four are per-lift on the TypeScript side today
-- which is what the replay harness and every test read -- and the Swift copy keeps the shared
default until the record is plumbed through the plugin. `tracker-arbiter.test.ts` compares Swift
against the DEFAULT, so the two cannot drift on the value they do share. **A fitted per-lift
arbiter number would be inert on the phone until that plumbing lands, so do not fit one before
then: it would read as applied and not be.** That plumbing is the next piece of this work and is
an `ios/` change, which under Rule #2 means naming the sensor it touches -- it touches none, it
only changes which number overwatch compares against, and it removes nothing.

Still green and still bit-identical: 326 files, 3,602 tests, the four OVR fixtures and the
20-capture replay corpus included. The new assertion carries his example by name: **A MED BALL
GATE AND A GOLF SWING GATE ARE THE SAME KIND OF THING AND NOT THE SAME NUMBER.**

## Three lifts beside OVR, build 625, 2026-10-06 (second session)

Scott filmed bench, Pendlay row and barbell shoulder press on 625 and sent the export plus the
OVR screens. Camera roll was between **-0.7 and -3.4 degrees on all twelve takes** -- the phone
was level on every one. That single fact decides two of the three findings below.

| Set 3 | Forge mean | OVR | | Forge ROM | OVR | |
|---|---|---|---|---|---|---|
| Barbell Shoulder Press | 0.98 | 0.88 | **+11.4%** | 69.7cm | 64.0 | **+8.9%** |
| Pendlay Row | 1.24 | 1.02 | **+21.6%** | 42.6cm | 54.6 | **-22.0%** |
| Bench Press | 1.13 | 0.65 | **+73.8%** | 44.0cm | 37.8 | **+16.3%** |

### THE MEAN DIVIDED ONE WINDOW'S DISTANCE BY ANOTHER WINDOW'S TIME

The bench is the finding, and it is not scale. **A scale error moves distance and velocity by
the same factor**; this take's velocity error is four and a half times its distance error. So the
clock was wrong, and the rep rows say exactly how: bench rep 3 reported **27.0cm in 0.13
seconds** (2.29 m/s, on a 135lb bench whose every sensor rep sat between 0.63 and 0.73), rep 8
77.0cm in 0.33s, and Pendlay row rep 3 51.8cm in 0.13s.

One line in `summarizeTrackedSet` did it:

```
const romM = Math.abs(ySmoothed[phase.endIdx] - ySmoothed[phase.startIdx]);   // WHOLE phase
const mean = romM / driveDuration;                                            // DRIVE window
```

`trimPhaseToDrive` deliberately cuts the slow start and finish off the phase, so the drive window
is a strict SUBSET of it -- and the whole rep's distance was being credited to only the fast
part's time. On a clean rep the two windows nearly coincide and the error is small, which is why
the 10-06 morning bench read +0.9% on range of motion and still +15.7% on the mean and nobody
separated the two. Where the trim bites hard -- one glitch frame lifts the rep's peak, the
threshold is a FRACTION of that peak, so the window collapses -- it is unbounded.

Fixed by measuring the distance over the window the time is measured over (`driveRomM`). The
REPORTED range of motion is untouched and stays the whole phase: that is the rep's real travel and
it is the number already measuring correctly. Two windows, two jobs -- the split this function
already makes for the travel window; the mean was the one number reading across both. No constant
was fitted. Replayed on the export it takes the bench from +73.8% to +61.5% and kills the 2.29 and
2.73 rep spikes; the remaining gap is the segmenter (the harness returns 7 reps to the device's 9
on that take, the known replay divergence), which is the next thing to look at.

### "BAR TILTED ~28 DEGREES" WAS THE CAMERA ANGLE, AND NOW IT KNOWS WHERE DOWN IS

Scott, on the fault: "this is the angle I filmed at, all camera systems need to be using gravity
adjust to reference what down is, so weird angles down spawn a wrong tilt or shift number."

Right, and the export says which half of it gravity fixes. Two rotations put a level bar on a
slant in frame:

- **ROLL** -- the phone turned. Every line in the image turns with it, so the bar against gravity
  is the image angle MINUS the roll. CoreMotion measures it per take. **Now subtracted**, which is
  the fix as asked. It is also, on this session, worth almost nothing: the roll never exceeded
  3.4 degrees.
- **PERSPECTIVE** -- the phone off to one side. The near plate sits lower and larger in frame than
  the far one and the wrist-to-wrist line rotates with the viewing geometry. **This is all of
  Scott's 28 degrees.** `gripAxisFromVerticalDeg` on the nine barbell takes read 9.9, 11, 15.8,
  17.7, 19.4, 23.8, 33.3, 39.7 and 52.6 -- on a level phone, so none of it is roll. Set 9 beside
  the OVR (build 575) is the controlled case: phone upright, bar going straight up and down, grip
  line 28 degrees off square.

Gravity cannot undo perspective, so the COACHING CLAIM stands down instead: when the phone was
level and the viewing geometry alone rotates the grip line by more than the amount this fault
calls a problem, the fault cannot tell the two apart and does not speak. The threshold is the
FAULT'S OWN (`barTiltMaxDeg`), floored at `MIN_PERSPECTIVE_GRIP_ROTATION_DEG` -- not a number of
its own, so it tracks whatever the fault is set to.

**Rule #1, as always: one sentence is withheld, nothing else.** The tilt readings, the trace, the
range of motion and every other fault are written exactly as before, and
`the-tilt-fault-knows-where-down-is.test.ts` asserts the drift fault still fires on the same take.

### The three loose ends, chased the same session

Scott: "Fix those 3 things why did you leave them? Every calibration needs to include every fix
necessary or else we are testing useless data." Right -- a build that ships with a known cause
unfixed produces a session nobody can attribute. All three were the same two bugs.

**THE SHOULDER RULER WAS TRUSTED TWICE AS MUCH AS IT EARNS, AND IT CARRIED 80% OF THE BLEND.**
`BIACROMIAL_TOLERANCE_FRACTION` was 0.1, set from how much biacromial-to-height varies BETWEEN
PEOPLE. That is a real uncertainty and the wrong quantity: for one athlete filmed six times in an
afternoon the between-person term is a constant BIAS, and what sets the weight is the ruler's own
MEASUREMENT NOISE. That is measurable with no sensor -- within a session the true scale barely
moves, so the spread of a ruler's implied scale across takes IS its noise:

| ruler | measured spread | uncertainty used | |
|---|---|---|---|
| height | 5.3% | 0.1 | about right |
| body_3d | 11.8% | 0.2 | about right |
| **shoulder_width** | **12.0%** | **0.1** | **4x the weight on identical noise** |
| depth | 24.8% | 0.2 | optimistic, and it gets 0% weight anyway |

Inverse variance squares the ratio, so shoulder_width carried **80% of the entire blend on every
lying or bent-over lift**, where the height ruler is absent -- and both of the session's scale
errors followed it off in opposite directions. 0.1 -> 0.2.

**This CORRECTS the 10-06 morning note**, which read shoulder_width's low BIAS (+5.5% median, the
least biased of the four) as a reason to leave its uncertainty alone. Bias and variance are
different numbers and the blend needs the second.

**THE SET'S RANGE OF MOTION WAS A MEAN OVER EVERY REP, FRAGMENTS INCLUDED.** The row's per-rep
range read 19, 33, 52, 37, 34, 49, 58, 52, 49 -- five reps between 49 and 58 against a sensor
saying 50 to 60, plus four fragments the segmenter split. The mean of all nine is 42.6; the mean
of the ones that agree is 49.5. **The set's number was dragged below every honest rep in it by
reps the pipeline could already tell were broken.** Third time this shape has been found (build
577's peak bound, build 621's `repsForSetBest`), and this file's own note said to go looking for
any other set-level statistic over reps already identifiable as wrong. A mean is one.

`setRangeOfMotionCm` uses `repConsistency`'s own rule -- the same median and the same
`REP_ROM_OUTLIER_FRACTION` the diagnostics already report the set by, so the number on the card
and the flag beside it cannot disagree -- and falls back to every rep when none agrees (Rule #1).

**It is the MEAN of the survivors, not the median, and a sensor-paired set decided that.** The
first version took the median and set 8 beside the OVR went from within 1% of the sensor's range
of motion to 10.5% under it: an honest set's reps are not symmetric about their middle, and the
mean of the real ones is what the sensor's number matches. Dropping the fragments is the whole
fix; swapping the estimator too was a second change and the wrong one.

### What the three fixes do, measured

Computed from the device's own rep rows and scale candidates (the replay harness cannot re-derive
device scale from a stored trace -- `STORED_TRACE_ALONG_AXIS`):

| Set 3, range of motion | before | after | sensor |
|---|---|---|---|
| Barbell Shoulder Press | +8.9% | **-2.0%** | 64.0cm |
| Bench Press | +16.4% | **+2.8%** | 37.8cm |
| Pendlay Row | -22.0% | **-12.6%** | 54.6cm |

Median absolute error 16.4% -> 2.8%. **Bench set 2's -43% is the same shoulder-ruler story read
the other way**: its shoulder span measured 120.2px against 95.7 and 96.1 on the sets either side,
the agreement cut dropped it as the outlier, and body_3d was left holding 100% of the weight
alone -- a lone uncorroborated ruler, which is Rule #4's complaint exactly. With shoulder_width's
weight halved the cut has less to overturn.

**The rep count is NOT separately fixed and is not separately broken**: the three sets that read 9
against 10 logged are the three carrying the window bug's fragments, and the fragments are what
the segmenter split. Worth reading on the next export, which is the right order now that the
fragments no longer set the set's number.

**Still genuinely open: the row's remaining -12.6%.** Every ruler on that take reads low together
(body_3d 0.00371, shoulder 0.00424, depth 0.00332 against the 0.00530 the sensor requires), which
is not a blend problem and not a projection problem (ruled out 10-06 morning: across-axis travel
adds 1.3%). No mechanism is proposed, because inventing one is how a bias constant gets fitted to
a single lift.

## Three lifts beside OVR, build 629, 2026-10-06 (third session)

Forge bench is set 4, the other two are set 1; every OVR set is 4.

| | Forge mean | OVR | | Forge ROM | OVR | | reps |
|---|---|---|---|---|---|---|---|
| Barbell Shoulder Press | 1.02 | 1.04 | **-1.9%** | 68.4 | 63.5 | +7.7% | 9/10 |
| Pendlay Row | 0.87 | 1.02 | -14.7% | 36.0 | 54.6 | **-34.1%** | 10/10 |
| Bench Press | 0.46 | 0.70 | -34.3% | 21.8 | 35.8 | **-39.1%** | 8/10 |

**The shoulder press is the morning's work landing: -1.9% on the mean, from +11.4%.** The window
fix did what it was supposed to. **And the tilt fault is gone from the bench** -- `formFaults` on
that take is empty where the morning's carried "Bar tilted ~28 degrees", with the roll at -2.6 and
the grip line 14 degrees off square. The perspective stand-down works.

### ONE WITNESS IS WHERE EVERY BAD NUMBER CAME FROM, AND THAT IS NOW MEASURED

Read off `scaleCandidates` across both sessions, and it is the cleanest signal this pipeline has
produced:

| take | rulers that voted | result |
|---|---|---|
| Shoulder Press s1 | height 66.7% + body_3d + shoulder | **-1.9% mean, +7.7% ROM** |
| Bench s1 (10-05) | shoulder 80% + body_3d 20% | +12% |
| Bench s3 (10-05) | shoulder 80% + body_3d 20% | +16% |
| Row s3 (10-05) | shoulder 80% + body_3d 20% | -22% |
| **Bench s2 (10-05)** | **body_3d ALONE, 100%** | **-43%** |
| **Row s1 (10-06)** | **body_3d ALONE, 100%** | **-34%** |
| **Bench s4 (10-06)** | **body_3d ALONE, 100%** | **-39%** |

**Three for three.** Every take decided by one ruler read 34-43% low; every take with two or more
landed inside 22%, and the one with three landed inside 8%. `scaleCorroborated` was already false
on all three, and nothing acted on it or made it findable.

This is RULE #4 measured on real sets rather than argued: *a number corroborated by one system is
not a trusted number, it is an assertion.* It has been in CLAUDE.md since 2026-10-05 as a
statement about the OBJECT tracker; these three takes say it holds just as hard among the body
rulers, and names the price: about 38%.

### AND THE EXPORT COULD NOT SAY WHY THE SECOND WITNESS WAS MISSING

On all three the shoulder ruler was simply ABSENT from `scaleCandidates`. `ShoulderScaleReading`
has carried `rejectedBecause`, `framesRejectedForAngle` and the span it measured since it was
written, and **none of it has ever reached the export**: a refused ruler contributed nothing at
all, not even a reason. So the single most important question about the three worst takes of two
sessions -- why was this ruler not there -- had no answer in the data.

Fixed, and it is the first of the export additions below. `calibration.shoulderRuler` now arrives
on every take, refused or not: the scale, the uncertainty, the span it measured, the frames it
used, the frames it threw out for angle, the refusal reason, and how much the ruler disagreed with
ITSELF across the take (`spanSpreadFraction` -- the per-take version of the cross-take spread the
morning's uncertainty refit was computed from by hand). `calibration.scaleWitnesses` says how many
rulers actually carried weight, so "one witness" is a number rather than something counted off a
list afterwards.

**No constant was fitted from this.** The three takes average -38.7%, which is tempting and would
be fitting a bias to one ruler from three takes of one athlete in one room. The work is finding
why the shoulder ruler refuses, and the export now carries the answer for the next session.

## What the export carries about faults, from 2026-10-06

Scott: "Can we add anything to the camera export to give us more information on faults?" Three of
that day's four fixes needed numbers the export did not have and were reconstructed by arithmetic
across nine takes, so: yes, and here is what was missing.

- **`faultEvidence`** -- every fault rule's decision, fired or not: what it measured, what it was
  judged against, and `inputs` carrying the other measurements it read. A fault shipped as
  `{code, label}`, a sentence with none of its inputs: "Bar tilted ~28 degrees" said nothing about
  what 28 was measured from, or that the phone's roll was -2.9 and the grip line already 15.8
  degrees off square.
- **The suppressed ones, with a reason.** This pipeline now withholds two coaching claims on
  purpose -- the grip-span floor and the perspective stand-down -- and without this a withheld
  claim and an absent problem are identical in every export. Same complaint CLAUDE.md makes about
  overwatch: a guard that cannot be shown to have fired is a guard nobody can tune. It applies at
  least as hard to a guard that silences something.
- **`repBreakdown[].windows`** -- the three windows per rep side by side: phase, travel and drive,
  each with its own seconds AND its own displacement, plus the sample count and whether the drive
  trim fell back. The bug found that morning (the mean dividing the whole phase's distance by the
  drive window's time) was invisible and had to be inferred from a 0.13s concentric. With these on
  the rep it reads off the page.
- **`setRangeOfMotion`** -- which reps the set's range of motion was computed from and which it
  dropped. A set statistic that silently drops reps is one nobody can reproduce from the rep rows
  beside it, and as of this morning it drops them.
- **`calibration.shoulderRuler` and `calibration.scaleWitnesses`** -- see above.

Every one is declared in `trackingDiagnosticsSchema` in the same change. A zod object strips what
it does not declare, silently, and this has bitten twice;
`the-export-says-why-a-ruler-refused.test.ts` parses a payload through the real schema rather than
trusting that.


## The 7.8MB save, and why build 620's fix never got to act (2026-10-06)

Off Scott's build-629 debug console: `log POST sending 7084KB`, then `7627KB`, then `7771KB`,
climbing all session, where build 620 had the same path at **134KB after the first save**. Beside
them in the same log: a 409, two `NetworkError: Can't reach Forge`, and a 16MB video upload that
failed and queued.

**The omission was wired correctly and simply never ran.** `capturePersistedRef` -- what decides
which captures a later save may OMIT -- is filled in `onSuccess` from a WeakMap keyed by the
payload OBJECT (build 624, and that keying is right: it is what stops a capture being marked by a
save that was built before it existed). But a payload REPLAYED off the offline queue has been
serialised to a file and read back, so it is a different object, and the WeakMap has never heard
of it.

Build 624's own note called that "one re-send, which costs bandwidth and can never lose anything."
On a clean connection that is true. **On a flaky one every save is a replay**, nothing is ever
marked, nothing is ever omitted, and the payload grows until it fails -- which is build 620's 13MB
failure arriving through another door. The 409 and the two network errors in that log are what it
cost, and a 7.8MB body from a phone is a payload problem, not a network one.

**The record now travels WITH the payload** (`sentCaptureKeys`, an array of the same keys, written
at the one place omission is decided) so it survives the round trip through the queue file. The
WeakMap stays as the fast path for a payload that never left memory, and the two cannot disagree
because both are written from the same Set in the same statement. The server's log schema is a
plain `z.object`, so the extra key is stripped on arrival and costs the wire a few dozen bytes of
strings against the megabytes it stops re-sending.

`a-replayed-save-still-marks-what-it-sent.test.ts` pins it and was mutation-tested. Two older
pins had to be widened rather than deleted -- they assert the PROPERTY (the keys come from the
payload, never from live state; the marking still sits inside `if (synced)`) rather than the exact
line, which is what they should have asserted in the first place.

**The lesson, and it is the third time this family has bitten:** a correct-looking guard that
answers a slightly different question than the one being asked. 620 asked "has the server got
this?" and read the wrong state. 624 asked "did this save succeed?" when the question was "did
this save CONTAIN this?". This one asked "is this the payload I built?" when the question was
"did the payload that just succeeded carry this capture?" -- and the answer is in the payload,
which is the only thing that made the trip.

## The segmenter, swept and NOT changed, 2026-10-06

The three things queued after 631, worked in order. Two produced a change; one produced a reason
not to make one, which is the more useful result of the two.

### The rep windows found the merge in one line

Wiring `windows` through to the rep rows paid for itself immediately. Barbell Shoulder Press s3,
nine reps counted against ten logged:

```
rep1..rep8   phase 0.75-0.90s   phaseRom 62-80cm   driveRom 59-77cm
rep9         phase 1.593s       phaseRom 93.4cm    driveRom 66.0cm
```

**Rep 9 is two reps.** Its phase carries 93.4cm on a set whose reps are 62-80, over twice the
typical duration, and the drive window correctly found 66.0cm of it. Nothing else in the rep row
says that: the mean, the peak and the reported range of motion all look ordinary, and
`repConsistency` cannot flag it because 93.4 is only 1.4x the median. A rep with a long LEAD-IN
(bar held still before the press) and two reps MERGED into one are identical in every field this
export carried before today -- `phaseRomCm` beside `driveRomCm` separates them at a glance.

This is also the second independent confirmation of the morning's mean fix: before it, rep 9 would
have reported 93.4cm over the drive window's 0.884s = 1.06 m/s on a set averaging 0.75.

### The merged-phase constants were swept, and the trade is real

`splitMergedPhases` exists for exactly this and did not fire. Both its constants were swept across
the whole 20-capture corpus, measuring rep counts against what the athlete logged:

- **`MERGED_PHASE_MIN_SPAN_RATIO` 1.5 -> 1.15: NO EFFECT AT ALL.** Identical undercounts at every
  value. It is not the binding condition and refitting it would have been motion without movement.
- **`MERGED_PHASE_MIN_DIP` is the binding one, and it trades one failure for another:**

| dip | corpus undercounts | suite |
|---|---|---|
| 0.5 (today) | 6 of 20 | green |
| 0.45 | 6 of 20 | green |
| 0.4 | 6 of 20 | **breaks the oblique bench** |
| 0.35 | 5 of 20 | breaks it too |
| 0.3 | **4 of 20** (bench set 9 and the un-rack capture both reach 10/10) | **invents a phantom rep** on the overlong test |

**So it is NOT changed.** 0.3 fixes two corpus captures by breaking a sensor-paired behaviour --
`overlong-phantom-rep` lands on ten where the tracker saw nine, which is a rep that did not happen
appearing on an athlete's card. Under-counting loses evidence; over-counting invents it, and the
second is worse. And 0.4 and 0.45 cost without gaining, so there is no value that takes the two
wins without the loss.

**What that tells us is worth more than the constant would have been:** the merged rep and the
phantom rep are not separable by dip SIZE. A merged rep is two real presses with a shallow
reversal between them; a phantom is dead time with a wobble in it. Telling those apart needs a
term the dip does not have -- the same lesson as build 622, where raising the count-trim cap alone
was wrong and only worked once `concSpeed` gave the scorer a term that could separate the cases.
The `windows` block is what makes that term findable in the next export.

### The CoreML detector: what I can and cannot do

43 labelled boxes across 41 images -- plate 12, kettlebell 12, med_ball 10, **barbell 3**,
dumbbell 1, and a handful of balls -- against 225 unlabelled images in `training-data/med-ball/raw`.
That is why the barbell class has never produced a single detection on any take.

**The fix is labelling, and it is not something to do carelessly.** This detector is a RULER: the
box's width sets the real-world scale, so a box 15% off produces a scale 15% off, confidently, on
every take that locks to it. Eyeballed boxes would be fabricated calibration data, which is the
exact failure class this session has spent the day removing. Labelling 225 images properly is the
work, and it is honest work rather than a code change.

**The principled alternative, written down rather than built:** every capture already carries
`objectDetection` and `objectLock` telemetry, and frames where the detector locked at high
confidence AND overwatch agreed are self-labelled training data of exactly the quality this needs
-- corroborated by a second system rather than by an eyeball. That is a real pipeline and a real
build; it needs the stored videos, which is a server-side piece, and it should not be started in
the same hour as a calibration session.

## Three lifts beside OVR, build 632, 2026-10-06

Forge set 2, OVR set 5; bench is set 5 for both. The new diagnostics from build 632 answered the
open question on their first take, which is the point of adding them.

| lift | Forge mean | OVR | err | Forge ROM | OVR | err | reps | witnesses |
|---|---|---|---|---|---|---|---|---|
| Barbell Shoulder Press | 1.10 | 1.12 | **-1.8%** | 60.3 | 61.5 | **-1.9%** | 9/10 | 3 |
| Pendlay Row | 1.13 | 1.01 | +11.9% | 46.9 | 55.4 | -15.3% | 10/10 | **1** |
| Bench Press | 0.56 | 0.72 | -22.2% | 21.6 | 35.6 | **-39.3%** | 10/10 | 2 |

**THE SHOULDER PRESS IS THE BEST STANDING-LIFT RESULT THIS PIPELINE HAS PRODUCED**, and it is
the control for everything below: three witnesses, the height ruler voting at 66.7% (the posture
fix of build 623 is what lets it), `shoulderRuler.spanSpreadFraction` 0.063, and both headline
numbers inside 2%. Nothing in this session's changes touches it, deliberately.

**THE BENCH'S -39.3% IS NOT A SCALE ERROR, AND THE EXPORT PROVES IT RATHER THAN SUGGESTING IT.**
Getting 21.6cm to the sensor's 35.6 needs 5.942e-3 m/unit. The highest candidate the take
produced was the shoulder ruler's 3.881e-3 and the best 3D bone was 3.497e-3, so no blend of what
that take measured can reach the sensor's number. Same shape as the box jump's 28% (build 619).
Two things are ruled out and the ruling-out is the useful part:

- **Camera pitch.** `cameraPitchDeg` 7.5, and cos 7.5 is 0.991 -- one per cent of a thirty-nine
  per cent error. The gravity work of build 632 was the roll half; pitch is not the other half.
- **The shoulder ruler being wrong.** `medianSpanUnits` 112.9 against the press's 81.2 reads like
  a broken ruler until you read `cameraView.subjectFacing: "facing_camera"` -- this bench was
  filmed from the HEAD END, which is the one geometry where the shoulders are genuinely broadside
  and the span is genuinely wide. The ruler was working.

It is also the geometry where part of the bar's travel points down the lens, and everything this
pipeline reports about distance is an in-image projection. `client/src/lib/axis-foreshortening.ts`
is the measurement: the 3D pose is already running on every take (Rule #2), `body3DJoints` carry
camera-space metres, so the wrist's displacement between the extremes of the take has both a full
3D magnitude and an in-image component, and the ratio is the foreshortening.
**IT CORRECTS NOTHING** -- same discipline as `measuredPosture` (build 623), because one paired
take cannot be allowed to move every reported distance in the app, and a correction that fired on
a take it had misread would move the scale blend, the rep gate and the headline velocity at once.
Recorded as `calibration.axisForeshortening` with `appliedCorrection: false`.
**On this bench the number to look for next take is 1.65.** If it lands there, it earns the
correction in the build after; if it reads 1.0, the bench's error is somewhere else and no
correction should ever have been applied.

**THE ROW'S SHOULDER RULER WAS REFUSED FOR THE WRONG REASON AND HAPPENED TO BE RIGHT.** Span 68.5
units, implying a stature of 297.6, against an `impliedBodyLengthUnits` under 149 on an athlete
FOLDED AT THE HIP -- so the ratio cleared 2 and `implausible_span` fired. That is the Romanian
deadlift bug of 2026-10-05 in its second home: a nose-to-ankle span shortens legitimately on a
hinge. The refusal was nonetheless the right answer, because that take's span disagreed with
ITSELF by 46.4% and reinstating the ruler takes the row from -15.3% to **+17.5%**. A guard that is
right by accident cannot be tuned, and the next hinge it refuses may be a good ruler. So:

- The body-length yardstick is consulted only where a body length is a stature (`standing`,
  `seated`, `supported`, or an unknown posture).
- `MAX_SHOULDER_SPAN_SPREAD` (0.4) refuses on the span's own self-disagreement, which carries no
  posture assumption at all. Fitted as the one value that refuses the row (0.464) and keeps both
  accepted takes (press 0.063, bench 0.21) -- the three cases are the fit, and
  `the-shoulder-ruler-states-its-own-noise.test.ts` breaks if it moves.
- **The ruler now states its own measured noise**, floored at `BIACROMIAL_TOLERANCE_FRACTION`:
  `uncertaintyFraction = max(0.2, spanSpreadFraction)`. The floor stays because a take can agree
  with itself and still be biased, so the spread can only ever LOOSEN the ruler. It moves nothing
  measurable today (the press is under the floor, the bench changes by 0.1cm, the row is refused)
  and that is the point -- every future take's weight becomes attributable to a number the export
  carries. The whole unit suite, the OVR fixtures and the 20-capture replay corpus are unchanged.

**The row's +11.9% mean against a -15.3% ROM is the remaining open number**, and the two cannot
both be scale: a scale error moves distance and velocity the same way. Its `setRangeOfMotion`
dropped reps 3 and 8 and used eight of ten, so the mean is over a shorter window than the ROM.
Next to look at, and it needs one more paired row before anything is fitted to it.

**Confirmed working on the phone from this export**, both build-632 fixes: the replayed-save
omission fix holds (saves of 188KB, 208KB, 186KB where the 2026-10-05 session climbed to 7.8MB)
and `setRangeOfMotion` reports which reps it used on every take.

### CORRECTION, same day: the bench was NOT filmed from the head end

Scott, reading the section above: "No I did not film the bench from head end, I have filmed every
single bench press from this angle, every single one." He is right and the screenshot settles it --
the phone sits beside the bench, square to the side, as it has for every bench press in this repo's
history.

**THE PIPELINE TOLD ME OTHERWISE, AND THAT IS THE BUG.** `cameraView.subjectFacing` read
`facing_camera` and the export carried the head-on note with it, and I reasoned from that field
instead of from the footage. One line in `assessSubjectFacing` did it:

```
const shoulderSpread = Math.abs(lShoulder.x - rShoulder.x);   // along the IMAGE
const ratio = shoulderSpread / torsoLength;                   // torso length in ANY direction
```

On an upright athlete those two agree, because the torso runs up the image and the shoulders run
across it. **On a SUPINE athlete the body's long axis is horizontal**, so every landmark error
ALONG the body lands in x and is counted as shoulder breadth. The bench's shoulder span came back
112.9 units against the same athlete's 81.2 on a standing press minutes earlier -- not a wider
athlete, a ruler measuring down the body. 2026-09-22 saw the same thing twice (88.0 and 115.3 on
two bench sets minutes apart) and the note written then blamed foreshortening; the measurement was
the problem.

The spread is now the component PERPENDICULAR to the torso's own axis, which is what shoulder
breadth means in every posture. **No threshold moved** -- `FACING_CAMERA_SHOULDER_RATIO` and
`SIDE_ON_SHOULDER_RATIO` are what they were -- and on an upright athlete the perpendicular
component IS the x-spread to floating point, so every standing lift is bit-identical (the whole
suite, the OVR fixtures and the 20-capture corpus are green and unchanged).
`a-supine-athlete-is-not-head-on.test.ts` pins it and was mutation-tested: reverting the one line
turns all four cases red.

**Third instance in three days of one error class.** The RDL's height ruler (10-05) measured a
stature across a hinged torso; the shoulder press's posture label (10-06) denied a ruler on an
upright lift; this measures an image axis against a body that has turned. The first two were fixed
by labelling the posture. This one is fixed by making the measurement rotation-invariant, which is
the better shape where it is available: it needs no label to be right.

**What this does NOT fix is the bench's -39.3%, and the chase is worth recording so it is not
repeated.** With the angle correctly read as side-on, the arithmetic above still stands: no
candidate that take produced can reach the 5.942e-3 the sensor requires. Two things were tried and
rejected, each for a measured reason:

- **Measuring the shoulder RULER across the body too**, which is the identical bug. It is correct
  and it is unshippable today: on a side-on supine athlete the across-body span is near zero, so
  the ruler returns nothing, the bench falls to body_3d alone and reads **-43.9%** -- worse. That
  is a refusal arriving before its replacement, which this repo has shipped once and will not
  again. `shoulder-scale.test.ts` had already said a geometric signal would be worth keeping if
  anyone found one; this is that signal, and it is recorded here rather than acted on.
- **Admitting the refused plate.** The bench's object system DID find its implement -- 18 frames at
  0.88-1.00 confidence, aspect ratio 0.80, which is a disc -- and both gates that threw it away
  (`size_vs_grip`, `too_large_for_a_plate`) measure it against the GRIP, the one yardstick a supine
  side-on athlete cannot provide. That is Rule #4's "a rejected object read is a bug report"
  exactly. But the box was 457px, and a 45cm plate at 457px implies 0.98e-3 m/unit, which reads the
  set at 5.9cm. The gate was right on this take even though its yardstick is suspect -- the row's
  shoulder ruler, one section up, is the same shape.

So two measurements are added instead of a guess, both `appliedCorrection: false`:
`calibration.objectGate.gripAcrossBodyFraction` (is the yardstick every object gate is judged by
intact, or collapsed down the lens?) and `plateScaleIfAdmitted` (what the refused plate would have
produced -- without which three sessions of `plateRejectedReasons` have been unscoreable against
the sensor). Plus `calibration.axisForeshortening`, whose premise is now open rather than answered:
on a side-on bench the bar's travel SHOULD be fully in the image plane, so a ratio near 1 says the
39% is a scale error after all and a ratio near 1.65 says the camera could not see the movement.
**Read those three on the next bench before anything acts on them.**

## The library had one drill under two names, and both were filmable

2026-10-07. Scott, after the Overhead Press / Barbell Shoulder Press duplicate came up: "Look
through the rest of exercise library. Are there any that are close?"

The scan groups every exercise by muscle group, equipment, movement type and laterality, then
compares instruction text inside each group. **The first pass found nothing and was wrong**: the
known pair scored 0.25 against a threshold of 0.30, because build 623 had appended "A seated
barbell shoulder press is a different exercise" to one of them and the extra sentence diluted the
overlap. A duplicate-finder that misses the duplicate you already have proves nothing, so the
threshold was lowered until it caught that one and every candidate above it was read by hand.

Four pairs are the same movement written twice. **One of them matters to the camera and it is not
the one that started the search:**

> **"Overload/Underload Bat Drill" and "Bat Speed Overload/Underload Rounds" are one drill, and
> BOTH were filmable.** Both carry `skillType: "Hitting"`, which is in
> `MECHANICS_ELIGIBLE_SKILL_TYPES`, so one movement held **two of the 270 camera-tunable
> records**. That is the failure `shared/camera-tunables-by-lift.ts` exists to prevent, arriving
> from the opposite direction: the registry stops a number fitted on one movement leaking into
> another, and here one movement had two sets of numbers that could never agree. Calibrate the bat
> swing on one and the other silently keeps the old values; an athlete who logs both has their
> history split across two identities for the same swing.

The count is now **269 (54 exercises + 215 drills)**, and
`every-filmable-thing-has-its-own-numbers.test.ts` carries a note saying that a count going DOWN
is only good news when somebody meant it -- a silent drop is a filmable thing that lost its record
and is falling back to shared numbers.

**Scott named the survivors** ("Call it overload/underload, call it ankle cars, call it pin squat")
and overruled the scan on the one pair it got wrong: "Cossack and lateral lunges are different,
keep them different." Diamond Push-Up / Close-Grip Push-Up is a real duplicate and is NOT merged --
neither is filmable, so collapsing them buys nothing and costs somebody's logged sets a migration.

**Why the merge is a repoint and not a delete.** Ten foreign keys point at `exercises.id` and five
at `skill_exercises.id` in the live schema, nearly all `onDelete: cascade` -- program rows, workout
log entries, session logs, class drill trees. `DELETE FROM exercises WHERE name = 'Anderson Squat'`
does not tidy the library; it deletes every set anybody logged against it.
`server/merge-duplicate-exercises.ts` discovers its referencing columns from `information_schema`
rather than holding a list, because the cost of forgetting one is not a failed merge but a silent
cascade found weeks later. One transaction, so a unique-constraint refusal rolls the whole thing
back and nothing is deleted; it never deletes without a survivor; it is a no-op once run.

Proved on a throwaway Postgres the way the production path actually runs -- duplicates inserted as
an earlier deploy would have left them, then the seed re-run: `"Anderson Squat" merged into "Pin
Squat" across 10 referencing column(s)`, `"Bat Speed Overload/Underload Rounds" merged into
"Overload/Underload Bat Drill" across 5`, zero merge lines on the third run.
`merging-a-duplicate-keeps-the-history.itest.ts` logs a real set against the duplicate and asserts
it survives pointing at the survivor; dropping the repoint turns that case red.

### Overhead Press retired into Barbell Shoulder Press, and the bug that found

Scott, 2026-10-07: "Keep barbell shoulder press remover overhead press." Two rows for one lift,
same muscle group, equipment, movement type and laterality, instructions saying the same thing
twice. The survivor is the one every posture fix and every sensor pairing points at, and the one
he actually logs -- it read **-1.8% on the mean and -1.9% on range of motion** against the OVR on
build 632, the best standing-lift result this pipeline has produced, *while formally restricted
from being filmed at all*.

Barbell Shoulder Press TAKES OVER the retired name's place in `CANONICAL_VIDEO_ELIGIBLE_NAMES`,
so the filmable count stays 54. It needed no new camera profile: it already resolved to the same
ROM bucket (`overhead_press`), the same first move (`concentric`), the same posture (`standing`,
from build 623) and its own film guidance.

**AND THE SWAP ALONE WOULD NOT HAVE WORKED.** Running the seed against a database an earlier
deploy had already touched -- rather than a fresh one -- showed Barbell Shoulder Press coming out
of the merge at `videoEligible: false`. The backfill only ever moves a row still at `null`, which
is exactly what stops a reseed re-restricting one an admin re-enabled; the cost is the mirror
case, where a lift restricted last week and added to the canonical list this week stays restricted
forever. The coach's toggle would simply never have come back, and no test would have said so:
the whole suite was green, because on a FRESH database the row is created already eligible and the
bug cannot occur.

So the seed now promotes membership of the canonical 54 explicitly, to `true` rather than back to
`null`. The list is a deliberate edit to code and a lift on it is eligible by definition; this
does override an admin who restricted one of the 54 by hand, and that is the right way round --
an admin who wants a canonical lift off camera takes it off the list. Nothing outside the list is
touched, so the original guarantee holds.

**The lesson is about where the test ran, not what it asserted.** Seed logic that branches on
"what is already in the database" cannot be proved on an empty one. Run it against a database a
previous version of the seed has already written to.

## Three lifts beside OVR, build 634, 2026-10-07: two errors, and they are separable

| lift | mean | OVR | err | peak | OVR | err | ROM | OVR | err | witnesses |
|---|---|---|---|---|---|---|---|---|---|---|
| Barbell Shoulder Press (logged for a push press) | 1.40 | 1.09 | +28.4% | 1.79 | 1.65 | +8.5% | 71.4 | 64.3 | +11.1% | 3 |
| Pendlay Row | 1.06 | 1.17 | -9.4% | 1.32 | 1.89 | -30.2% | 35.2 | 56.1 | **-37.3%** | 2 |
| Bench Press | 0.83 | 0.69 | +20.3% | 1.08 | 0.97 | +11.3% | 25.7 | 34.8 | -26.1% | **1** |

**THE BENCH IS A SCALE ERROR, AND `axisForeshortening` SETTLED IT ON ITS FIRST TAKE.** Build 633's
note said ~1.65 would mean the camera could not see the movement and ~1.0 would mean a scale error
after all. It read **1.009**. The geometry chase is closed; do not reopen it.
Two more the same way: `subjectFacing` now reads `side_on` on the bench, so the rotation-invariant
facing fix works on real footage and not only on fixtures; and `objectGate.gripAcrossBodyFraction`
is 0.956-0.999 on all three, so the yardstick every object gate is judged by is INTACT -- which
kills the collapsed-yardstick hypothesis rather than confirming it.

**SCALE AND TIMING ARE TWO DIFFERENT ERRORS AND EVERY EARLIER SESSION READ THEM AS ONE.** The
bench's range of motion is 26% LOW while its mean is 20% HIGH. Those cannot both be scale: a scale
error moves distance and velocity the same way. Mean is distance over time, and both inputs are
wrong independently --

    OVR's own avg-over-ROM implies a concentric of   press 0.590s   row 0.480s   bench 0.504s
    Forge's concentricSeconds                              0.51      0.37        0.39   (-13.5%, -22.9%, -22.7%)
    Forge's DRIVE window, which the mean is over           --        0.332       0.310  (bench -38%)

and the proof is one line: the bench's true ROM (0.348m) over the sensor's time (0.504s) is
**0.690**, the OVR's mean exactly. **The velocity computation is sound. Both of its inputs are
wrong.** `windows` (per rep, already exported) shows where: phase 0.600s -> travel 0.367s ->
drive 0.334s, so the TRAVEL trim does the cutting, not `DRIVE_ONSET_FRACTION`. That is the next
fit, and it is now well-posed: three paired lifts, same sign, and a measurement that separates it
from scale.

**AND ONE THING I COULD NOT SEE, WHICH IS WHY THE EXPORT GREW.** The bench recorded its weights as
`body_3d` 100% / `shoulder_width` 0%; replaying `reconcileScaleEstimates` against that take's own
exported candidates, on the commit build 634 was cut from, returns **50/50**. The row and the press
replay exactly. Everything between the candidate list and the weights was invisible -- whether the
3D pair collapsed into one witness, which anchor won the cluster, whether the body-ruler average
fired, whether a plate stepped out -- so the only options were to guess a mechanism or to stop.
Scott: *"So if you can't see, and can't guess, then put it in the export file I download, that way
we can exactly see what's happening."*

`calibration.scaleBlend` is that: the inputs EXACTLY as passed (so a take replays offline with no
phone), the tolerance multiple, the collapsed 3D witness and what it stood for, the voters, the
winning cluster AND ITS ANCHOR, every pair in both directions with the tolerance each was judged
against, and the `blended` / `plateSteppedOut` flags. It also carries `identity`, `romBucket` and
the ruler uncertainties this lift was handed, because the record is per capture and each capture
belongs to ONE of the 54 filmable things -- without the name on the row you cannot tell whose
numbers produced the weights. The MECHANISM stays shared (one blend, one arbiter); what is
per-lift is the numbers it was given, so those are what get written down.

**It is a recording and it gates nothing** (Rule #1). `the-blend-shows-its-work.test.ts` asserts
the number is identical whatever the trace says, that a take where every ruler disagrees with
every other still produces a number, and that replaying from the trace's own inputs reproduces
the verdict.

**A real defect found while looking, recorded not yet fixed: the agreement test is ASYMMETRIC.**
`|other/anchor - 1| <= tolerance` reads differently each way round -- the bench's pair is 1.44x
apart, which clears a 0.4 tolerance anchored on the larger and fails it anchored on the smaller.
The largest-cluster loop hides it most of the time; on a two-candidate take it decides everything.
`pairwise` now records both directions so the next take shows it rather than hiding it, and a
symmetric measure is a change to make with a paired take in hand, not on a Friday.

## The coach's copy was 6fps, and the concentric window refitted without filming, 2026-10-07

Two separate pieces of work, one build. Neither needed a lift: the first was settled from a screen
recording Scott sent of the app playing a saved clip, the second from the thirteen sensor-paired
traces already in the repo.

### The saved video ran at 6.0 frames a second. `AvUploadCopyWriter`.

Scott: *"I just noticed the video is very choppy, almost glitchy or laggy on playback."* It was,
and it was not the player.

Measured off his screen recording (60fps, 673 frames, 11.2s of the real playback UI). In the video
region, 75% of consecutive frames are pixel-identical -- the median frame-to-frame difference is
0.01 of a grey level, which is encoder noise. Counting only frames that genuinely changed, at five
different thresholds:

| threshold | distinct frames | median gap | effective rate |
|---|---|---|---|
| 0.5 | 73 | 0.150s | 6.7 fps |
| 0.8 | 65 | 0.1667s | **6.0 fps** |
| 1.2 | 56 | 0.1667s | **6.0 fps** |
| 2.0 | 48 | 0.1667s | **6.0 fps** |
| 3.0 | 33 | 0.1667s | **6.0 fps** |

Stable across every threshold at exactly 1/6s, and the detector can resolve 60fps -- there is a run
of sixteen consecutive single-refresh changes where the pause overlay animates.

**THE STRIDE WAS BEING APPLIED TWICE.** Scott pushed back on the first explanation and was right to:
the camera IS at 120fps and the export says so (`captureFrameRate: 120`, `sampleStride: 4` on all
six takes of the session). The 120fps `.mov` from `AVCaptureMovieFileOutput` was never affected.
What is thin is the OTHER output. `AVCaptureVideoDataOutput` discards a frame that arrives while
`liveAnalysisQueue` is busy with Vision, which is precisely what `liveDropRate` near 3.0 has been
recording all along -- 90 of every 120 dropped as late, so `captureOutput(didOutput:)` fires about
30 times a second. `AvUploadCopyWriter.append` then kept `index % stride == 0` on a counter of
DELIVERED frames, with `stride = round(activeCaptureFrameRate / 30)` = 4. 30 / 4 = 7.5, and the
remainder to the measured 6.0 is `skippedNotReady`, the encoder refusing a frame.

The fix is the one the live ANALYSIS cadence already took in build 594: sample on the
**presentation timestamp**, keeping a frame when 1/30s of real time has passed since the last kept
one, with the same 0.75 slack. That is right at any delivery rate, which a fixed divisor can only
ever be at one. `uploadCopyTargetFrameRate` is 30 and is the only rate in it now.

**IT DOES NOT TOUCH THE NUMBERS.** The copy and the analysis are independent consumers of the same
callback and the copy's cadence gates nothing in the analysis. The analysis has its own,
separately measured shortfall (`liveCoverage` 0.80-0.85 on this session's six takes, largest gap
1.91s), which is still open.

**AND NOTHING IN ANY EXPORT HAS EVER DESCRIBED THE SAVED FILE.** `skippedNotReady` was counted and
written to the debug console only, so "is the video choppy" could not be asked of a diagnostics
download at all -- the question had to be answered from a screen recording. `videoAsset` now
carries `framesDelivered`, `framesAppended`, `skippedForCadence`, `skippedNotReady`,
`targetFrameRate`, `measuredFrameRate`, `largestGapSeconds` and `spanSeconds`, emitted on BOTH
analysis paths (a take that fell back to the file read still wrote a copy, and that is exactly the
take whose video is worth asking about), declared in `trackingDiagnosticsSchema` because zod strips
what it does not declare, and printed by the tracking report as a "Saved video" row. It records and
gates nothing (Rule #1); a copy that cannot be made still falls back to `compressForUpload`.
`the-coachs-copy-is-not-six-fps.test.ts` pins the cadence, the absence of the old divisor, both
loss counters and the two emission points.

### `DRIVE_ONSET_FRACTION` 0.07 -> 0.04, fitted on thirteen sets with no new filming

Scott: *"calibrate the numbers so we can get more accurate without lifts, build what you need."*
What was needed was a sweep over every sensor-paired take in the repo, which is what the stored
traces are for.

**THE QUANTITY FITTED IS THE SENSOR'S OWN CONCENTRIC TIME** -- its range of motion over its mean
velocity -- which carries none of Forge's scale. That separation is the whole reason this fit is
possible now and was not before: the scale error and the timing error were read as one thing until
build 634's pairing split them.

Thirteen sets: five benches from 09-29/09-30, the oblique bench, the 10-02 bench, row and push
press, two back squats, and this session's shoulder press, row and bench. Per-set drive-window
error against the sensor:

| set | 0.07 | 0.04 | 0.03 |
|---|---|---|---|
| bench-set7 | -3.2% | -0.5% | +5.8% |
| bench-set8 | -20.4% | -7.4% | +1.6% |
| bench-set9 | -30.8% | -18.7% | -5.6% |
| bench-set10 | +1.2% | +4.7% | +6.8% |
| bench-oblique | -11.4% | -1.8% | +8.5% |
| bench-10-02 | +48.5% | +53.8% | +55.1% |
| row-10-02 | -10.3% | +1.0% | +2.9% |
| push-press-10-02 | +5.0% | +11.7% | +17.7% |
| squat-set1 | +3.2% | +5.0% | +12.3% |
| squat-set2 | +21.3% | +25.9% | +26.8% |
| 10-07 press | -11.4% | -1.2% | +3.5% |
| 10-07 row | -13.0% | -11.5% | -3.6% |
| 10-07 bench | -27.9% | -23.9% | -23.9% |

Leave-one-out, scored on median absolute error with each set withheld in turn, picks 0.03 eleven
times and 0.04 three times. **It never picks 0.07.**

Scored on the number the athlete actually reads -- the set's mean velocity -- and excluding the
four sets whose REP COUNT is wrong, because a miscounted set has a different fault and may not be
allowed to choose a timing constant (at 0.07 those four read +113%, +114%, +20% and +2%):

| fraction | median \|err\| | rms | bias |
|---|---|---|---|
| 0.07 | 17.2% | 21.4% | +0.9% |
| 0.05 | 15.6% | 19.6% | -3.1% |
| **0.04** | **10.4%** | **19.0%** | **-4.4%** |
| 0.03 | 8.7% | 19.2% | -8.7% |
| 0.02 | 7.2% | 20.1% | -12.0% |

**0.03 and below buy a little median by paying in bias, and bias is the worse error**: it moves
every athlete's number the same way where a spread does not. 0.04 is the rms minimum on the window
and on the mean, with the smallest bias of the candidates that improve on 0.07. Across all
thirteen it takes the mean's median error from 20.0% to 10.4% and the rms from 48.2% to 36.2%.

**TWO SETS MOVE THE WRONG WAY AND BOTH ARE RECORDED RATHER THAN SMOOTHED OVER**: squat set 2 goes
0.83 -> 0.80 of the sensor and this session's row stays low. A longer window divides the same
distance by more time, so a set already reading LOW reads lower. The trade was made with the whole
table on screen.

**IT CANNOT CHANGE WHICH REPS EXIST, and that is checked rather than argued**: the drive window is
REPORTED while the travel window is what every phantom and rack-move filter was fitted on, and
every fraction swept from 0.10 to 0.01 returned exactly the same rep count on all thirteen sets.
`the-drive-window-was-fitted-on-thirteen-sets.test.ts` is the ratchet and was mutation-tested in
both directions.

**SHARED, NOT PER-LIFT.** It was fitted across five movements and is a property of how a bar sensor
defines a concentric, so it moves for all 269 filmable things together. `FITTED_OVERRIDES` stays
empty.

**One test told a lie and was corrected while fixing it**: `set-two-beside-ovr-2026-10-02.test.ts`
was titled "lands on the sensor's mean" and pinned 1.02 against a sensor that read 0.85, which is
+20%. It now reads 0.91 (+7%) and the pin says which is which.

**Still open and NOT fitted**: the bench's -23.9% window, which does not move with the fraction
because its whole segmented PHASE (0.464s) is shorter than the sensor's concentric (0.504s) -- a
ceiling no trim can lift, and the next thing to look at. Also `bench-10-02` at +48-55% and
`squat-set2` at +21-27%, neither of which responds to this constant either.

### Every capture mode now says how well it was sampled, 2026-10-07

Scott, after the drive-window refit: *"if you're leaving things open and not guessing, add the
diagnostic to the export so we can hammer it down, make sure every skill and exercise video
capture export gives the same diagnostic as well."*

**WHAT WAS OPEN.** The bench's reported concentric would not move at any drive fraction, because
its segmented PHASE (0.464s) was already shorter than the sensor's concentric (0.504s). Windows
are strict subsets of the phase, so the fit had run out of room before it started -- and that was
only discoverable by replaying the corpus offline, because the export carried the three window
LENGTHS and nothing about where the phase's own edges landed.

**THE PHASE EDGES ARE NOW ON EVERY REP** (`windows.openSpeedFraction`, `closeSpeedFraction`,
`gapBeforeSeconds`, `gapAfterSeconds`, `phaseSamples`, `sampleIntervalSeconds`). Each separates a
specific cause: a phase that opened late has the bar already moving at its first sample; a phase
clipped by its neighbour shows dead time; a phase at the resolution limit is not a bug at all (at
30Hz a 0.5s concentric is fifteen samples, so one sample either way is 7%).

The fractions are divided by **the denominator `trimPhaseToDrive` itself thresholds on**
(`speedsMps` at the peak index), not `wholePhasePeak.peak`, which is read off `speedsReportedMps`
-- a different array. Mixing them made the first run unreadable: the row came back with a close
fraction of 2.259, which is only a statement about the two arrays disagreeing.

**READ ON THE THREE 10-07 LIFTS, THE EDGES SAY IT IS SAMPLING, NOT GEOMETRY.** Gaps are 0.000
throughout, so nothing is clipped by a neighbour. What there is instead, per rep: the row's rep 8
spans 0.550s on **five samples**, rep 7 0.759s on nine; the bench's reps 5 and 10 are 6 and 7
samples. On a take whose median cadence is 29.4Hz those are effective rates of 9-15Hz inside
single reps. Every number for those reps was computed over those points. This is the first
mechanism connecting `liveCoverage` 0.80-0.85 to the numbers themselves rather than to the video,
and it is a HYPOTHESIS for the short phase, not a finding -- it is recorded, not fitted.

**AND THE SAME MEASURE NOW RUNS ON EVERY CAPTURE MODE** (`client/src/lib/trace-sampling.ts`):
samples, span, median interval, effective Hz, largest gap, dropouts past three times the median,
seconds lost in them, and `cadenceHeld`. Derived from timestamps the trace already carries, so a
web tracker, an Android tracker and a native take all answer the same question the same way, and
a replay offline computes the identical thing. It is NOT `liveCoverage`: that counts frames the
CAPTURE discarded against a nominal rate and is native-only; this is what survived into the trace,
against the trace's own cadence.

**TWO REAL GAPS FOUND WHILE DOING IT, BOTH WORSE THAN THE THING ASKED FOR:**

- **`skill_session_logs` had no `trackingDiagnostics` column at all.** Nine of the fifteen tracker
  dialogs -- every sprint, mechanics and horizontal-load tracker, so all 215 skill drills -- had
  nowhere to write a diagnostic. `workout_set_entries` has carried one since 2026-09-16 and the
  skill half was simply never built, so a skill capture that went wrong left no account of itself:
  the exact failure the Capture diagnostics rules exist to prevent. Column added, migration run
  against a throwaway database, insert path and input schema wired, four dialogs now send it.
- **The export was workout sets only.** Even with a column, a skill capture would have appeared
  nowhere: every diagnostics surface reads `workout_set_entries`. `getRecentSkillCapturesForAdmin`
  and a `skillCaptures` key on the download. Its own list, not merged into `captures` -- a skill
  capture has no load, no reps, no bar path and no range of motion, and flattening them would mean
  a column of nulls down one side and a reader that cannot tell "not measured here" from "measured
  and empty". Additive, so every existing reader of the file keeps working.

**The scan found one more than the plan did.** `every-capture-says-how-it-was-sampled.test.ts`
scans `*tracker-dialog.tsx` rather than holding a list -- the same reason
`refused-capture-survives.test.ts` does -- and immediately caught `swing-tracker-dialog.tsx`,
which set `trackingDiagnostics: null` under a comment saying the blob is native-AV-only. Half
true: most of it is, the SAMPLING is not, because it comes from the trace that dialog already has.
`samplingOnlyDiagnostics` is the blob for a mode with a trace and none of the native machinery --
everything it cannot honestly fill is null rather than zeroed, since a frameCount of 0 on a take
that recorded frames would be a lie.

## Three lifts beside OVR, build 639, 2026-10-07: the timing fit lands, scale is all that is left

Set 3 of each lift, filmed on build 639 — the first takes with `DRIVE_ONSET_FRACTION` at 0.04.
Sets 1 and 2 of the same session were filmed on 637 and are the pre-refit control.

### THE REFIT VALIDATED ON A TAKE IT WAS NOT FITTED TO

The concentric window against the sensor's own (its range over its mean):

| lift | set 1, fraction 0.07 | set 3, fraction 0.04 |
|---|---|---|
| Barbell Shoulder Press | -13.5% | **+1.0%** |
| Pendlay Row | -22.9% | **-1.1%** |
| Bench Press | -22.7% | **+10.6%** |

Two of the three are inside 1.1%. That is the single largest accuracy move this pipeline has
made, it needed no new constant beyond the one fitted offline, and it was predicted in advance.

### AND THE MEAN'S ERROR IS NOW ARITHMETIC ON THE SCALE ERROR

| lift | mean | peak | ROM | concentric |
|---|---|---|---|---|
| Barbell Shoulder Press | +15.5% | +22.7% | +13.1% | +1.0% |
| Pendlay Row | -8.0% | -29.9% | **-21.4%** | -1.1% |
| Bench Press | -28.6% | -27.5% | **-21.3%** | +10.6% |

The bench proves it in one line: ROM is 21.3% low and the window is 10.6% long, so the mean
must read `(1 - 0.213) / (1 + 0.106) - 1 = -28.9%`, and it reads **-28.6%**. There is no third
error hiding in the velocity computation. **Scale is the whole of what is left.**

### AND THE SAMPLE-STARVATION HYPOTHESIS IS DEAD, KILLED BY ITS OWN DIAGNOSTIC ON ITS FIRST RUN

The 10-07 note proposed that the short phases were sample-starved. The bench set 3 reports
`sampling: { samples: 787, effectiveHz: 30, largestGapSeconds: 0.1, dropouts: 0, cadenceHeld: 1 }`
— a flawless take — and its ROM is still 21.3% low. **A perfectly sampled take has the same scale
error, so sampling was never the cause of it.** Recorded as a hypothesis last session and
disproved this one, which is what the field was built for.

It earned its keep elsewhere in the same export: the shoulder press lost 18 dropouts and 3.861s
(`cadenceHeld: 0.854`, largest gap 1.868s) and returned **nine reps for a ten-rep set**. That is
the first time a miscount has arrived with a measured cause attached.

### THE OBJECT WITNESS IS WRONG BY A FACTOR, AND THE GATES WERE RIGHT ON ALL THREE

`plateScaleIfAdmitted` — added in build 633 precisely so three sessions of `plateRejectedReasons`
could be scored — settles it. The scale each take needs to reach the sensor, against what the
refused plate would have produced:

| lift | scale needed | plateScaleIfAdmitted | factor |
|---|---|---|---|
| Bench Press | 0.004477 | 0.001149 | **3.9x too small** |
| Pendlay Row | ~0.004629 | 0.000986 | **4.7x too small** |
| Barbell Shoulder Press | ~0.003112 | 0.001598 | 1.9x too small |

Admitting the plate would have made every one of them dramatically worse. **The gate is not too
tight; the detector's box is wrong**, and `size_vs_grip`, `aspect_ratio` and `too_large_for_a_plate`
all fired correctly. Rule #4 says a rejected object read is a bug report — this says which
component the bug is in, and CLAUDE.md already names the cause: the CoreML model is undertrained
(barbell 3 labelled boxes, 225 of 266 raw images unlabelled).

**So NOTHING was refitted this round, and the evidence forbids it.** On the bench the two body
rulers AGREE with each other (`shoulder_width` 0.003502, `body_3d` 0.003525, 0.7% apart) and are
BOTH 27% low — exactly the failure Rule #4 describes, body rulers agreeing by construction and
corroborating nothing. No blend of what the bench measured reaches 0.004477; the highest candidate
it produced was `depth` at 0.003837. The row is the opposite shape: `shoulder_width` 0.005892
against `body_3d` 0.003367, 1.75x apart, with the truth at ~0.004629 — between them, much nearer
the shoulder. **Two takes, two contradictory corrections; fitting either moves the other the wrong
way.** The work is the detector.

**One caveat on the press, stated rather than fitted:** it is logged as a Barbell Shoulder Press
and performed as a push press, and its `axisForeshortening.ratio` is **1.452** against 1.029 and
1.036 on the other two — a real along-lens component (4.32m against 4.10m in-image). Its +13.1%
ROM is not cleanly a scale error and it should not be pooled with the other two until a press is
filmed without the dip.

### The saved video is fixed, measured on the phone

`videoAsset` on the three takes: `measuredFrameRate` 25.9, 25.2 and 39.9 against a 30 target, with
`skippedNotReady: 0` on all three. The 6.0fps of the morning is gone. The bench's 39.9 is the
0.75 cadence slack working as written — its delegate received the full 120fps (3817 frames in
31.9s) and the slack admits a frame at 0.025s, so 40fps is the ceiling. Harmless for watching and
about a third more bytes than intended; recorded, not changed.

### A fix that had never reached the phone

Scott's screenshot showed the Barbell Shoulder Press still reading *"Seated, bar at collarbone,
press straight overhead ... removing leg drive isolates the shoulders more than a standing
Overhead Press"* — the text build 623 corrected two weeks ago. `seed.ts` has carried the right
words since; the insert loop creates an exercise by NAME and nothing re-syncs `instructions`, so
the correction only ever landed on a fresh database. The posture LABEL was fixed at the time and
is the half that moves the numbers, so no measurement was affected — but the app has been telling
him to sit down for a lift he does standing.

`CORRECTED_EXERCISE_INSTRUCTIONS` is the fix, keyed on the exact wrong text the way
`LIVE_DOCUMENT_PATCHES` is: it rewrites that and only that, so an admin who has since edited the
row matches neither and is left alone — which a blanket re-sync from the seed could not promise,
and these rows are admin-editable. **Second instance of this class in two days** (the other was
`videoEligible: false` surviving the canonical-list swap): a seed correction is invisible on a
fresh database, which is the only kind every test in this repo runs against.

## The learning loop existed and had never been shown a capture, 2026-10-07

Scott, three times in one evening: *"How do we make it so the ai overwatch learns? It should, we
tried to build it before"* / *"if we could fix it into the camera export and have you teach it as
you go or have it learn from the videos it can see"* / *"Ai overwatch needs to learn."*

### First, what overwatch is, because the name misleads

`arbitrate()` in `shared/tracker-arbiter.ts` is a **pure function**. Its whole input is this
frame's object centre, the body yardstick, and a window of recent spans from THIS take; it
returns `agree | object_suspect | body_suspect | cannot_judge` and keeps nothing. Every take
starts from zero. It does not learn what a bar looks like, where an athlete should stand, or what
a camera should expect — and it must not: Rule #2 makes it the one arbiter that owns no sensor,
and a model inside it would make it a leader. **The only thing in the whole pipeline that learns
across takes is `users.bodyModel`**, a per-athlete grip span.

### And the loop he remembered building is real, complete, and was fed textbooks

`/admin/movement-knowledge` proposes a versioned `movementProfile`; an admin reviews it;
`applyMovementProfileProposal` archives the old row and publishes the new one with full history
and revert; `summarizeTrackedSet` has read `positionScaleCorrection` off it since it was built.
The comment is explicit: *"a chat proposal has zero effect on a live tracker until this explicit
step."* Nothing about that machinery is missing.

What was missing was the input. The library path's entire prompt was:

    Passages retrieved from the library for "${movementType}": ...
    Propose what these passages support for this movement's tracking profile

**It proposed camera thresholds from textbooks.** It had never seen a trace, a ruler, a window or
a scale blend, which is why it has never contributed a number in its life.

### What it is fed now, and why it is RESIDUALS and not a correction

`summarizeScaleEvidenceForMovement` reads recent captures of a movement and, for each scale
ruler, computes its distance from the consensus that take actually used — `median` (that ruler's
bias on this movement) and `spread` (its measured variance) — plus `cadenceHeld`, the drive
window's share of the phase, and how often the rep count disagreed with what the athlete logged.
Both proposal paths carry it; a movement nobody has filmed says so rather than implying evidence.

**The distinction is the whole design.** A blanket `positionScaleCorrection` has been declined six
sessions running because the errors CONTRADICT each other — 2026-10-07 read bench −21% beside
press +13%, same day, same athlete, same camera. Averaging that hides it, and handing the
contradiction to a model to average does not make it true, so the prompt says in words: *do not
propose positionScaleCorrection from this.* What IS consistent is the per-ruler residual, and
`reconcileScaleEstimates` is **already inverse-variance weighted** — it is simply being handed
variances somebody guessed. A measured variance per ruler per movement is the honest version of a
number that is currently invented, and it needs no new mechanism at all.

### What it deliberately does NOT do

- **It does not touch the arbiter.** Overwatch stays one shared referee across every movement —
  judgement is shared, fitted numbers are not (CLAUDE.md, "What 'its own numbers' means").
- **It writes nothing.** The summariser is read-only and the admin apply step is still the only
  thing that can move a live number. A loop that could publish its own proposal would be a model
  editing the tracker with nobody reading it.
- **It never sees the footage, and that is a feature.** The diagnostics ARE the measurement; the
  video is 13MB of it. Keeping the learning off the clips also keeps it off athletes' clips.
- **Aggregates only.** No user id, no name, no set id — counts and medians over a movement, the
  same standing every admin analytics surface has.

`the-camera-loop-learns-from-captures.test.ts` pins the shape rather than the model's output:
both prompts carry the evidence, the honest empty case, residuals not corrections, no athlete,
read-only, the no-consensus capture contributing nothing, and the left join that three silent
drops in the sibling query were caused by.

**Still manual, and next:** the residuals are shown to a model that proposes; nothing yet reads
them straight into the blend's uncertainties, which is the version with no model in the loop at
all and is the better end state. The evidence has to accumulate before that is worth wiring.

## Overwatch on all 269, and what it has to record before it can learn, 2026-10-07

Scott, after the learning work above: *"my thought wasn't for it to become the ruler of all
things, but if it could learn it could help the cameras that are purely objective, they will find
frames and stick for no rhyme or reason because they don't know any better, whether they are right
or wrong the camera doesn't know nor does it care but the ai overwatch, when it can learn, can
figure out what's happening and can guide the cameras to more accurate recordings, make sure every
single camera system, all [the] lifts and skills training have this overwatch."*

That framing is better than the one it corrected, and CLAUDE.md already licenses it: *"the
overwatch is fine, it can learn to understand the difference, what mattered was calibrating
numbers not leaking to other numbers."* **Recognising a stuck tracker is a RULE, not a fitted
number** — so it is shared, and every movement gets the benefit at once.

### What the audit found, and a correction to what was said first

`AvOverwatch.judge()` **does run on every frame of every capture mode**, before either object
tracker, exactly as the architecture requires. The first reading of the audit — that overwatch
never runs on the implement-less modes — was wrong and is corrected here.

What is true is worse, in Rule #4's own words. Its findings went to **one debug log line**
(`overwatch=\(overwatch.summary)`), and the only overwatch numbers that reached an export rode
inside `objectLock`, which is gated on `coreMlDetectionEnabled` — which is `coreMlTargetLabel
!= nil`, which comes from `trackingMode`, which **jump, sprint, mechanics and horizontal-load
still do not pass**. So on those four it ran and had its reading discarded on every take:
*"indistinguishable from being off and worse, because the diagnostics read as though it was
there."*

And the part that applies to every mode including the ones with an object: **`framesFrozen` has
never reached an export in this repo's history.** A tracker stuck on a frame is the single failure
overwatch exists to break, it has been counted since the day overwatch was written, and no
calibration session has ever been able to read it.

### What ships

`AvOverwatch.telemetry`, emitted on BOTH analysis paths and **gated on nothing**:

| field | what it separates |
|---|---|
| `framesJudged` | the denominator — a frozen count means nothing without it |
| `framesFrozen` | frames where the tracker had nothing new |
| `framesFrozenByImage` | the camera or decoder repeating a frame |
| `framesFrozenByLandmarks` | Vision returning a stale answer on a moving image — **the one that makes a tracker stick** |
| `longestFrozenRun` | a blink against a lock |
| `framesBodySuspect` | the body's span disagreeing with its own history |
| `framesWithYardstick` | the denominator for that |
| `frozenLandmarkFrames` | the threshold it was judged by, so a refit is attributable |

The two freeze causes are counted apart because they mean different things and only one of them
is a tracker problem. It **records and gates nothing** (Rule #1): `judge()` is untouched and still
makes every decision; this reports what it already decided. It appoints no sensor and removes none
(Rule #2).

`overwatch-reports-on-every-mode.test.ts` pins both emissions, that neither is wrapped in the
detector's flag (which is exactly how the four modes went silent), the two separated causes, the
per-capture reset, the zod declaration, and that the telemetry getter contains no branch — a
getter that started deciding something would be overwatch growing a sensor.

### Why this is the prerequisite and not the thing

Nothing can be learned from a number nobody writes down. With `framesFrozenByLandmarks` and
`longestFrozenRun` on every take across all 269 identities, "this tracker sticks on this kind of
movement" becomes a measurable claim for the first time — and a measurable claim is the only kind
`summarizeScaleEvidenceForMovement` can hand to the learning loop. The guidance half (overwatch
acting on a learned pattern) is the next step and wants the evidence first.

**Still not done:** the four implement-less trackers pass no `trackingMode` at all, so their
object detector is inert and Rule #4's "name what it DOES have — a box, a ground plane — or
record explicitly that it has none" is unmet. That is a separate change and is named here so it
is not mistaken for finished.

## Three lifts beside OVR, build 639, 2026-10-08 — and the sentence a hinge was told

Scott filmed a Romanian Deadlift, a Box Jump and a Back Squat on 2026-10-08 and sent four OVR
screenshots beside them, then asked one question about what the app had said to him:

> "For the deadlift, knees only reached -148? What's that number, and where did it come from?"

### The answer: 148 degrees, and it was squat coaching on a hinge

It was **148 degrees**, not −148. The dash was the app's own `~`. The number is the interior
hip–knee–ankle angle at the deepest point of the set — the 5th percentile across every tracked
frame, read off the 3D body pose by `frameKneeAngles` → `percentile(kneeAngles, 0.05)` in
`client/src/lib/pose-tracking.ts`. It cannot go negative: `worldAngleAtVertex` is an `acos` and
returns 0–180.

Where it came from is the finding. The sentence beside it read **"aim to break parallel"**, on a
Romanian deadlift — a lift whose own library instruction reads *"Soft knees, push hips back and
lower the bar along your legs."* **148 degrees IS a correct RDL.** An athlete who followed that
cue would turn a hinge into a bad squat.

The cause is one set doing two jobs. `LOWER_BODY_MOVEMENT_TYPES` = `{Squat, Hinge, Lunge}` answers
*"are the legs doing work here"*, which is the right question for loading the ROI landmarker and
for the faults that describe the legs. The depth fault was gated on it, and the depth fault's
WORDS assume a squat pattern. So did `forward_lean`'s ("excessive forward lean at the bottom") —
on a hinge, a folded torso is the rep.

`SQUAT_PATTERN_MOVEMENT_TYPES` = `{Squat, Lunge}` is the narrower gate, and only those two faults
move behind it. Knee valgus, pelvic drop and heel rise all describe something real on a deadlift —
Scott's own take was flagged for a hip drop and that read is fair — so they keep the wider gate. A
sweep that quietly took them too would be a refusal nobody asked for.

**Third instance of one error class in four days.** The RDL's height ruler (2026-10-05, a hinge
judged by a standing stature, −7.0%) and the Barbell Shoulder Press's seated label (2026-10-06, a
posture that cost it a ruler) were the same shape. Here it is a SENTENCE rather than a ruler.
It is a RULE, not a fitted number — so it is shared, `FITTED_OVERRIDES` stays empty, and every
hinge in the library gets it at once.

**`forward_lean` did not fire on this take, and that is not a reason to leave it.** It stayed quiet
only because the capture's torso read came back near-upright on a hinge
(`measuredPosture.torsoFromVerticalDeg` **7.13**, on 436 frames, where an RDL should approach 90).
A second measurement problem is not a gate. That 7.13 is **open** and is the next thing to read on
a hinge.

### And the number never reached the export, which is why it had to be asked about

`faultEvidence` carried `bar_path_drift` and `bar_tilt` and nothing else, so the depth figure the
athlete was shown could not be looked up — it had to be reconstructed from the code. All five
lower-body faults now note what they read and what they were judged against, firing or not, and a
suppressed one says `suppressedBecause: "movement_is_a_hinge"`. Records and gates nothing
(Rule #1). `a-hinge-is-not-a-shallow-squat.test.ts`, mutation-tested in both directions.

Known gap, recorded not filled: only `av-bar-tracker-dialog.tsx` passes an evidence array.
The web `bar-tracker-dialog.tsx` and `av-jump-tracker-dialog.tsx` pass none, so their notes go
nowhere. The gate itself is inside `detectFormFaults` and applies to all three.

### What the three takes measured

| | Forge | OVR | |
|---|---|---|---|
| **Back Squat** 135lb × 5 | ROM 69.1 cm | 74.2 cm (29.22 in) | **−6.9%** |
| | mean 0.75 | 0.852 | **−12.0%** |
| | peak 1.29 | 1.27 | **+1.6%** |
| **Romanian Deadlift** 135lb × 5 | ROM 61.8 cm | 64.2 cm (25.28 in) | **−3.7%** |
| | mean 0.72 | 1.002 | **−28.1%** |
| | peak 0.72 | 1.70 | **−57.6%** |
| **Box Jump**, 24 in (61.0 cm) box | jump height 67.2 cm | — | clears the box by 6.2 cm |

**The RDL's range of motion at −3.7% is the hinge fix holding.** Its scale candidates are
`shoulder_width` and `body_3d` with **no height ruler** — exactly what build 621 arranged — and
the result is the second-best hinge read this pipeline has produced.

**The Back Squat is the refit case 2026-10-05 asked for, and it is now well-posed.** That note
said `BIACROMIAL_HEIGHT_FRACTION` was "refittable only once a standing lift is read against the
sensor with the hinge fix in — the thing to look for in the next export." This is that take, and
it says something different from either earlier guess:

| candidate | scale (m/unit) | weight | vs. the 0.0039867 the sensor requires |
|---|---|---|---|
| `height` | 0.0033565 | **66.7%** | **−15.8%** |
| `body_3d:femur` | 0.0041736 | 16.7% | +4.7% |
| `shoulder_width` | 0.0046111 | 16.7% | +15.7% |
| `depth` | 0.0043049 | 0% (zeroed by design) | +8.0% |

Truth sits between `body_3d` and `depth`, and **the dominant voter is the one furthest from it**:
the height ruler carries two thirds of the blend on a correctly-labelled standing lift and reads
15.8% low. **NOT refitted.** One standing take is one take, 2026-10-06 measured `shoulder_width` as
the *least* biased voter across its own session (+5.5% median) and this take puts it at +15.7%,
and a constant fitted at the end of a session is how a bad one gets in. The thing to look for is a
second standing lift against the sensor with this build on the phone.

### Two faults in the numbers, named and not fitted

**THE RDL'S PEAK VELOCITY IS UNUSABLE AND THE EXPORT SAYS SO IN ONE FIELD.**
`trace.repPeaksFlooredToMean: 4` — on **all four** reps the instantaneous peak came out *below*
the rep's own mean (`peakFloored = rawPeak < mean` in `bar-tracking.ts`), which is impossible, so
each peak was set equal to its mean. That is why Forge reports peak = mean = 0.72 against the
OVR's 1.70. The Back Squat on the same session has `repPeaksFlooredToMean: 0`. Two more signs
point the same way and all three are about the hinge's phases, not its scale: Forge found **4 reps
on a 5-rep set**, and its eccentric reads *faster* than its concentric (1.01 against 0.72), which
is backwards for an RDL. The suspicion is that the drive window is landing on the wrong phase for
a movement that starts by going DOWN. **Not fitted** — this wants a hinge filmed with the window
diagnostics read, not a constant.

**The concentric window is long on both barbell lifts**, which the 2026-10-07 separation makes
readable: Back Squat ROM −6.9% against mean −12.0% is a window **+5.8%** long; the RDL's −3.7%
against −28.1% is **+33.9%**, on a set whose rep count is wrong, so it may be the segmentation
rather than the trim.

**The Box Jump is the first one in range.** 67.2 cm onto a 24 in (61.0 cm) box, clearing it by
6.2 cm — against 238.4 cm before build 621's flagged-rep fix and 0.636 of truth before 619's
gravity-ruler stand-down. It returned no rep breakdown (`trace: null`, `setRangeOfMotion: null`),
which is the jump path and not a fault, but means nothing per-rep is readable on it.

**The med-ball rotation has no Forge capture.** Scott filmed cleans in place of it and the OVR has
the set; this export's only 2026-10-08 rows are the three above. Same shape as the 2026-10-04 med
ball that never reached the server, and worth a look at the debug console's `SAVE` lines before
the next session.

### Also confirmed working on the phone from this export

The RDL's `axisForeshortening.ratio` is **1.000** and the squat's **1.092**; `cadenceHeld` is
0.934 / 1.000 with 0 dropouts on the squat; `objectGate.gripAcrossBodyFraction` 0.997 / 0.999;
`measuredPosture` present on both. `plateScaleIfAdmitted` is 0.001113 and 0.001147 against the
~0.0039 the takes need — **3.5× and 3.4× too small**, the same factor as 2026-10-07 and the same
cause: the CoreML model was trained on close-ups. All 266 training images are labelled now
(43 boxes → 1611, barbell 3 → 146) and **training the model has still not been run.** It is the
highest-value camera work in the repo.

## Three lifts beside OVR, build 651, 2026-10-09 — the scatter is the finding, not the bias

Bench Press 135×10, Pendlay Row 135×10, Push Press 65×10 (logged as Barbell Shoulder Press),
filmed back to back and read against the OVR. **Nothing in build 651 touches the camera** — its
six commits are emails, `/pricing`'s nav, upload-directory gating, a legal page and a class text
fix — so nothing here is a regression from it, and the `git diff` over the camera paths is empty.

| | ROM | mean | peak | reps | concentric window |
|---|---|---|---|---|---|
| Bench 135×10 | 32.0 vs 35.8 cm, **−10.6%** | +25.0% | +19.4% | 9 of 10 | −21.6% |
| Pendlay Row 135×10 | 71.6 vs 58.2, **+23.1%** | +58.7% | +22.2% | 10 ✓ | −17.8% |
| Push Press 65×10 | 75.4 vs 62.5, **+20.7%** | +25.9% | +33.3% | 9 of 10 | **+0.4%** |

### THE SAME LIFT DISAGREES WITH ITSELF BY AS MUCH AS IT DISAGREES WITH THE SENSOR

Scott: "I just feel like we're starting over everytime." He is right, and no session before this
one measured it. Across the 20 captures in the export, same athlete, same lift, same load:

| Lift | Load | ROM across takes | hi/lo |
|---|---|---|---|
| Pendlay Row | 135 | 42.6, 46.9, **71.6** | **1.68×** |
| Pendlay Row | 95 | 32.6, 35.2, 43.1 | 1.32× |
| Bench Press | 135 | 25.7, 28.4, 32.0, 32.5 | 1.26× |
| Shoulder Press | 65 | 63.0, 68.1, 71.4, 75.4 | 1.20× |

**And it is not drift between builds or between my sessions.** Ruled out on the takes that share
one: on 2026-10-07 sets 1 and 2 of each lift were both build **637** (set 3 was the first on 639,
so a three-set group spans two builds — an earlier draft of this section said otherwise and was
wrong). On that one build, minutes apart: bench 25.7 vs 32.5 (**1.26×**), press 71.4 vs 63.0
(1.13×), row 35.2 vs 32.6 (1.08×). A quarter of the bench's range of motion with no code change
between the two sets.

That reframes every session since 10-04. Each measured a BIAS on one take (the bench 39% low,
then 26%, then 21%, then 11%) and proposed or declined a constant. **A bias of 10–25% cannot be
fitted out of a measurement whose take-to-take spread is 6–24%** — each new session's single take
lands somewhere in that cloud and reads as a win or a regression depending where. Until the
spread comes down, a constant fitted on one session is fitted to noise. `shared/capture-
repeatability.ts` computes this over whatever captures the export holds, so it is answerable from
the file rather than from an afternoon of re-deriving it.

Per-ruler scatter (median CV across lift/load groups; lower is steadier):

| ruler | CV | present on |
|---|---|---|
| height | 7% | 9 of 20 |
| body_3d | 7% | 20 of 20 |
| shoulder_width | 12% | 19 of 20 |
| depth | 12% | 19 of 20 |

On the Pendlay Row, body_3d's spread is **1%** and shoulder_width's is **17–21%**.

### THE SHOULDER RULER IS ONE SPAN, AND THE SPAN FORESHORTENS

It is `BIACROMIAL_HEIGHT_FRACTION × height ÷ measuredSpan` and nothing else — confirmed on all
three takes, where scale × span came to **0.438 m** every time (0.23 × this athlete's 75in). So it
is wholly at the mercy of one measured span, and that span shrinks as the athlete turns while the
metres it divides do not.

| take | grip px ÷ shoulder span | shoulder ruler vs sensor |
|---|---|---|
| Bench | 159.2 / 108.2 = **1.47** | **+1.4%** |
| Push Press | 169.8 / 82.4 = **2.06** | **+49.1%** |
| Pendlay Row | 194.9 / 67.0 = **2.91** | **+62.0%** |

Exact ordering on 3/3, and a bench grip really is ~1.5× biacromial breadth, so 2.91 is not
anatomy — it is a shoulder span read at roughly half size. **`subjectFacing` read "oblique" on all
three and separated none of them.** `calibration.shoulderRuler.gripToShoulderSpanRatio` records
it; **nothing reads it**, because each take was a different lift and so had a genuinely different
grip — three confounded points cannot choose an uncertainty. What settles it is the same lift
filmed square and oblique.

**`spanSpreadFraction` (added 10-06 for exactly this job) does NOT predict the error**: the press
had the tightest spread, 0.042, and the second-worst error. First evidence either way on it.

**NOT refitted, and the evidence forbids it both ways.** `shoulder_width` is the only good ruler
on the bench (+1.4%, with body_3d at −29.7%), so refusing it takes the bench from −10.6% to
−29.7% — a refusal before its replacement, which Rule #1 forbids and this repo has shipped once.
On the row it is the opposite: body_3d −9.2%, shoulder +62.0%.

### THE OBJECT BOX IS 2–7× TOO BIG, AND NOW SAYS SO WITHOUT A SENSOR

Scott: "what happens when the camera can't find my shoulders, it should still be relying on the
barbell which can get an accurate frame almost everytime." Right, and that is Rule #4. The
implement IS found — 438, 135 and 431 frames on the three takes. What fails is sizing it:

| take | boxed | a 45cm plate at this take's scale | ratio |
|---|---|---|---|
| Push Press | 145 × 263 px | 126 px | **2.09×** |
| Pendlay Row | 164 × 314 px | 111 px | **2.81×** |
| Bench | 418 × 759 px | 113 px | **6.73×** |

All three aspect 0.52–0.55 (h/w ≈ 1.8), all three refused on `aspect_ratio`, all three correctly
— admitting them would have been far worse. **This is exactly what 10-07 predicted from the
training data**: a detector trained on close-ups predicts boxes too large, which a scale pipeline
reads as a scale too small.

`calibration.objectGate.plateBoxToExpectedRatio` ships it as a number on **every** take, with no
sensor: a bumper plate is 0.45m and the take blended its own metres per pixel, so a plate here
would box `0.45 / scaleFactor` px. `plateScaleIfAdmitted` (build 633) could only ever be scored
beside the OVR; this cannot. It is the number that says whether the retrain worked.

### Also recorded, not acted on

- **The row's `axisForeshortening.ratio` is 1.21** with `displacementAlongLensM` **5.899 m** —
  against 0.317 and 0.442 on the other two. 5.9 m of along-lens travel on a 10-rep row is not
  physical; it is 3D-pose depth noise, the least reliable axis. It also points the wrong way to
  explain a HIGH read. Not used.
- **Sampling predicts the miscount again.** `cadenceHeld` 0.725 (bench) and 0.843 (press) both
  returned 9 reps for a 10-rep set; the row at 0.939 returned 10. Third session of this pattern.
- **The press was performed as a push press** and is logged as a Barbell Shoulder Press. Its
  `axisForeshortening` is 1.006 here, against 1.452 on 10-07's push press, so this one was not
  dipped the same way. Its +20.7% is still not cleanly comparable to a strict press.

## Set 2 beside OVR, 2026-10-09 — a lone plate took the whole scale, and the fix lands all three inside 1.5%

Scott filmed a second set of each lift an hour after the first and exported again. **This is the
pairing that settles Rule #5**, because the sensor reports its own repeatability beside Forge's.

| lift | OVR set1 → set2 | FORGE set1 → set2 |
|---|---|---|
| Bench Press 135 | 1.01× | 1.14× |
| Push Press 65 | 1.05× | 1.14× |
| Pendlay Row 135 | **1.03×** | **3.21×** |

The athlete repeated to within 1–5%. Forge's two reads of those same sets differed by up to
3.21×. There was never a bias to fit.

### The error against the sensor, both sets

| lift | set 1 ROM | set 2 ROM | set 2 after the fix |
|---|---|---|---|
| Bench 135×10 | −10.6% | **+1.5%** | +1.5% |
| Push Press 65×10 | +20.7% | **+1.3%** | +1.3% |
| Pendlay Row 135×10 | +23.1% | **−60.5%** | **−1.1%** |

### THE BUG: `voters.length >= 3`, counted after the collapse

Row set 2's blend: `source: plate`, `cluster: ["plate"]`, `plateSteppedOut: false`, plate at
**100%** of the weight reading 0.00139 — while `body_3d` read 0.00342 (−2.7%) and `depth` read
0.00353 (+0.4%) against a truth of 0.00352, both at **0%**. `pairwise` shows `agrees: false` in
both directions, ratio 2.5 / 0.4.

The guard that exists for exactly this ("a plate nobody agrees with is not a plate", build 594)
tested `voters.length >= 3` — and `voters` is counted AFTER the 3D-pose collapse folds `body_3d`
and `depth` into one witness. A take whose rulers are {plate, body_3d, depth} — the commonest
shape there is — therefore arrives with TWO voters and the guard sleeps.

The collapse is right about *agreement* (Rule #2: a correlated pair must not out-vote a third).
Reusing its output as a *corroboration count* is a different question: two readings that agree
with each other to 3% and both disagree with the plate by 2.5× are not "one against one, a tie
rank may break". The count is now taken on independent non-plate READINGS, before the collapse.
One non-plate ruler still leaves the plate its rank, which is the tie the original comment meant
to protect.

**Replayed over every capture in the export: ONE moved — the broken one, +150% — and 13 are
bit-identical.** `a-lone-plate-never-takes-the-whole-scale.test.ts`, mutation-tested three ways
(reverting the count, firing at one ruler, firing on a corroborated plate). A RULE, not a fitted
number, so it is shared and `FITTED_OVERRIDES` stays empty.

### And the box diagnostic shipped that morning was circular, proved by this take

`plateBoxToExpectedRatio` divided by the take's final `scaleFactor`. On this row the plate WON at
100%, so `0.45 / scaleFactor` returns the plate's own box and the ratio read **1.000** — a perfect
score on the take whose plate was 60% wrong. It divides by the blend with the plate removed now.
A diagnostic that scores a ruler against itself is worth nothing exactly when the ruler is the
problem.

### Still open after this

- **The row's set-1 +23.1% is a different fault** — no plate at all that take (refused on
  `aspect_ratio`), and `shoulder_width` at +62.0% took half the vote. The grip/shoulder ratio was
  3.20 on set 2 and the ruler read +69.2% there, which is the same relationship as the morning's
  three takes and now has a fourth point. Still not fitted: all four are different lifts or
  different sets, and the confound stands.
- **The bench's mean is +16.4% on set 2 with ROM at +1.5%**, so the timing window is short again
  on a take whose scale is essentially exact. That is the cleanest look yet at the window error
  with scale held still.

### The grip says when the shoulder span cannot be right (2026-10-09, after the plate fix)

Six sensor-paired takes, and the confound that blocked this in the morning is broken by filming
the same lift twice:

| grip ÷ shoulder span | shoulder ruler vs OVR | take |
|---|---|---|
| 1.47 | +1.4% | Bench set 1 |
| 1.74 | +8.3% | Bench set 2 |
| 2.06 | +49.1% | Push Press set 1 |
| 2.16 | +25.8% | Push Press set 2 |
| 2.91 | +62.0% | Pendlay Row set 1 |
| 3.20 | +69.2% | Pendlay Row set 2 |

Five of six order exactly; the pair that inverts is the two presses. **The two row sets are the
ones that matter** — same lift, same grip, same session, 2.91 → +62.0% then 3.20 → +69.2%.

The ruler is `BIACROMIAL_HEIGHT_FRACTION × height ÷ one measured span` and nothing else (scale ×
span = 0.438 m on all six). Anatomy bounds the ratio: the widest barbell grip is ~0.81 m against
a biacromial breadth of 0.23 × stature, a ceiling of **1.85** for this athlete. A ratio above it
is not a grip anyone can take.

Carried as **uncertainty, never a correction**, and **floored** so it can only loosen — the blend
is already inverse-variance weighted and has only ever been handed a guessed 0.2. The ceiling is
**derived per athlete** from two constants that already exist, so `FITTED_OVERRIDES` stays empty.

**THE MECHANISM IS NOT SETTLED AND THE CODE COMMENT SAYS SO.** Rotation about the vertical axis
foreshortens grip and shoulders *together*, which would leave the ratio invariant — so plain
turning does not explain it. The likelier cause is the shoulder landmarks collapsing toward the
spine on a hinged or supine athlete, which is where both ratios past 2.9 sit. What is established
is that the ratio is measured from a signal this ruler does not produce, tracks its error across
six paired takes, and is past anatomy on every take where the ruler is badly wrong.

**Replayed across all 14 captures: two moved.**

| take | before | after | against the sensor |
|---|---|---|---|
| Pendlay Row set 1 | 0.004970 | 0.003740 | **+23.1% → −7.4%** |
| Back Squat 2026-10-08 | 0.003713 | 0.003628 | **−6.9% → −9.0%**, worse |

The squat moving the wrong way is recorded, not smoothed over: it is 2.3% against the row's 30,
median absolute error across the six paired takes falls 6.1% → 4.5%, and the worst case falls
from 23.1% to 20.7%. `the-grip-says-when-the-shoulder-span-is-wrong.test.ts`, mutation-tested
four ways — and the "only ever loosens" case survived two drafts because the fixture's own spread
moved the median below the ceiling, which is why the grip is now derived from the span the ruler
actually measured.

### Set 3, same day: build 654's own fix had a regression, and the three rows are what moved

Scott filmed a third set of each and exported again (one capture looked duplicated on save; the
export shows 20 distinct rows and no duplicate lift+set, so the second save was idempotent).

| lift | set | before | **after both fixes** |
|---|---|---|---|
| Bench | 1 / 2 / 3 | −10.6% / +1.5% / −2.4% | unchanged |
| Push Press | 1 / 2 / 3 | +20.7% / +1.3% / −5.4% | unchanged |
| Pendlay Row | 1 / 2 / 3 | +23.1% / −60.5% / −58.4% | **−7.4% / −1.1% / −14.0%** |

Median absolute error across the nine paired takes **10.6% → 5.4%**; worst case **60.5% → 20.7%**.
Only the three rows and the 10-08 squat move; the other ten captures are bit-identical.

**THE REGRESSION WAS MINE, FROM 654, AND SET 3 FOUND IT IN UNDER AN HOUR.** The grip floor
correctly put the shoulder ruler at 0.587 on that take. The agreement tolerance was the looser
ruler's uncertainty **doubled**, so it became **1.174** — and at that width the shoulder ruler
"agreed" with a plate 3.5× away and a body ruler 1.85× away. All three formed ONE cluster
anchored on the vaguest witness present, and the plate (stated 0.0133, so 5,625× a body ruler's
weight) then took **99.5%** of the blend.

So loosening a ruler was buying it the power to drag other witnesses into a cluster. A ruler that
cannot tell 1.85× from agreement is abstaining, and an abstention must not vouch for a third
witness. `MAX_SCALE_AGREEMENT_TOLERANCE` caps the window at 0.4 — what a normally-stated ruler
already asked for — so it can only ever make the test **stricter**, never admit a pair the old
code refused. The loosened ruler still loses weight in the blend, which is the point of the floor.

`a-vague-ruler-cannot-vouch-for-anyone.test.ts`. Two of three mutations caught; the third
("implement the cap by clamping each uncertainty instead") turned out to be algebraically
identical, which is a refactor rather than a mutation. The "stricter only" assertion needed
`corroborated` rather than `agreedSources`, because two body rulers that DISAGREE are averaged by
the body-ruler fallback anyway and the weaker assertion could not tell the two apart.

**Scott's own read confirms the diagnosis on the row**: "first 3 reps were .5 m/s in both
directions, low then high then low". The export's reps 1–3 are 0.61 / 0.67 / 0.58 — low, high,
low — against the OVR's 0.87 / 1.12 / 1.12. Concentric and eccentric both low by the same factor
is the signature of a uniform SCALE error, not a segmentation one, which is exactly what the
0.42× scale was.

**Still open:** the row is the only lift not inside 15%, and no ruler on set 3 is right — truth
sits between the body rulers (−21%) and the shoulder ruler (+46%). The press's set-1 +20.7% is
also untouched by any of this.

## The detector was retrained, and this is the only thing left that can fix the row, 2026-10-09

Scott, on the three rows still being the one lift outside 15%: *"Why didn't you fix everything?
It's no use testing the camera if everything isn't fixed and now we're wasting more time. Fix the
row. Then reupload."*

**He is right, and the row cannot be fixed by weighting body rulers, which is why the morning's
three fixes did not reach it.** On set 3 the four candidates bracket the truth and no combination
of them lands on it: `body_3d` and `depth` read −21%, `shoulder_width` reads +46%, and truth sits
between them. Set 1 is the same shape in the other direction. Fitting a bone preference or a
per-ruler weight to close that gap would be fitting one number on one lift, which is what
`FITTED_OVERRIDES` stays empty to prevent — and it would move the bench and the press, which are
already inside 5%, because every ruler uncertainty is SHARED (see CLAUDE.md, "one code path,
per-lift values").

What the row needs is the one ruler in the scene whose real size is KNOWN, and that is the object
(Rule #4: "a number corroborated by one system is not a trusted number, it is an assertion").
That ruler has never worked. It is recorded here three sessions running:
`plateScaleIfAdmitted` 3.9× / 4.7× / 1.9× too small on 2026-10-07, every gate refusing it
correctly, and the barbell class producing `candidatesSeenOfClass: 0` on every barbell take ever
filmed. The cause was recorded at the same time: the model was trained on **43 labelled boxes
across 41 images**, barbell 3 of them.

### What was done

All 266 images were labelled on 2026-10-07 (1,611 boxes; barbell 3 → 146). The model is now
trained on them. 100 epochs requested, stopped at **epoch 84** by its time limit; the best
checkpoint is **epoch 59** (mAP50 0.4755) and the 25 epochs after it never beat it, so the run
had plateaued and `best.pt` is the right artifact rather than a truncation.

**mAP is the wrong headline and `scripts/med-ball-detector/validate_box_size.py` exists because
of it.** The pipeline divides a plate's nominal diameter by the box's long edge in pixels, so a
box 2× too large reports a scale 2× too small — and a detector can post a respectable mAP with
systematically oversized boxes, because a 0.5 IoU threshold tolerates a lot of slack. That is
precisely what the old model did. So the measurement is the ratio of long edges against
IoU-matched ground truth, at the pipeline's own `minDetectionConfidence` of 0.25, on the 41
held-out val images:

| class | gt boxes | matched | recall | size ratio (median) |
|---|---:|---:|---:|---:|
| plate | 96 | 77 | 80% | **1.01** |
| dumbbell | 53 | 23 | 43% | 1.00 |
| barbell | 30 | 19 | 63% | **1.03** |
| baseball | 20 | 10 | 50% | 1.08 |
| golf_ball | 11 | 4 | 36% | 1.10 |
| kettlebell | 6 | 5 | 83% | 1.13 |
| tennis_ball | 6 | 5 | 83% | 1.12 |
| med_ball | 5 | 2 | 40% | 1.18 |
| **all** | 227 | 145 | 64% | **1.03** |

The two rows that carry the barbell lifts are `plate` 1.01 at 80% recall and `barbell` 1.03 at
63%, against a shipped model whose plate boxes were 2–7× too large on real takes and whose
barbell class had never produced a single detection.

**The 225 new images are also the half that matters**, which is why a box-size fix is plausible
from labelling alone: they are 1440×1920 portrait with objects at 2–15% of the frame — the
geometry the phone hands the detector — against 26–56% in the 41 close-ups the old model was
trained on. A detector trained on close-ups predicts boxes too large, which a scale pipeline
reads as a scale too small. The measured symptom and the dataset geometry agree.

### Three caveats, none of them optional

- **`med_ball` (n=2) and `golf_ball` (n=4) medians mean nothing.** Two matched boxes is not a
  measurement. The val split was fixed before anybody knew which classes were thin.
- **Recall is modest and that is the acceptable half of the trade.** A box the pipeline refuses is
  worth nothing, and the old model's boxes were refused on every take — so 80% of plates at the
  right size beats 100% at 2×. Rule #1 is unaffected: a take whose object is not found still
  writes its numbers off the body rulers, with the caveat.
- **This measures `best.pt`, not the shipped `.mlpackage`.** `coremltools` converts on Linux but
  cannot `predict()` — that needs macOS. The export is the same graph at fp16, a real if small
  difference. **The shipped proof is `plateBoxToExpectedRatio` near 1.0** in the next filmed set's
  `trackingDiagnostics.objectGate`, which has been in the export since build 652 and exists for
  exactly this question. Beside it, `plateScaleIfAdmitted` is the number to read against the
  sensor's required scale, and `candidatesSeenOfClass` for the barbell is the one to read for the
  secondary witness that has never held a lock.

### What is NOT claimed

**Nothing here says the row is fixed.** It says the row's remaining error has one candidate cause
left, that cause is now measurably better on held-out data, and the take that proves or disproves
it has not been filmed. No constant moved, no gate loosened, no ruler reweighted — if the new
boxes are still wrong the gates will refuse them exactly as before and the row will read what it
reads today. That is the correct behaviour and is the reason the gates were not touched in the
same change.

### The ratchet, and the failure it exists for

`shared/the-shipped-detector-knows-every-class-we-ask-for.test.ts`. `targetLabel` hands Vision a
class NAME; a name the model does not carry produces no error, no log and no detection, so the
diagnostics read **exactly** as they do for a mode that passes no `trackingMode` at all — Rule
#4's "indistinguishable from being off and worse". A retrain is where a class gets renamed,
dropped or reordered, because the dataset yaml decides the list and nothing downstream complains.

It scans in both directions and holds no list of its own: the modes come out of the Swift
allow-list, the classes out of the shipped model's own protobuf label vector, and every mode must
be a class. It matches the **tagged** protobuf form (`0x0A <len> <bytes>`) rather than a bare
substring, and that is load-bearing — each of the eight names also appears twice in the model's
metadata, so on a doctored model with `barbell` dropped from the label vector the bare search
passes and the tagged search fails. Four mutations caught: an unknown mode, an unknown secondary
label, a missing model file, and the bare-substring discriminator.

## The plate ruler claimed to be four times more precise than the detector it reads, 2026-10-09

Found while projecting what the retrained detector does to the Pendlay Row, which is the right
time to find it: the retrain is what makes the plate's weight matter.

`computeReferenceObjectScale` returns `knownRealSizeM / measuredPixelSize` and propagated the
**numerator's** uncertainty only — `toleranceM / knownRealSizeM`, the plate's casting tolerance,
6mm on 450mm, **1.3%** — with nothing said about the denominator. That denominator is a CoreML
box's long edge, and it is the least certain term in the calculation by a factor of four:
`validate_box_size.py` measures its relative MAD at **0.056** on 77 held-out plate boxes (barbell
0.049 over 19, dumbbell 0.051 over 23 — the three agree, and the widest is the one to state).

The blend weights by 1/σ², so understating the noise fourfold overstated the plate's weight by
**~18×**: 225× a body ruler's where the measurement supports 12×. That is the mechanism behind
build 653's bug rather than a separate one — it is why a plate 60% wrong could carry 100% of a
vote against two body rulers that agreed with each other to 3%.

`measurementUncertaintyFraction` is the missing term, combined in quadrature because the two are
independent (how big the disc is, and how well the detector boxed it). It **defaults to zero**, so
a coach's own tape measure still states 0 and no other caller changes. A measurement replacing a
term that was simply absent — the same move as the grip floor, and the one the learning-loop note
argues for in words: the blend is already inverse-variance weighted and has only ever been handed
guessed variances.

**It is a property of the DETECTOR, not of a movement**, measured on 77 boxes across 41
photographs of other people's gyms, so it is shared by all 269 identities and goes nowhere near
the per-lift registry. `FITTED_OVERRIDES` stays empty.

**NOTHING IN THE CORPUS MOVES.** Every 2026-10-09 take whose plate carried weight had it stepped
out by 653/655, so no currently-correct take has a weighted plate. This takes effect only once the
detector produces admissible plates, which is what the retrain is for. Whole unit suite green;
`the-plate-states-the-detectors-own-noise.test.ts`, mutation-tested six ways (reverting to the
tolerance alone, adding instead of quadrature, the constant at 0, the constant at 0.5, dropping
the negative guard, and the ruler no longer passing it).

### What a right-sized plate does to the row, projected

Replaying row set 3's own candidates (`body_3d` and `depth` at −21%, `shoulder_width` at +46%,
truth between them) against a plate at each box size, with the new uncertainty:

| box size | plate vs truth | blend vs truth | plate weight |
|---|---|---|---|
| 1.00× | 0% | **−1.6%** | 92% |
| **1.03×** (measured median) | −3% | **−4.3%** | 92% |
| 1.10× | −9% | −10.0% | 92% |
| 1.16× (measured p90) | −14% | −14.3% | 92% |
| 1.25× | −20% | **−20.1%** | 92% |
| 2.42× (what shipped) | −59% | −14.0% | **stepped out** |

Today the row reads **−14.0%** on its body rulers alone.

**THE TAIL IS OPEN AND NO GATE WAS INVENTED FOR IT.** Read that table honestly: the blend follows
the plate at every box size the guards admit, and the step-out only fires when the plate is ~2.4×
off. A plate 25% wrong still agrees with a body ruler inside the tolerance, carries 92%, and takes
the row to −20% — **worse than no plate at all**. 6% of val plates box past 1.25×.

Three reasons that is recorded rather than gated:

- **The band has never been observed on a real take.** Every plate the pipeline has seen was
  grossly wrong (2–7×) and correctly refused. Fitting a gate to a projection is how the refusals
  this repo has already had to unship got written.
- **`plateBoxToExpectedRatio` reports it directly and has never been read on a real take** — it
  shipped in 652, hours ago. The measurement that would justify a gate arrives with the next
  filmed set.
- **A tighter agreement tolerance is the obvious lever and would break the body rulers.** 25%
  disagreement is inside `max(σ)×2`, and the body rulers need that width to cluster at all.

So: the honest uncertainty ships, the retrain ships, and what to read next is
`plateBoxToExpectedRatio` beside `plateScaleIfAdmitted`. If the box lands near 1.0 the row is
solved; if it lands at 1.2–1.5 the next piece of work is a corroboration rule that can tell a
25% disagreement from agreement, and it will be written against a measured take rather than this
table.

## State of the per-lift registry, verified 2026-10-16 (before the upper-body session)

Scott, about to film: "I had opus separate the cameras ... it's close to almost 300 camera
systems, that way changing accuracy on the bench press didn't change accuracy on squats ... Go
over what opus did, make sure each camera is actually separate."

Checked against the code on `3aedf553`, with the registry's own tests re-run (38 cases, green):

**What IS separate.** `shared/camera-tunables-by-lift.ts` hands out one fresh record per
identity -- 54 filmable exercises plus 216 skill drills, 270 records -- and
`every-filmable-thing-has-its-own-numbers.test.ts` scribbles on one to prove the other 269 are
untouched. Each record carries twelve lift numbers (`minRomFractionOfHeight`,
`maxRomFractionOfHeight`, `travelOnsetMarginM`, `maxPeakToMeanRatio`, `driveOnsetFraction`,
`maxDeviationFractionOfHeight`, `maxCountTrimPerEdge`, `minCountTrimOddness`,
`heightRulerUncertainty`, `depthRulerBias`, `depthRulerUncertainty`, `maxShoulderSpanSpread`) and
eleven gates copied per TRACKER (nineteen trackers: bar, squat, deadlift, overhead_press,
olympic, kb_swing, med_ball, golf_swing, baseball_swing, jump, sprint, mechanics,
horizontal_load and the rest). `summarizeTrackedSet` reads them off the record; the arbiter
takes them per capture at both native entry points.

**What that separation MEANS, and what it does not.** Every one of the 270 records holds the
SAME values today, because `FITTED_OVERRIDES` is empty: no number has yet been fitted on one
lift in isolation. The registry is the machinery that lets a bench-only fit stay bench-only; it
is not evidence that the bench has been calibrated apart from the squat. Every refit so far was
applied to the shared mechanism on purpose and moved all 270 together, because each was fitted
across several movements or is a rule rather than a number: `DRIVE_ONSET_FRACTION` 0.07 -> 0.04
(thirteen sets, five movements), the plate stating the detector's own noise, the agreement cap,
the lone-plate step-out, the grip floor.

**What is STILL SHARED, read straight off a module constant, each with its reason.** A reader
should know these before concluding that a bench change cannot reach the squat:

| constant | value | where | why it is shared |
|---|---|---|---|
| `BIACROMIAL_HEIGHT_FRACTION` | 0.23 | pose-tracking.ts | anatomy, not a fit |
| `BIACROMIAL_TOLERANCE_FRACTION` | 0.2 | pose-tracking.ts | the shoulder ruler's stated noise floor; a property of the landmarks |
| `MAX_SCALE_AGREEMENT_TOLERANCE` | 0.4 | pose-tracking.ts | the blend's agreement window, a rule (the 654 regression) |
| `BODY_3D_CORRECTED_UNCERTAINTY` | 0.2 | body-3d-ruler.ts | set from seven paired benches on 2026-09-30, BEFORE the registry existed; the one shared number with a single-lift pedigree |
| `BODY_3D_MEASURED/UNCORRECTED_UNCERTAINTY` | 0.05 / 0.3 | body-3d-ruler.ts | 3D-pose properties |
| `COREML_BOX_LONG_EDGE_UNCERTAINTY` | 0.056 | pose-tracking.ts | measured on the detector's held-out boxes; a property of the detector |
| `EDGE_OVERSIZED_AMPLITUDE_RATIO` | 1.6 | bar-tracking.ts (local) | the row's pickup rule |

The `BODY_3D_CORRECTED_UNCERTAINTY` row is the one to watch: it was fitted on benches and sits
shared. By CLAUDE.md's own test ("could somebody fit this from one take") it belongs in the
registry the way `maxShoulderSpanSpread` was moved there on 2026-10-08. Not moved today -- a
move on the morning of a filming session is how a number drifts -- but it is the next
candidate, and until then a bench-fitted body_3d uncertainty would move the squat.

**Why "5% one day, 40% a few days later" is not the registry failing.** Rule #5 (2026-10-09):
the same lift on the same build disagrees with itself by 6-24% between two sets minutes apart
(bench ROM 25.7 vs 32.5cm on build 637). A single take lands anywhere in that cloud, so one
session reads as a win and the next as a regression with no code change between them. The
`repeatability` block in the admin capture download measures it per lift. Before any constant
moves today, the spread across today's sets is read first.

## Three 2026-10-08 changes that never got a section here, written down 2026-10-16

Each shipped with a full commit message and no note in this file or CLAUDE.md, which is the
drift the notes exist to prevent. Recorded from the commits, nothing re-derived.

- **`12eb33ac` -- `MAX_SHOULDER_SPAN_SPREAD` was a number fitted on one Pendlay Row and sat as a
  shared constant deciding whether the shoulder ruler votes on all 269.** 0.4 was chosen
  2026-10-06 to refuse build 632's row (self-disagreement 0.464) while keeping the press (0.063)
  and the bench (0.21). It is `maxShoulderSpanSpread` in the registry now, copied identically into
  every record, and `shoulderWidthScaleFromFrames` takes it as a defaulted parameter. No number
  moved. **And the copy test had no exhaustiveness check**, which is how the field arrived
  unpinned: `camera-tunables-are-a-copy.test.ts` now asserts every key in
  `SHARED_CAMERA_TUNABLES` has a pin, which found five more unpinned since the registry landed
  (`maxPlausibleAccelG`, `occlusionMinGapMs`, `occlusionMaxGapMs`, and `maxCountTrimPerEdge` /
  `minCountTrimOddness`, which have no constant left to pin against because bar-tracking.ts reads
  them straight off the record -- named in `REGISTRY_IS_THE_SOURCE` as the end state, not an
  exemption).
- **`894849c8` -- a hinge is visible at its extreme, not at its median.** The 2026-10-08 RDL
  recorded `measuredPosture.torsoFromVerticalDeg` 7.13 over 436 frames beside a comment promising
  "approaching 90 on a hinge". The statistic is a MEDIAN and a hinging athlete is upright between
  reps, through the setup and at the finish, so the median sits near zero however deep the hinge
  goes; the 2026-10-06 claim that this field would have caught the mislabelled RDL was wrong.
  `torsoFromVerticalP90Deg` (the 90th percentile, the bottom of the rep) and
  `torsoAtLongestSpanDeg` (the torso angle on the frame whose nose-to-ankle span was longest, the
  frame the height ruler is most wrong on) are recorded beside it. Records and gates nothing.
- **`45bd0815` -- a floored peak says how far it was floored, and what it was read from.** The
  same RDL reported peak = mean = 0.72 m/s on every rep against the OVR's 1.70, and the only
  trace in the export was `trace.repPeaksFlooredToMean: 4` -- a count, so a rep floored by a hair
  and one floored by a factor of two read identically. Each rep now carries `rawPeakMps` (what the
  instantaneous peak was before the floor or cap), `peakFloored`, `peakCapped`,
  `peakSamplesInWindow`, `peakSamplesBelowConfidence` and `peakUsedRawFallback`. Records and
  gates nothing; the next hinge take says whether the floor is hiding a drive window on the wrong
  phase.

## Three lifts beside OVR, 2026-10-19 — the export came back empty, and why

Scott, opening the session: "remember take notes on what we've tried so we don't keep doing
wrong things, I'm using jump squat for box jump on the OVR, my camera didn't record the first 5,
so count just the last 5 reps." This section is the running log for the day. Nothing below moves
a constant; `FITTED_OVERRIDES` stays empty.

### What was filmed, and what the server saw

Three lifts on the **admin account** (the first calibration session there -- every earlier
corpus was filmed on the demo athlete, see below), each saved through `POST /api/admin/my/log`:

| UTC | save | clip | lift (OVR) |
|---|---|---|---|
| 19:13:54 – 19:15:11 | 200 ×4 (one 401 at 19:13:56, a stale session, retried) | 201 at 19:14:40 | Back Squat 135 × 5 |
| 19:17:18 | 200 | 201 at 19:17:17 | Box jump; OVR running **Jump Squat 1 lb × 12** |
| 19:20:24 – 19:21:16 | 200 ×3 | 201 at 19:21:15 | Deadlift 135 × 8 |

Then at 19:21:42 `GET /api/admin/capture-export.json` answered in 13 ms with
`captures: [], skillCaptures: []`. Every save landed and every clip uploaded; the one file
calibration reads showed nothing.

### Why: four athlete-only gates in a row, each correct on its own

Read off the code, not guessed; each one names its function:

1. **`captureField` in `submitWorkoutLog` (server/storage.ts)** withholds `barPathTrace`,
   `armPathTrace` and the skeleton frames from an account with no `biometric_waiver` consent on
   file, and stores everything else. Correct, and role-blind.
2. **`toPublicUserWithSections` (server/auth.ts)** computed `biometricReleaseRequired` -- the
   flag that makes the workout screen ASK before opening the camera -- inside
   `if (user.role === "athlete")`. A coach or admin, whom `cameraAccessFor` lets film by role
   alone, got no flag, so `startTracking` in workout.tsx opened the tracker without asking.
3. **`recordBiometricRelease` (server/storage.ts)** answered "Not found." to any role but
   athlete, so even a coach who found the dialog could not have agreed. The route above it
   (`POST /api/account/biometric-release`) took any signed-in account from the day it was
   written -- the middleware was honest and the method was not.
4. **`getStoredCapturesForReplay` (server/storage.ts)** -- the export's query -- required a
   non-empty `barPathTrace`, which is precisely the column gate 1 withholds. The tracking
   report (`getRecentTrackedSetsForAdmin`) uses the evidence-column rule and would have shown
   the three sets; the export did not, and said nothing about why.

So: offered Record, filmed, numbers stored, trace withheld by consent, export blind to a set
without a trace. The same shape as the day's other find (Opus, the profile dialog: "a trigger
must never be gated more loosely than the thing it opens"), in the consent direction.

### What changed (server-side, ships on Render; no number moved)

- `shared/roles-that-film-their-own-training.ts` names the set {athlete, coach, admin} once.
  `toPublicUserWithSections` computes both release flags for that set, with the adult test
  role-first (an admin row may carry no date of birth and must not read as a minor waiting on a
  guardian); `recordBiometricRelease` accepts the same set and keeps the guardian rule for an
  athlete minor. `a-filming-role-is-asked-for-the-release.test.ts` holds the set equal to what
  `cameraAccessFor` grants by role.
- `cameraCaptureEvidence()` is the ONE membership rule, read by the tracking report and the
  export alike. A capture whose trace was withheld is a row in the export with
  `barPathTrace: null` and `traceAbsentBecause: "no_biometric_release_on_file_for_this_account"`
  (or `"no_trace_stored"` when consent is on file and the trace is still absent). Same principle
  as the report: a capture that lost part of itself is visible AS that, never absent.
- `biometric-capture-gate.itest.ts` drives both on real Postgres: an admin and a coach are
  asked and can agree; a trace-less capture appears in the export with the reason, and after
  the release the same save carries its trace.

### What is lost, and what is not

The three traces from today were never stored -- the gate was right to withhold them and there
is nothing to recover. The velocity, range of motion, jump height, rep breakdowns, trust scores
and `trackingDiagnostics` for all three sets ARE in the database and will be in the next export
download. The video is on the server too. **Next:** Scott accepts the biometric release once
(the workout screen now asks before Record on the admin account); every set after that carries
its trace and its skeleton frames.

### The old corpus is gone from production, and why

The capture export on 2026-10-09 carried 20 captures; today it would carry 0 even with the fix,
before today's three. Those sets were filmed on the demo athlete (Scott, 2026-10-11: "all my
numbers I've ever recorded were lower weights at testing numbers only" -- on Jordan), and that
account was purged with the other seven on 2026-10-11. `workout_set_entries` has **no foreign
keys** (the offload job's own line this morning: "1213 rows hold frames but none joined to a
day: 1213 have no entry ... the table has 0 foreign keys"), so the set rows survived the cascade
as orphans while their log entries did not -- and every reader joins through the entry. The
20-capture replay corpus in the repo (`count-trim-never-empties-a-set.test.ts` and the OVR
fixtures) is unaffected. Deleting the orphans and restoring the keys is a separate change
awaiting Scott's word, not part of this one.

### What was tried today, in order

1. Suspected the saves never left the phone (build 625's class). Ruled out by the Render log
   above: every POST answered 200, every clip 201.
2. Suspected the export query. Confirmed: `isNotNull(barPathTrace)` and the consent gate.
3. Tried to read today's numbers straight off the production database from the sandbox -- not
   possible (the environment's network policy refuses the Postgres host; HTTPS only). The
   numbers wait on the re-downloaded export.
4. Nothing fitted. Rule #5: with no Forge number in hand there is no scatter to measure and no
   bias to fit.

### OVR ground truth, 2026-10-19 (Scott, 36, all 135 lb except the jump squat at 1 lb)

Per rep: Avg m/s / Peak m/s / ROM in / Avg W / Peak W / TPV s / EAI.

**Back Squat 135 × 5** -- set 0.86 / 1.30 / 29.3 / 516 / 781 / 0.60 / 2.17

| rep | avg | peak | ROM | avg W | peak W | TPV | EAI |
|---|---|---|---|---|---|---|---|
| 1 | 0.93 | 1.47 | 28.5 | 561 | 884 | 0.54 | 2.68 |
| 2 | 0.95 | 1.49 | 28.9 | 570 | 892 | 0.53 | 2.76 |
| 3 | 0.86 | 1.29 | 29.1 | 514 | 776 | 0.56 | 2.21 |
| 4 | 0.75 | 1.03 | 29.4 | 450 | 619 | 0.63 | 1.61 |
| 5 | 0.82 | 1.22 | 30.9 | 489 | 735 | 0.76 | 1.60 |

**Jump Squat 1 lb × 12, the OVR stand-in for the box jump.** The camera missed the first reps,
so **Forge's box jump is compared against OVR reps 8–12 only** (set-level OVR numbers include
the seven the camera never saw and are NOT the comparison):

| rep | avg | peak | ROM | avg W | peak W | TPV | EAI |
|---|---|---|---|---|---|---|---|
| 8 | 1.59 | 2.99 | 28.0 | 7 | 13 | 0.13 | 22.12 |
| 9 | 1.48 | 2.73 | 26.8 | 6 | 12 | 0.10 | 25.23 |
| 10 | 1.46 | 3.00 | 26.9 | 6 | 13 | 0.17 | 17.55 |
| 11 | 1.59 | 2.67 | 27.7 | 7 | 11 | 0.17 | 15.61 |
| 12 | 1.49 | 3.07 | 26.9 | 6 | 13 | 0.16 | 18.94 |

(For the record, reps 1–7: 0.32/0.73/35.2; 1.59/2.82/28.5; 1.60/3.07/28.8; 1.51/2.82/28.9;
1.52/3.00/27.9; 1.50/3.03/28.5; 1.06/1.65/30.6. Set 1.39 / 2.63 / 28.7 / 5 / 11 / 0.21 / 16.75.)
Note the OVR's ROM here is the bar's travel on a loaded jump squat, not a jump height; the
comparable Forge number is the hip's takeoff velocity and the countermovement, not
`jumpHeightCm`. A 1 lb load makes the OVR's power columns meaningless.

**Deadlift 135 × 8** -- set 0.89 / 1.59 / 22.0 / 538 / 955 / 0.33 / 4.74

| rep | avg | peak | ROM | avg W | peak W | TPV | EAI |
|---|---|---|---|---|---|---|---|
| 1 | 0.89 | 1.58 | 22.1 | 537 | 950 | 0.35 | 4.50 |
| 2 | 0.98 | 1.78 | 22.5 | 589 | 1066 | 0.32 | 5.51 |
| 3 | 0.97 | 1.73 | 22.4 | 583 | 1041 | 0.31 | 5.50 |
| 4 | 0.92 | 1.65 | 21.5 | 551 | 991 | 0.31 | 5.24 |
| 5 | 0.84 | 1.49 | 21.4 | 505 | 892 | 0.33 | 4.48 |
| 6 | 0.88 | 1.53 | 22.3 | 526 | 917 | 0.34 | 4.49 |
| 7 | 0.93 | 1.68 | 23.2 | 556 | 1008 | 0.34 | 4.80 |
| 8 | 0.77 | 1.29 | 20.9 | 461 | 776 | 0.37 | 3.43 |

The Forge columns for all three go beside these the moment the re-downloaded export is in hand.

## Three lifts beside OVR, 2026-10-19: the input changed, not the code

Scott, handing over the export: "Calibrate, but take notes of everything ... we got 5% accuracy
one week then the next week we started at 40%, that cannot happen."

**NOTHING WAS REFITTED THIS SESSION, AND THE REASON IS THE SESSION'S OWN FINDING.** The pipeline
has not changed since `e40ea299` (2026-10-09). Fable's commit earlier the same day, `839f8756`,
touches `server/auth.ts`, `routes.ts`, `storage.ts`, `shared/schema.ts` and a gate test -- no
file that produces a number. So every difference below against the 2026-10-08 session was
produced by the SAME measurement code, and the one variable that moved is an INPUT.

| lift | OVR (set 1 / set 2) | Forge | error |
|---|---|---|---|
| Back Squat 135x5 | 74.6 / 73.7 cm | 70.6 / **72.6** | -5.3% / **-1.5%** |
| Back Squat mean velocity | 0.862 / 0.84 m/s | 0.81 / **0.84** | -6.0% / **0.0%** |
| Romanian Deadlift 135x8 | 56.0 / 57.4 cm | 65.2 / 64.3 | **+16.5% / +12.0%** |
| Box Jump (OVR "jump squat") | 71.5 / 66.7 cm | 69.1 / 58.1 | -3.3% / -12.9% |

The OVR reports ROM in INCHES; every figure above is converted. The jump squat's setup rep is
excluded from the OVR side on Scott's instruction ("rep 1 is my setup rep") -- counting it moves
that set's ROM by +4.8% and its mean velocity by -4.0%, which is the size of the error it would
introduce if Forge counts it and `outlierAgainstSet` does not flag it.

### THE BACK SQUAT IS THE BEST STANDING RESULT THIS PIPELINE HAS PRODUCED, AND THE HEIGHT IS WHY

Set 2 reads -1.5% on range of motion and **0.00 m/s on the mean** (0.84 against 0.84). Three
witnesses, and `height` is in the candidate list for the first time on this account:
`height` 0.00339639, `shoulder_width` 0.00433825, `body_3d` 0.00412932. The required scale is
within 1.5% of the height ruler's own figure, so the height ruler effectively decided the take
and was very nearly right.

It is in the list for the first time because **2026-10-19 is the first session where
`users.heightIn` was set on this account** (75 in every capture). Until that morning no route
would accept a height from an admin -- `PATCH /api/athlete/profile` was `requireRole("athlete")`,
and the menu entry that opens the dialog, and the dialog's own mount, were athlete-only (four
gates, fixed the same day; see CLAUDE.md). `calibrateFromFrames` takes `heightIn` and produced
nothing without it, so every standing lift this account filmed before today was scaled with the
height ruler absent.

### AND THE SAME INPUT IS THE RDL'S REGRESSION: -3.7% ON 10-08, +12.0% TODAY

The hinge was taken from -7.0% to 0.0% on 2026-10-05 by `postureForExercise` returning
`bent_over`, and read -3.7% on 2026-10-08. It is `bent_over` today too -- `calibration.posture`
says so -- so `postureAllowsHeightCalibration` is false and the height RULER correctly abstains.

**`body3DScaleFromFrames(rawFrames, heightIn, limbSpansUnits)` takes the height as well**, and is
documented as "corrected by the athlete's height when Vision scaled to a reference stature"
(build 564). So a height arriving on the account moves `body_3d` on EVERY lift, including the one
where the height ruler is excluded and nothing is left to contradict it.

What the blend shows on RDL set 2:

- `shoulder_width` 0.00402663, `body_3d` 0.00403251 -- **agreeing to 0.146%**
- the scale the sensor requires is 0.00359453 -- **both are 12% high**
- `plate` 0.00205555 is present and 42.8% BELOW what is required; `plateSteppedOut: false`
- `blended: false` -- one candidate won, not a blend

This is Rule #4's failure stated exactly: two body rulers built from the same landmarks agree
with each other, corroborate nothing, and are wrong together. The 2026-10-07 bench was the same
shape in the other direction (two body rulers 0.7% apart and both 27% low).

**NO CONSTANT WAS FITTED TO CLOSE IT, for three reasons.** The lever is
`BODY_3D_CORRECTED_UNCERTAINTY` or the height correction inside `body-3d-ruler.ts`, both SHARED
across all 269 records (`FITTED_OVERRIDES` is still empty), so moving either moves the back squat
that is currently at -1.5% and the box jump with it. The RDL's bias (+12%) now exceeds its
set-to-set spread (-1.4%) for the first time, which by RULE #5 makes a fit admissible in
principle -- but on ONE hinge, on the first session this input has ever existed, with the
standing lift moving the opposite way on the same change. And a constant fitted at the end of a
long session is how a bad one gets in. **What settles it is one more hinge filmed with the height
on file**, read against the sensor, beside a standing lift as the control.

### THE SCATTER IS NOW SMALLER THAN THE BIAS ON THE BARBELL LIFTS, WHICH IS NEW

RULE #5 exists because a 10-25% bias was being fitted out of a 6-24% spread. Today, same
athlete, same load, minutes apart:

| lift | Forge set1 -> set2 | the SENSOR's own |
|---|---|---|
| Romanian Deadlift | **-1.4%** | +2.5% |
| Back Squat | **+2.8%** | -1.2% |
| Box Jump | **-15.9%** | -6.7% |

Forge's barbell repeatability is now comparable to the sensor's own, against 1.26x-1.68x on the
2026-10-09 corpus. **The jump is the exception and is 2.4x the sensor's spread**, which is where
the remaining scatter work is -- not on the bar.

### THESE THREE TAKES BELONG IN THE ACCURACY LEDGER AND ARE NOT IN IT YET (2026-10-23)

`shared/accuracy-ledger.ts` is the committed record this session's own finding asked for -- "we
got 5% accuracy one week then the next week we started at 40%, that cannot happen" -- a row per
sensor-paired take carrying its INPUTS beside its error, replayed twice: at the uncertainties it
was measured with, which must reproduce the scale the phone shipped, and through the live
constants, whose answer is pinned so the next refit reds a test instead of silently rewriting
what an old comparison meant.

**It has four rows, from 2026-10-04 and 2026-10-05, and none of these three.** They were tried
and refused, which is worth recording because the refusal is the mechanism working. The candidate
scales written down above are real but the `body_3d` figure in them is the POST-COLLAPSE witness
-- the geometric mean of the raw body_3d and depth candidates, which vote once (Rule #2, build
578) -- so the raw `depth` is absent, and a row without it cannot reproduce its own shipped
scale. A row that cannot be replayed is exactly the fiction the ledger exists to refuse, so prose
is not a source for one; the faithful-record assertion would have caught it rather than a reader.

**What the next export has to yield per take, so the entry is mechanical:**
`calibration.scaleBlend.blendTrace.inputs` (the RAW candidate rows, before the collapse),
`calibration.scaleBlend.rulerUncertainties` (what each ruler stated ON THE DAY -- the half that
keeps going missing), the take's own `scaleFactor`, the reported range of motion, the sensor's
reading, `calibration.posture` and `heightIn`. Everything but the sensor's number is already in
the admin capture download, so this is transcription, not new instrumentation.

**And the ledger's first use found the drift it was built for, in the test suite rather than in a
session.** Two pinned OVR guards had been blending a frozen shoulder-ruler uncertainty with a
LIVE `HEIGHT_RULER_UNCERTAINTY`, so `e70cc096`'s refit of `BIACROMIAL_TOLERANCE_FRACTION`
(0.1 -> 0.2, 2026-10-06) moved all four sealed takes by 4.2 to 9.6 points -- the 10-05 Back Squat
changing SIGN, +5.97% to -3.58% -- with nothing going red for seventeen days. See CLAUDE.md,
"THE LEDGER, AND THE TWO GUARDS THAT CERTIFIED A BLEND NO BUILD EVER PRODUCED".

### THE JUMP SET MEASURED A BOX THAT WAS NOT THERE

Scott filmed JUMP SQUATS and logged them against Forge's `Box Jump`, which is the filmable
plyometric ("jump squats on OVR is the box jump on forge"). The row carries
`boxHeightIn: 24`, so `usesBox` is true, and two things follow from one flag:

- `detectBox: usesBox === true` -- the rectangle detector hunts a box top that is not in frame.
  `objectSystem` confirms it ran: `declared: "box"`, `boxDetector: true`.
- `jump-tracking.ts:840`, `const applied = boxSet ? false : applyGravityCorrection(...)` --
  **the gravity ruler stands down**, `standDownReason: "box_set_has_no_flat_jump"`. The export
  confirms it: `gravity: {applied: false}`.

A jump squat IS a flat jump: it lands where it took off, which is the exact movement the gravity
ruler models and the exact reason it stands down on a real box set. So the one ruler suited to
what was filmed was switched off by a flag describing a different exercise.

The box candidate is also the odd one out by a wide margin -- `box` 0.002313 against `height`
0.003082, `body_3d` 0.003590, `shoulder_width` 0.003690 on set 2 (and 0.002408 against
0.003380 / 0.003555 / 0.004254 on set 1). The ruler of known size disagrees with every body
ruler by ~35%, on a box the detector should not have been looking for.

**This is a LABEL fix, not a code fix**: clear `boxHeightIn` on the row, or film jump squats
against an exercise whose `usesBox` is false, and the gravity ruler returns. Recorded rather than
coded around, because `usesBox` is doing its job correctly for a real box jump.

### REP COUNTS MISSED ON HALF THE BARBELL SETS, WITH SAMPLING BESIDE THEM

- Romanian Deadlift set 2: **7 reps for a logged 8**. `sampling`: 565 samples, 27 dropouts,
  `cadenceHeld` 0.812, largest gap **0.834s**.
- Back Squat set 2: **4 reps for a logged 5**. `sampling`: 1 dropout, `cadenceHeld` 0.995.
- Romanian Deadlift set 1: 8 of 8, but rep 8 reads 36.4 cm against a 65 cm median and the set's
  `barPathDeviationCm` is 9.9 against set 2's 1.8. Per-rep ROM 57.8 / 69.2 / 75.6 / 58.7 / 65.1 /
  58.4 / 71.6 / 36.4 -- a poor take, where set 2's are 65.6 / 64.7 / 66.4 / 63.6 / 63.6 / 64.1 /
  61.9.

The RDL's miscount arrives with a measured cause (the 2026-10-07 press did the same at
`cadenceHeld` 0.854). **The back squat's does not** -- a near-perfect take losing a rep is the
segmenter, not the sampling, and is the one to chase.

### `measuredPosture` STILL CANNOT SEE A HINGE, AND IT IS THE DIAGNOSTIC THAT WOULD HAVE CAUGHT THIS

`calibration.measuredPosture.torsoFromVerticalDeg` reads **1.53** on RDL set 2 and **1.40** on set
1, over 523 and 602 frames. An RDL approaches 90. The 2026-10-08 note flagged **7.13** on a hinge
as open and "the next thing to read on a hinge"; it is worse now, not better.

It measures and overrides nothing by design (build 623), so it costs no number directly -- and
that is exactly why it was not noticed. It is the only independent check that the posture LABEL
matches the posture FILMED, and today a +12% regression on a hinge sat beside a reading that said
the athlete was upright. `heightToShoulderRatio` separates them correctly (3.29 / 3.35 on the
hinge against 4.15 / 3.95 on the squat), so the ratio works and the ANGLE does not.

**Open, named, not fitted:** `measurePostureFromFrames`' torso angle on a hinge.

### WHAT TO FILM NEXT, IN ORDER

1. **One hinge with the height on file, beside a standing lift as the control.** That is the
   single take that says whether the RDL's +12% is the height correction or something else, and
   it is the only thing that licenses touching a shared constant.
2. **The same jump, with `boxHeightIn` cleared**, so the gravity ruler applies to a flat jump.
3. A back squat, to confirm -1.5% was not one lucky take.

### THE RDL'S +12.0% IS THE 3D-POSE COLLAPSE, AND THE COLLAPSE IS THE WHOLE ERROR

**Exercise: Romanian Deadlift. Every number in this subsection was measured on the RDL sets 1 and
2 of 2026-10-19 and the Back Squat sets 1 and 2 of 2026-10-19, and on nothing else.** Said out
loud because the three fixes of 2026-10-09 were fitted on Pendlay Row takes, and this session has
no Pendlay in it.

Replaying `reconcileScaleEstimates` on each take's own exported candidates reproduces the shipped
`scaleFactor` to eight decimal places on all four takes, so the table below is what the phone
really did, not a model of it:

| take | required | plate | body_3d | depth | shoulder_width | collapsed pair | blend | OVR |
|---|---|---|---|---|---|---|---|---|
| **RDL set 2** | 0.003597 | 0.002056 (-42.9%) | 0.003557 (**-1.1%**) | 0.004572 (**+27.1%**) | 0.004027 (+11.9%) | 0.004033 (**+12.1%**) | 0.004030 | **+12.0%** |
| **RDL set 1** | 0.003363 | — | 0.003336 (**-0.8%**) | 0.004550 (**+35.3%**) | 0.003935 (+17.0%) | 0.003896 (**+15.8%**) | 0.003915 | **+16.4%** |
| Back Squat set 2 | 0.003637 | — | 0.003841 (+5.6%) | 0.004440 (+22.1%) | **0.003396 (-6.6%)** | 0.004129 (+13.5%) | 0.003582 | **-1.5%** |
| Back Squat set 1 | 0.003649 | — | 0.003958 (+8.5%) | 0.004158 (+13.9%) | **0.003242 (-11.2%)** | 0.004057 (+11.2%) | 0.003453 | **-5.4%** |

**On the RDL the in-plane 3D ruler is within 1.1% of the sensor on BOTH sets, and the blend throws
that away.** `body_3d` and `depth` are one sensor and vote once (Rule #2, build 578), collapsed as
their geometric mean -- and the mean of -1.1% and +27.1% is +12.1%, which is the set's entire
error to within a tenth of a percent. Set 1 says the same thing: -0.8% and +35.3% collapse to
+15.8% against a blend of +16.4%.

**The squat is the control and it is why this is not a squat problem.** A standing lift keeps its
height ruler (`postureAllowsHeightCalibration`), the hinge does not -- the 2026-10-05 fix, which
is correct and is NOT what went wrong here. On the squat the `shoulder_width` ruler reads 6.6% and
11.2% LOW and drags the blend back down off the collapsed pair's +13.5% / +11.2% to -1.5% / -5.4%.
The RDL has no third witness pulling the other way: its shoulder ruler reads +11.9% / +17.0%, the
same side as the collapse, and its plate is 42.9% low and correctly stepped out. So the hinge is
left with one bad witness and one good one averaged together, and the squat is accidentally
rescued. **Neither lift's number is evidence about the collapse; the pair's own split is.**

**`depth` reads HIGH on all four takes of the day** (+27.1%, +35.3%, +22.1%, +13.9%), worst on the
hinge, and `body_3d` reads near-truth on the hinge and +5.6%/+8.5% on the squat. Both rulers take
the SAME height correction -- `heightIn` 75 arrived on the admin account for the first time today,
giving `correction = 1.905 / 1.80 = 1.0583`, and `inPlaneSamples` multiplies the wrist depth by it
(`body-3d-ruler.ts`, `Math.abs(wrist.cz) * correction`) exactly as it multiplies a bone length. But
`DEPTH_RULER_BIAS` (0.9) was fitted on 2026-09-29 sets 5, 6 and 7, when no height was on file and
the correction was 1, so its zero absorbed the uncorrected state. **That is a hypothesis with a
mechanism and four same-day points, NOT a fit**: 1.0583 does not account for +27% on its own, the
four takes are one athlete on one day, and Rule #5 forbids fitting a bias out of a signal whose
scatter has not been measured on this configuration. Named here so the next session does not
rediscover it.

### WHAT WAS CHANGED FOR THE RDL TODAY: NOTHING. TWO VARIANTS MEASURED AND BOTH REJECTED.

Written down in full because this is exactly the "5% one week, 40% the next" problem -- without
the rejected variants on paper the next session retries them blind.

**Variant A -- the collapse carries the IN-PLANE value and states the pair's split as its own
uncertainty** (floored at the current 0.2, so it can only ever loosen). Rationale: the in-plane
bone method is a direct measurement and the wrist-depth method is an inference from one scalar, so
when they disagree the in-plane one is the better witness and the disagreement is the honest
uncertainty. Replayed over every capture:

| take | shipped | Variant A |
|---|---|---|
| RDL set 2 | +12.0% | **7.6%** |
| RDL set 1 | +16.4% | **12.9%** |
| Back Squat set 2 | -1.5% | -3.0% |
| Back Squat set 1 | -5.4% | -5.9% |

Better on the hinge, worse on both squats, and **it broke three pinned OVR guards** --
`a-lone-plate-never-takes-the-whole-scale.test.ts` (twice) and `height-ruler-uncertainty.test.ts`.
Those tests pin takes from earlier sensor pairings, so the variant does not just change today's
four numbers, it changes takes already measured against the sensor. **Rejected.** A change that
reds a pinned OVR fixture is a change whose cost has already been measured and is negative.

**Variant B -- widen the collapsed witness's uncertainty by the pair's disagreement and leave its
VALUE as the geometric mean.** The conservative half of A: the pair is one sensor, it votes once at
its average, and when it disagrees with itself it votes less confidently.

| take | shipped | Variant B |
|---|---|---|
| RDL set 2 | +12.0% | **12.0% (no change)** |
| RDL set 1 | +16.4% | **16.7% (worse)** |

**Rejected, and the reason is the lesson from 654/655:** widening an uncertainty also widens a
TOLERANCE. `MAX_SCALE_AGREEMENT_TOLERANCE` caps the agreement window at 0.4, so on a two-voter
take the loosened witness is already at the cap and loses no weight -- the RDL has exactly two
voters after the collapse (`shoulder_width` and the pair), they already agree, and nothing moves.
Set 1 gets slightly worse because the vaguer witness shifts which candidate anchors the cluster.

### THE DIAGNOSTIC THAT SHIPS INSTEAD

`calibration.scaleBlend.collapsedPose3d` now carries **`disagreement`** (high over low, so
order-independent and never negative) and **`higher`** (which of the pair read high). It
**records and gates nothing** (Rule #1): the collapse is byte-identical, still the geometric mean,
still `Math.max` of the two uncertainties, and `the-blend-shows-its-work.test.ts` asserts the RDL's
scale is unchanged with the field ignored.

Why this rather than a fix: the collapse is RIGHT that the pair is one sensor and says nothing
about whether the pair AGREES, so a near-perfect reading and a badly-wrong one average into a
confident wrong answer that leaves no trace. Every export since build 635 has carried the two
input scales and nobody divided them, for two weeks. One field is what turns "the RDL reads +12%"
into "the RDL's two 3D readings are 28.5% apart and the depth one is high" at a glance.

**What to read on the next hinge: `disagreement` and `higher`.** If `higher` is `depth` again on a
fifth and sixth take, the depth ruler's zero is the work -- and the fit is then well-posed, because
`DEPTH_RULER_BIAS` is a property of ONE ruler measured against a known correction, not a number
scraped off one lift's error.

### PROVENANCE OF EVERY NUMBER IN THIS SESSION, STATED SO IT CANNOT LEAK

Scott, 2026-10-19: *"We are only testing squat, box jumps, and rdls, you don't have data to ship
to pendlay."* Correct, and the record:

- **No constant moved today.** `FITTED_OVERRIDES` is still empty; no lift in this repo carries a
  number fitted on itself.
- **Nothing in this session touched the Pendlay Row**, its tunables record, or any constant whose
  provenance is a Pendlay take. The Pendlay strings in `pose-tracking.ts`, `bar-tracking.ts` and
  `tracker-ground-truth.ts` are dated COMMENTS explaining why a shared rule exists, plus one
  frozen fixture (`OVR_PENDLAY_ROW_2026_10_02`).
- **The leak that does exist runs the other way and is recorded, not fixed:** three constants
  fitted on Pendlay evidence on 2026-10-09 are SHARED and therefore reach the squat, the RDL and
  the box jump -- the grip floor (`d283ec85`), `MAX_SCALE_AGREEMENT_TOLERANCE` (`b88d8850`) and the
  lone-plate corroboration count (`cb67688a`). By this repo's own rule the last is a RULE and may
  be shared; the other two are numbers and are the open question.
- **Every figure in the tables above** is from the four barbell takes of 2026-10-19 plus their OVR
  readings, replayed offline on this commit.

## THE PROVENANCE AUDIT, 2026-10-20: SEVEN LEAKS, SIX OF THEM A BENCH, AND ONE TRACKER OF FIFTEEN

Scott, reading yesterday's RDL comparison: *"Why did you ship pendlay rows? We are only testing
squat, box jumps, and rdls, you don't have data to ship to pendlay."* Then, on the finding below:
*"I want everything separate, everything needs its own place."*

**He was right, and he was right about the wrong direction.** Nothing in this repo has ever shipped
a Pendlay-specific number -- `FITTED_OVERRIDES` is empty and no lift carries a value fitted on
itself. What was happening is the reverse: constants fitted on lifts he is NOT filming decide the
numbers for the three he is.

### How it was counted, and why two earlier counts were both wrong

Sixteen agents, one per file per lens: each read its file once and challenged every constant in it
twice -- once on PROVENANCE (what evidence really chose this value) and once on REACHABILITY (does
a Back Squat, an RDL, a Box Jump actually reach it at run time). 60 unique constants, 36 candidates,
105 claims checked.

- **"Two" was wrong because it searched for the wrong word.** A grep for Pendlay finds almost
  nothing; **six of the seven real leaks are a BENCH PRESS.**
- **"Thirty-six" was wrong because it counted rules and anthropometry as leaks.** A shared RULE is
  correct by design (CLAUDE.md, "judgement is allowed to be shared"), and a bench grip used as an
  arithmetic example is where a calculation was DONE, not evidence that was measured.

### The seven, with what each could move on HIS lifts

Sensitivities from replaying the real `reconcileScaleEstimates` on his own 2026-10-19 exported
candidates, which reproduce the shipped `scaleFactor` on all four barbell takes.

| constant | value | fitted on | his 3 | could move |
|---|---|---|---|---|
| `DEPTH_RULER_BIAS` | 0.9 | **4 bench takes**, 09-29 | RDL, squat | **RDL ±2.6% per 0.1.** Worst of the seven: it divides the depth value directly, and depth is half the collapsed pair that IS the RDL's whole +12% |
| `VELOCITY_SMOOTHING_MS` | 165ms | **ONE bench take**, 09-23; file says "untuned against more than one paired set" | RDL, squat | sets the reported peak, whose index anchors BOTH window trims. **No sweep exists -- unmeasured, not small** |
| `BIACROMIAL_TOLERANCE_FRACTION` | 0.2 | **9 takes**, bench + row + press, 10-06 | **all 3** | box jump **+4.3% at 0.1**, squat -1.7%; RDL inert (±0.04%) only because its two voters agree to 0.146% |
| `BODY_3D_CORRECTED_UNCERTAINTY` | 0.2 | **7 bench takes**, 09-30 | all 3 | **box jump the only live one: +3.3% at 0.1.** Squat one-sided and exactly 0.00% at or below 0.2 -- the collapse's `Math.max` lets depth's own 0.2 mask it |
| `MAX_PEAK_TO_MEAN_RATIO` | 2.0 | **60 bench reps** | RDL, squat | rewrites the reported peak to `mean x 2.0`; its own comment concedes "a squat's is higher", so it bites likelier on a squat than on the bench it came from |
| `maxPlateSizeInYardsticks` | 2.0 | a bench filmed from the foot, 09-29 | RDL, squat | decides whether a plate becomes a scale voter. Mitigated: the move was 1.25 -> 2.0, a loosening |
| `EDGE_OVERSIZED_AMPLITUDE_RATIO` | 1.6 | upper bound **one Pendlay row** (1.79x); lower bound 14 cross-movement sets | RDL, squat | deletes an edge rep, so it changes rep count and every set mean. **The one Pendlay number** |

### What looks like a leak and is not -- do not "fix" these

- **`HEIGHT_RULER_UNCERTAINTY` 0.1 was fitted jointly on HIS Back Squat and HIS RDL** (10-04). It
  is the HEAVIEST lever on two of his three lifts (66.7% of the squat's blend). His own data set it.
- **`minDetectionConfidence` 0.25** -- fitted on his own squat and RDL telemetry, 10-04.
- **`PHANTOM_OVERSHOOT_RATIO` 2.0** -- the VALUE was measured on **back squat and box jump**
  calibration sets. The bench corpus only showed the fault existed. The clearest misattribution in
  the set, and it runs the reassuring direction.
- **`RELATIVE_REP_AMPLITUDE_FRACTION` 0.4** -- predates every sensor pairing (`d152018d`, 09-04).
- **`MIN_SAMPLES_TO_PEAK`, `PLATE_TO_GRIP_RATIO_*`, `IMPLAUSIBLE_GRIP_*`, `repAmplitudeGateCm`** --
  first-principles geometry and anthropometry.
- **`MAX_COUNT_TRIM_PER_EDGE` / `MIN_COUNT_TRIM_ODDNESS` as module constants DO NOT EXIST** --
  function-local aliases of registry fields. The readers double-counted them.
- **`travelOnsetMarginM` is already genuinely separated**: squat/RDL/box jump 0.01, bench/row
  0.0075. It is the ONE field of the twelve that is not identical everywhere.
- **`driveOnsetFraction` 0.04** -- thirteen sets across FIVE movements including two back squats.
  Cross-movement, declared shared in the file itself, and that is the right call.
- **`MAX_SCALE_AGREEMENT_TOLERANCE` 0.4** -- true but harmless. Its value is the width every take
  used before any floor existed, restored as a CEILING that can only tighten; the 10-09 Pendlay row
  diagnosed the pathology, it did not choose the number. **Verified inert on all four 10-19 takes.**
  An earlier reply to Scott called this a Pendlay-fitted number and that was wrong.
- **`BODY_3D_UNCORRECTED_UNCERTAINTY` 0.3** -- not read on any of his three any more: with
  `heightIn` 75 on file every take goes down the `reference_corrected` branch. **It was live on all
  three until 2026-10-19.**

### AND THE STRUCTURAL FINDING: ONE TRACKER OF FIFTEEN READS THE REGISTRY

`cameraTunablesFor` appears in **`av-bar-tracker-dialog.tsx` and nowhere else.** Fourteen dialogs
never resolve a record, and `jump-tracking.ts` contains no reference to `tune` at all. So the
separation ratified 2026-10-06 was built as a data structure -- 270 records, 23 fields, tests
proving no two share -- and wired to ONE tracker. **The Box Jump under test, and all 216 skill
drills, run entirely off shared module constants.**

That is why `MAX_SHOULDER_SPAN_SPREAD` reaches his lifts by two routes: the squat and RDL read
their own record, the box jump reads the raw constant. Same 0.4 today, and nothing in any export
says which route a take took. CLAUDE.md's 2026-10-16 check verified the records were real and
`FITTED_OVERRIDES` empty -- both true -- and never asked how many trackers READ them.

### WHAT SHIPPED: FIVE FIELDS INTO THE REGISTRY, NO NUMBER MOVED

Of the seven, three already had their own place (`depthRulerBias`, `maxPeakToMeanRatio`,
`maxPlateSizeInYardsticks`). The four that did not are now fields, plus the one derived from them:

`biacromialToleranceFraction` 0.2, `maxScaleAgreementTolerance` 0.4, `body3DCorrectedUncertainty`
0.2, `velocitySmoothingMs` 165, `edgeOversizedAmplitudeRatio` 1.6.

- **Every one is a DEFAULTED PARAMETER**, the pattern `robustPeakSpeed` and `plausibleMean` already
  use, so every un-plumbed caller -- the replay harness, the fixtures, the fourteen dialogs -- keeps
  exactly today's value. `EDGE_OVERSIZED_AMPLITUDE_RATIO` was lifted from a function-local to a
  module export to make that possible.
- **`maxScaleAgreementTolerance` HAD to move with `biacromialToleranceFraction`**, because it is
  derived from it -- written `0.2 * SCALE_AGREEMENT_MULTIPLE`, a hardcoded literal whose comment
  claims it tracks the floor. A sentence is not a link, so the copy test now asserts
  `maxScaleAgreementTolerance === biacromialToleranceFraction * 2`: the day somebody fits the floor
  on one lift, that fails rather than silently drifting.
- **NOTHING MOVED, proved not asserted**: 401 files / 4717 tests, identical to the baseline before
  the change, OVR fixtures and the 20-capture replay corpus included. `FITTED_OVERRIDES` is still
  empty. The registry makes a per-lift fit SAFE TO DO; it is not evidence one happened.
- **Two source scans went red and neither was behaviour** (`velocity-comes-from-displacement`,
  `set-two-beside-ovr-2026-10-02`): both matched EXACT call text that an added argument broke. Both
  now match the shape, because an assertion that fails for an added argument also passes for the
  wrong line -- the same lesson `stripe-checkout.test.ts` learned from a 220-character window.

### CORRECTION TO THE 2026-10-19 NOTE ABOVE: THE HEIGHT MOVED THE REP GATES TOO

That section attributes the day's movement entirely to the scale rulers. The audit found the rest
of it. `heightIn` 75 arriving also moved every rep gate, because they are fractions of stature:

| gate | before | after |
|---|---|---|
| Back Squat `repAmplitudeGateCm` | 20.00 | **19.05** (looser) |
| RDL `repAmplitudeGateCm` | 20.00 | **22.86** (14.3% tighter) |
| Box jump flight floor | 15.00 | **16.30** |

Nothing on those takes was near a gate (the RDL's reps ran 61.9-66.4 cm), so no rep count changed
-- but the note implied the gates were untouched and they were not. **This is exactly the
5%-then-40% mechanism**: one input arrived and moved eight things at once, and the session note
caught five of them.

### STILL OPEN, AND NOT GUESSED AT

- **The box jump's scale cannot be reproduced offline.** The box enters the vote in the **`plate`
  slot at uncertainty 0.05** (`av-jump-tracker-dialog.tsx:346`) and is renamed "box" only in the
  diagnostics. With it voting it takes 72.7% and the set reads ~-29%, not the -12.9% recorded -- so
  something dropped it (`rejectImplausibleScales`) and **the export does not say which**. Every box
  jump figure in this section is from the no-box reconstruction. Rule #4: the box IS that take's
  object witness, and its rejection is unrecorded.
- `VELOCITY_SMOOTHING_MS` has never been swept on a squat or a hinge.
- `MAX_PEAK_TO_MEAN_RATIO`'s cap has never been scored against the sensor on either.
- `measuredPosture.torsoFromVerticalDeg` still reads **1.53** on the hinge. Open since 10-08.

### THE ONE NEXT STEP

**Film one more RDL with the height on file and read `collapsedPose3d.higher` and `.disagreement`.**
`depth` read high on all four takes of 10-19; a fifth and sixth make `DEPTH_RULER_BIAS` -- the worst
of the seven, and now separable per lift -- fittable on evidence instead of inherited from four
benches.

## Fourteen trackers were handed their own numbers and never asked for them, 2026-10-20

Scott, after the provenance audit: **"I want everything separate, everything needs its own
place."** The audit's structural finding was that `cameraTunablesFor` is called by ONE tracker of
fifteen. This is the pass that fixes the half of it that can be tested on an iPhone, and it found
one real defect doing it.

### What was actually wrong, stated plainly

The per-lift registry has existed since 2026-10-06 and is real: 270 identities, a fresh record per
call, every value copied from the constant it came from, three tests proving the copy. The
2026-10-16 verification confirmed all of that and **never asked who READS it**. The answer was
`av-bar-tracker-dialog.tsx` and nothing else.

So on 2026-10-19, when the Back Squat, the Romanian Deadlift and the Box Jump were filmed beside
the OVR:

- the **squat and the RDL** resolved their own records (the bar dialog), and
- the **Box Jump** read `MAX_SHOULDER_SPAN_SPREAD`, `BIACROMIAL_TOLERANCE_FRACTION`,
  `BODY_3D_CORRECTED_UNCERTAINTY` and `HEIGHT_RULER_UNCERTAINTY` **straight off the shared module
  constants** -- three of the four fitted on a bench press -- and no field in any export said
  which route a number arrived by.

`MAX_SHOULDER_SPAN_SPREAD` is the clearest instance: it reaches his three lifts by TWO different
routes, the squat and RDL from their own record and the box jump from the raw constant, same 0.4,
indistinguishable in the diagnostics.

### THE DEFECT: THE HEIGHT RULER'S REFIT NEVER REACHED TWO TRACKERS

Found while wiring, not predicted. `av-medball-tracker-dialog.tsx` and
`av-kb-swing-tracker-dialog.tsx` state their height ruler's uncertainty as a **bare literal
`0.05`**, written in `2436110b` (2026-09-29) -- when `HEIGHT_RULER_UNCERTAINTY` was also 0.05.

`812becb7` (2026-10-05) refit that constant to **0.1**, as the stopgap over the failing object
system. **A refit cannot reach a literal.** So for six weeks the med ball and kettlebell trackers
have stated the height ruler as **twice as confident as the pipeline believes**, which in an
inverse-variance blend is **four times the weight**. The height ruler is the heaviest voter on
most takes it is present on.

**Sixth instance of the class CLAUDE.md keeps naming**, after the Coaches Corner lesson re-sync,
the Barbell Shoulder Press instructions, `videoEligible: false` surviving the canonical-list swap,
the terms-change guardian notice, and the Stripe `updateSubscriptionByUserId` upsert: a correction
wired to one path, invisible because the path that IS taken looks like it worked.

**IT IS NOT CORRECTED HERE, and the reason is the registry's own rule.** Setting it to 0.1 moves a
number on two trackers inside a commit whose whole claim is that it moves none -- and 0.1 was
fitted on a bench and a squat, so applying it to a thrown ball is the same leak pointing the other
way. Nobody has filmed a med ball throw or a kettlebell swing beside the sensor with the height
ruler's own error written down, so neither value has evidence behind it on those two movements.
It is copied into `GATES_BY_TRACKER` at **today's value** (0.05 for those two, 0.1 everywhere
else), where the divergence is visible and a grep finds it, and
`camera-tunables-are-a-copy.test.ts` pins it **as it is, not as it should be** -- the assertion
somebody comes and changes the day a paired throw exists.

### What shipped

| | before | after |
|---|---|---|
| Registry fields | 28 | **29** (`boxRulerUncertainty`) |
| Dialogs resolving a record | 1 of 15 | **5 of 15** |
| Scale-blending dialogs wired | 1 of 5 | **5 of 5** |
| `FITTED_OVERRIDES` | empty | **empty** |

**The five scale-blending trackers are all wired** -- av-bar, av-jump, av-kb-swing, av-medball,
av-swing -- and those are the ones where an unplumbed record is not a tidiness problem, because
every one of them decides a take's SCALE, which is the error every sensor pairing since 2026-10-04
has been chasing. Golf and baseball resolve as **separate identities** off the `sport` prop, which
they always were in `FilmingTracker` and never were at the call site.

**`boxRulerUncertainty` is the new field and it was a bare `0.05`** in the jump dialog's box-scale
candidate -- no name, no comment, nothing recorded about where it came from. It is the tightest
uncertainty any ruler in this pipeline states, **tighter than the CoreML detector's own measured
0.056**, so it decides a box jump's scale almost by itself whenever the box is found at all. It is
NOT `COREML_BOX_LONG_EDGE_UNCERTAINTY`, which is a property of the detector and correctly shared:
this ruler's denominator is a Vision box-top read divided against a tenth-percentile ankle floor,
two different measurements with their own error. Unmeasured either way, and now findable.

### How it moves no number

Every separation is a **defaulted parameter** -- the `robustPeakSpeed` pattern this repo already
uses -- so every caller not yet plumbed keeps the value it read before, bit for bit.
`bodyScaleFallbacks` gained an optional `tunables` argument carrying the three ruler numbers and
is where they reach the four trackers that could not name a lift until today. `FITTED_OVERRIDES`
is empty, the jump tracker overrides no gate, and the two per-tracker height uncertainties are
copies. Whole unit suite identical to the baseline, OVR fixtures and the 20-capture replay corpus
included.

### The ratchet, and the flaw in its first draft

`shared/every-tracker-reads-its-own-numbers.test.ts` reads the dialog DIRECTORY and requires every
file to resolve a record or appear in `NOT_PLUMBED_YET` with a reason over eighty characters that
names a file, field, gate, module or blocker. Ten entries today, each one a sentence that shows up
in a grep -- the `FITTED_OVERRIDES` / `NOT_PUBLIC_ON_PURPOSE` / `PRICED_WITHOUT_A_CHECKOUT` shape.
It also **refuses a stale exemption**: a dialog that got wired must leave the list, which is the
direction that makes it a ratchet rather than a record, and the absence of which is how the
registry came to look finished on 2026-10-16.

`TRACKER_FOR_TRACKING_LEVEL` is an exhaustive `Record` over every `trackingLevel` the database can
store, and it exists because **`cameraTunablesFor`'s tracker parameter DEFAULTS to `"bar"`** -- a
dialog that resolves a record without naming its tracker silently gets a 3 m/s frame ceiling on a
thrown med ball, which is Scott's own example of what must never happen. The union is hand-written
(that module is in the client bundle and the schema is deliberately kept out of it) and the test
holds it **equal** to the real pgEnum, so a level added to the database fails there instead of
resolving to `undefined` and reading every gate as NaN.

**AND THE FIRST VERSION OF THE DEFAULT CASE WAS WORTHLESS, which is worth knowing by heart.** It
asserted the FILE contained `TRACKER_FOR_TRACKING_LEVEL`. The comment above the call contains
those words, so replacing the call's mapping with a bare `"jump"` literal left the test **green**.
That is CLAUDE.md's `stripe-checkout.test.ts` lesson inverted -- there a paragraph pushed a guard
out of a character window and turned a test red; here a paragraph turned one green, which is the
worse direction because nothing announces it. It paren-matches the call's own arguments now and
asserts against those. Five mutations, each caught by the right case: unwiring the jump dialog
reds two, listing a wired dialog reds the stale-exemption case, the bare literal reds the default
case, and restoring medball's stale `0.05` reds the copy test.

### What is NOT done, named so it is not mistaken for finished

Ten dialogs remain unwired and the list says why for each. They fall in three groups:

- **Four web/Android halves** (bar, kb-swing, medball, swing) are the same shape as their wired
  iOS twins and should be wired identically. They wait because the launch is iPhone only and there
  is no Android device to film a set on -- an untested change to a capture path is worth less than
  the separation it buys. `medball-tracker-dialog.tsx` carries the **same stale 0.05** and the
  same fix.
- **Mechanics (both halves)** are blocked on one thing: `MAX_PLAUSIBLE_WRIST_SPEED_MPS` IS in the
  registry as the mechanics tracker's `maxPlausibleSpeedMps` (20), but the gate is applied inside
  `mechanics-tracking.ts` rather than at the dialog, so that module needs the defaulted parameter
  first.
- **Sprint and horizontal load (both halves each)** have nothing in the record to read yet. A
  timed sprint runs no scale blend and its gate is in yards per second;  a sled push takes its
  scale from a known distance. Wiring either means putting that mode's own number in the registry
  first, in its own units -- and for horizontal load it is the same one job as the open half of
  Rule #4 for that mode, which names no object system either.

**And `FITTED_OVERRIDES` is still empty**, so all 270 records still hold identical values. Five of
fifteen trackers CAN now be calibrated apart. None has been. Those are two different claims and
this pass only advances the first.

### AND THE JUMP NOW SAYS WHOSE NUMBERS IT READ, which is what made 10-19 unattributable

`calibration.scaleBlend` has been on the bar tracker since build 635 and the jump has never had
it. That is why the 2026-10-19 Box Jump could not be attributed after the fact: every field in
that export was equally consistent with the box jump's own record and with the shared constants it
was actually reading, because **nothing wrote the identity down**. Scott, 2026-10-07: "if you can't
see, and can't guess, then put it in the export file I download."

The jump emits it now -- the blend's inputs, the collapsed 3D witness, the voters, the winning
cluster and its anchor, every pair in both directions, plus `identity` and the seven ruler
uncertainties THIS take was handed. `boxRuler` is on the jump's row and not the bar's, because the
box is the jump's only object of known size and is the field to read first on a box jump whose
scale is wrong. **No schema change was needed**: `rulerUncertainties` is `z.record(z.string(),
z.number())` on both sides of the wire, so a ruler only one tracker has is reportable without
touching `trackingDiagnosticsSchema` -- which matters, because zod strips what it does not declare,
silently, and that has cost two diagnostics already. Records and gates nothing (Rule #1): the scale
returned is identical with the block deleted.

### TWO EXISTING TESTS WENT RED ON THE IMPROVEMENT, AND BOTH WERE RIGHT TO

Worth recording because they are the same defect in two forms, and one of them had already been
patched once the wrong way.

**`the-blend-reads-this-lifts-uncertainties.test.ts` had a case called "RECORDED, NOT FIXED: three
rulers still cannot be handed their lift's number"**, and its own comment said what to do: "When
one of these is wired, its line here fails and gets deleted -- the list is meant to shrink." Two of
the three were wired, so the assertions **invert** rather than vanish: the height ruler must now
come from the record on av-jump and av-swing, and `HEIGHT_RULER_UNCERTAINTY` must be GONE from
both, which is what stops a later edit quietly putting the shared value back. The third is still
open for a reason that is not "nobody got to it": `ankle3DRulerUncertainty` is baked into
`ankle-3d-ruler.ts`'s returned reading and the ankle ruler is computed AFTER the scale vote has
closed, so its uncertainty is inert whichever number it carries. **The gap to close first is the
order, not the constant.**

**`height-ruler-uncertainty.test.ts` went red for the SECOND time on a change that satisfied its
own stated rule.** It asserted the height row read one of two accepted SPELLINGS; mine was a third.
Its comment already records the first instance -- on 2026-10-08 the bar dialog moved to the
registry and "the old assertion went red for that, which is a ratchet failing on an improvement to
the thing it guards" -- and the fix then was to **add a second spelling**, which is the patch that
guarantees a third failure. Twice is the pattern.

It asserts the RULE now and nothing else: on every height row in every tracker dialog the
uncertainty must be a NAME -- an identifier or a member expression -- and never a number typed on
the row. Any spelling passes; `0.05` and `0.1` alike do not, which is the regression that was
always the point. And it reads the DIRECTORY rather than two named files, so a tracker added later
cannot hardcode one unnoticed. Five rows today and it catches nothing retroactively -- the web
halves build no height uncertainty row at all -- so it is purely forward-looking. Two mutations,
both caught: the stale `0.05` back on kb-swing, and a plausible-looking `0.1` in its place.

**The general lesson, which this repo has now paid for three times in one file:** a scan that
enumerates accepted FORMS fails on every correct change that uses a new one, and each failure gets
"fixed" by lengthening the list. A scan that states the rule as what it FORBIDS accepts every
correct change and refuses every wrong one. The same sentence applies to the ratchet written today,
whose first draft asserted a file CONTAINED `TRACKER_FOR_TRACKING_LEVEL` and was satisfied by the
comment above the call.


## Three lifts beside OVR, 2026-10-29: the squat holds, the RDL is two faults, the jump measures the ankle

Build 695 (`039ae04`; camera code identical to 693 and to `e40ea299`), the admin account,
`heightIn` 75 on every row, every capture with its video (`hasVideo: true` x3). Scott: "Going to
calibrate numbers, for the 'squat jump' which is box jump, ignore rep one the 1.20 is a set up
rep, not an actual jump." The OVR named the hinge "Deadlift"; Forge logged it as Romanian
Deadlift, and that label is what decides the posture and so the height ruler.

**NOTHING WAS FITTED.** Six ledger rows were added instead (`shared/accuracy-ledger.ts`: both 10-19
sets of the squat and the RDL, and today's two), each reproducing its shipped scale to four
decimals, which is the first time the 10-19 session is a record rather than prose.

### The sensor, transcribed (OVR, inches converted)

| lift | reps | mean m/s | peak m/s | ROM | TPV s |
|---|---|---|---|---|---|
| Back Squat 135x5 | 0.87 0.83 0.82 0.77 0.74 (set 0.80) | 1.38 1.21 1.27 1.09 1.07 (1.20) | 28.2 29.3 28.7 29.4 28.6 in (28.8 = **73.2cm**) | 0.58 0.64 0.63 0.67 0.75 (0.65) |
| "Deadlift" 135x8 | 0.91 0.89 0.89 0.91 0.98 0.94 0.91 0.84 (0.90) | 1.57 1.50 1.57 1.58 1.61 1.64 1.57 1.32 (1.54) | 23.8 24.9 23.1 24.6 24.8 24.9 25.1 24.8 (24.5 = **62.2cm**) | 0.36 0.39 0.36 0.34 0.37 0.32 0.32 0.34 (0.35) |
| Jump squat x6, rep 1 = setup | 1.20* 1.40 1.42 1.43 1.37 1.44 | 1.83* 2.62 2.75 2.60 2.68 2.64 | 31.9* 26.1 27.1 26.8 26.7 26.3 in | 0.20* 0.19 0.20 0.18 0.18 0.19 |

Reps 2-6 of the jump: mean 1.41 m/s, peak 2.66 m/s, ROM 26.6in = 67.6cm (hip, dip bottom to apex).

### Back Squat: -1.9% on ROM, and the third take with the same signature

Forge 71.8cm / mean 0.72 / peak 1.15 against 73.2 / 0.80 / 1.20; 5 of 5 reps, `cadenceHeld` 1,
0 dropouts, `subjectFacing` facing_camera, `barWitness` shoulders. Shipped scale 0.003453.
Against the scale the sensor requires (0.003520):

| ruler | scale | error | weight |
|---|---|---|---|
| height | 0.003164 | **-10.1%** | 74.8% |
| body_3d (upperArm) | 0.003992 | +13.4% | 18.7% |
| shoulder_width | 0.004038 | +14.7% (grip/shoulder 2.475 -> uncertainty 0.339) | 6.5% |
| depth | 0.004862 | +38.1% | 0 (collapsed with body_3d at 0.004406, +25.2%) |

The 10-19 squats read height -7.5%/-3.5%, body_3d +12.9%/+9.7%, shoulder +19.6%/+23.9%. **Three
takes, one shape: the height ruler is low, the two body rulers are high, and the blend lands
because they cancel.** That is not two correct rulers. Refitting the height ruler alone (which the
10-20 audit calls the heaviest lever on this lift) unmasks the +13%; refitting
`BIACROMIAL_HEIGHT_FRACTION` toward the 3D skeleton's 0.1934 (the 10-05 proposal) would push the
shoulder ruler further from a sensor it already overshoots. Three takes is not a fit (Rule #5), and
the pattern is written on the board so the fourth and fifth squat are read against it.

The mean reads -10% with ROM -1.9%, so the concentric window is ~9% long on this take
(`concentricSeconds` 1.02 against ROM/mean = 0.92s from the sensor). The 10-19 squats had the mean
within 0-6%. Not pooled; noted.

### Romanian Deadlift: +30.5%, and it is a scale fault AND a trace fault on one take

Forge 81.2cm / mean 0.97 / peak 1.07 against 62.2 / 0.90 / 1.54; **7 reps found of 8**; shipped
scale 0.003450 -- the squat's 0.003453 to three decimals, filmed minutes apart from the same
spot, which is itself a finding (below). The sensor requires 0.002643. Every ruler is high and
there is no height ruler to oppose them (`bent_over`, correctly):

| ruler | scale | error vs sensor |
|---|---|---|
| body_3d (torso) | 0.003057 | +15.7% |
| shoulder_width | 0.003490 | **+32.0%** (grip/shoulder 1.767 under the 1.85 ceiling, so no floor; `spanSpreadFraction` 0.12) |
| depth | 0.003802 | +43.9% |
| collapsed body_3d+depth | 0.003409 | +29.0% |

The 10-19 RDLs read body_3d -0.8%/-1.1%, depth +35.3%/+27.1%, shoulder +17.0%/+12.0%. So `body_3d`
moved from -1% to +16% between sessions with no code change, and the shoulder from +12-17% to
+32%. **The shoulder's jump has a visible cause**: `gripAxisFromVerticalDeg` 32.6 and
`subjectFacing` oblique -- the hinge was filmed from an angle this time, and a shoulder span read
across a rotated, folded athlete reads short. `measuredPosture` finally SEES the hinge, which it
did not on 10-08 (7.13) or 10-19 (1.53): the median torso angle is 7.28 but **`torsoFromVerticalP90Deg`
is 43.7** -- the P90 is the number that says "this was a hinge", and the median never will,
because most frames of an RDL are near standing.

**And the trace is not clean either, which is why the scale cannot be read off this take alone:**
`wristsBelowVisibilityFloor` 168 of 611 frames (27%; 24-27 on 10-19), `barPointFromLoneHandCarried`
108 (43-44 on 10-19), 20 dropouts totalling 1.5s, `repPeaksFlooredToMean` **5 of 7** (0 on 10-19),
`framesVelocityRejected` 3 with 15 rejections. Per-rep ROM 84, 62, 82, 93, 79, 85, 82cm against the
sensor's 58.7-63.8 -- at the sensor's scale those would be 64, 48, 63, 72, 61, 65, 63, so the
median lands but the spread (48-72) is the trace, not the scale. Rep 2 alone reads 62.4cm, the
sensor's own number, which says the scale-corrected answer exists in the data on a clean rep.

**The peak is unusable on every RDL filmed** (1.07 vs 1.54 today; 10-08: floored on 4 of 4; 10-19:
1.28/1.40 vs ~1.7). The 10-08 diagnosis stands -- the drive window on a lift that starts by going
DOWN -- and today adds the floor count. Not fitted; the segmenter's phase choice on a hinge is the
open item, and it is a rule, not a number.

**THE SAME-SCALE COINCIDENCE IS THE MOST USEFUL THING ON THIS TAKE.** The squat and the RDL shipped
0.003453 and 0.003450, and the squat's is within 2% of right while the RDL's is 30% high. The depth
ruler says why: `medianWristDepthM` 3.676 on the squat and **2.875** on the RDL. The phone was 22%
closer for the RDL (or the athlete 22% closer to it), so the true scale had to be ~22% SMALLER
(0.00352 x 2.875/3.676 = 0.00275, 4% off the sensor's 0.00264) -- and the body rulers did not
shrink with it. `body_3d` 0.00399 -> 0.00306 is -23%, which IS the right ratio, so the 3D ruler
tracked the distance change and started from +13% high; the shoulder 0.00404 -> 0.00349 is -14%,
which did not. **So the depth ruler is right about RELATIVE distance between two takes minutes
apart while being 38-44% high in absolute terms on both.** That is a mechanism worth a diagnostic
(the ratio of a session's depth reads against the ratio of its shipped scales), not a constant.

### Box Jump: the box is right, and neither velocity is the sensor's

7 "reps" found: two flagged `likelyTrackingGlitch` (9.5cm, the setup rep Scott named; -0.5cm,
a dismount), five real -- which is the sensor's count once its setup rep is dropped.
`boxRise`: raw net rises 69.6-75.1cm onto a 61cm box, `scaleErrorRatio` 1.222 applied, corrected
rises 61.5 / 66.5 / 65.2 / 69.2 / 66.5cm. The box ruler is doing its job (it voted at 0.00142
against body rulers at 0.0031-0.0040, i.e. the body rulers were 2.2-2.8x too big on a jump filmed
closer than the lifts; `boxRise.applied` is what rescued the take). `gravity` null: it stands down
on a box set by design (build 619).

**Two velocities, both wrong, in opposite directions, and neither measures what the OVR measures:**

| quantity | Forge, reps 2-7 less glitches | OVR reps 2-6 | error |
|---|---|---|---|
| `takeoffVelocityMps` (ankle-ballistic: `(netRise + g t^2/2) / t`) | 3.34 3.46 3.49 3.50 3.46 | 2.62 2.75 2.60 2.68 2.64 | **+30%** |
| `countermovement.concentricPeakVelocityMps` (Kalman-smoothed hip) | 2.28 1.86 1.93 1.60 1.82 | same | **-30%** |

The first is a mislabelled quantity on a BOX set rather than a measurement error: the formula
treats the ankle as a projectile that lands 61cm higher, but the ankle lands on the box because
the knees tuck -- the centre of mass rises ~36cm (2.66^2 / 2g), not 61. On a flat jump the ankle
lands where it left and the formula is sound; on a box the "jump height" it produces (57-62cm) is
the box height wearing a velocity's clothes. **Recorded, not changed**: the number is shown to the
athlete, and whether a box set should report the rise (true) or a takeoff velocity (not measurable
from the ankle on a box) is a product sentence to decide, not a constant. The second is the hip,
the right body point, read 30% low off a smoothed trace at `effectiveHz` 40 with 21 dropouts
(`cadenceHeld` 0.914) over a 0.18-0.22s drive -- a window of 7-9 samples. A smoother that lags a
0.2s drive can only read low; a mechanism, stated, unfitted.

### What this session adds to the repo

- Six replayable rows in `shared/accuracy-ledger.ts` (10-19 x4, 10-29 x2), each reproducing its
  shipped scale; `liveErrorPct` -3.09 / +1.07 / +16.43 / +12.02 / -0.11 / +30.55. The live replay
  reads the two 10-19 squats at 0.2 for the shoulder where the frames loosened it to 0.35-0.39,
  which is the stated limit of a sealed row and why those two differ from "as filmed".
- The replay test states the PLATE's live uncertainty from the live constants (the casting
  tolerance over the nominal diameter, in quadrature with `COREML_BOX_LONG_EDGE_UNCERTAINTY`),
  because the 10-19 RDL set 2 is the first row with a plate in the vote; before this an unknown
  source silently took the body ruler's 0.2.
- The status board at the top of this file.

### Next, in the order the evidence ranks them

1. **The RDL's trace before its scale.** Film the next RDL square-on (`subjectFacing` side_on),
   so the shoulder span and the wrists are read as they were on 10-19; if the scale error falls
   back to +12-16% the extra +15% today was the angle, and the collapse is what is left.
2. **A diagnostic, not a constant, for the depth ruler's relative read**: on a day with two or
   more takes, the ratio of `medianWristDepthM` between takes against the ratio of their shipped
   scales. Two takes today say the depth ruler knows the distance CHANGE and not the distance.
3. **A box set's takeoff velocity is a product sentence** (what does the athlete see on a box
   jump: the rise, which is right, or a velocity, which cannot be read off the ankle). Scott's.
4. The squat's fourth and fifth paired take, read against the board's signature before any
   refit of the height or shoulder ruler.


## Round three, 2026-10-30: the box ruler measures the landing, the drive happened at the floor

Scott, reading round two's "the next two box sets decide which the sensor tracks": **"Can we make
the sensor track what we want it to track? Why are we leaving it up to the sensor?"** He is right
that the sensor decides nothing. The OVR on the hip measures the hip's velocity; that is the
ground truth and the only thing it can be. What was undecided was on Forge's side -- one hip
trace, two scales to multiply it by -- and round two handed the choice to the next filming day
instead of making it. The 697 export already held the answer.

**The height ruler read the same scale on all four takes filmed from one spot.** Nose-to-ankle on
the standing frames, metres per trace unit:

| take | height ruler | what the take's truth requires |
|---|---|---|
| Back Squat set 1 | 0.003164 | 0.003520 (the OVR's ROM), ruler **-10%** |
| Back Squat set 2 | 0.003437 | 0.003674, ruler **-6.5%** |
| Box Jump set 1 | 0.003092 | 0.002687 if the box-rise ratio (1.222) were a floor scale error |
| Box Jump set 2 | 0.003268 | 0.002890 if the box-rise ratio (1.201) were |

Same athlete, same camera distance (the ruler says so: a 20% closer camera reads a 20% bigger
span), same hour. On the squats the ruler sits 6-10% UNDER the truth; the box-rise ratio asked it
to sit 13-15% OVER the truth on the jumps. One ruler cannot be biased 20 points apart on four
takes from one spot, so the 1.20-1.22 is not a scale error of the floor. It is the LANDING: the
ankle's rise is measured onto a box that is nearer the lens than the takeoff (the squats from the
same spot read `facing_camera` / `oblique`, and a box jump travels toward a camera that is in
front), so the box top reads 20% further up the frame than 61cm of floor-scale would. The
detector's own box top says the same thing in a cruder way (`boxTopFromDetectorM` 1.29 / 1.41
against 0.61 typed).

**So the correction belongs to the numbers measured at the landing** -- net rise, peak height, box
clearance and the flight-rebuilt height -- **and not to the hip's drive**, which was measured on
the standing frames before the feet left the floor, at the scale the body rulers read there.
`applyBoxRiseCorrection` no longer divides the countermovement. `applyGravityCorrection` still
does, because the gravity ruler compares flight time with displacement at ONE spot, so its ratio
is a floor scale error and the drive is at that scale.

What that does to the 697 takes, hip against the OVR on the hip, reps 2-6:

| | divided by the landing ratio (697 shipped) | at the floor scale (round three) | sensor |
|---|---|---|---|
| set 2 peak | 2.23 (-15%) | **2.68 (+2%)** | 2.62 |
| set 1 peak | 1.90 (-29%) | **2.32 (-13%)** | 2.66 |
| set 2 mean | 1.32 (-4%) | 1.58 (+15%) | 1.37 |
| set 1 mean | 1.23 (-13%) | 1.50 (+7%) | 1.41 |

The peak is the sensor's headline and it lands on set 2. Set 1's -13% is a trace question (reps
at 1.96-2.36 with rises of 21.8-35.1cm that vary twice as much as set 2's), not a scale one. The
MEAN goes the other way, +7% / +15%, and that is the window: Forge's concentric runs 0.18-0.28s
where the sensor's time-to-peak is 0.18-0.20s, and a mean over a window that starts early on a
rise it reads correctly can only come out high. That is the next jump lever, in the jump's own
record, once a third box set confirms the peak holds at the floor scale.

**A RULE, not a number** -- which spot a ruler measured -- so `FITTED_OVERRIDES` is untouched and
nothing on the squat or the RDL can move: the change is inside `jump-tracking.ts`, which no bar
lift reads, and the fixture replay and the ledger replay are bit-identical.
`jump-countermovement.test.ts` drives both rulers on the same reps (the box ruler scales the net
rise and leaves the drive; the gravity ruler scales both) and then reads the source with comments
stripped, because the docblock on the function now quotes the very line the scan forbids. Putting
the division back reds both cases.

`uncorrectedConcentricMeanVelocityMps` / `...PeakVelocityMps` stay in the schema and are written
by the gravity branch only; on a box set they are absent now and the countermovement's own
numbers ARE the floor-scale read.

## Round two, 2026-10-29: build 697 beside the OVR, one small step per lift

Scott filmed all three lifts on 697 an hour after the morning's takes, with the standing order
"small adjustments on everything ... until we get to 0% ... steady and confident". Set 1 on the
OVR is the morning's take; set 2 is 697's.

**BACK SQUAT 135x5, set 2: ROM 74.7 against 75.7 (-1.3%), mean 0.89 against 0.84 (+6.0%), peak
1.29 against 1.27 (+1.6%).** The best squat on record, and the fourth take running with one
signature against the scale the sensor requires: height ruler -6.5% at 76.1% of the weight,
body_3d +9.6%, shoulder_width +14.7% (grip floor 0.398), depth +21.1% (10-29 set 1: -10.1 /
+13.4 / +14.7 / +38.1; 10-19 x2 the same shape). The mean's +6% is a window, not a scale: rep 1's
drive opened at the walk-out again (phase 3.40s, drive 1.07s, 0.66 against the sensor's 0.86)
and reps 2-5 ran 0.80s at 0.91-0.95 against a sensor that slows from 0.88 to 0.78. Recorded;
the first-rep rule waits for a third take showing it.
The small step: `FITTED_OVERRIDES["Back Squat"].heightRulerUncertainty` 0.1 -> 0.11. On the
ledger's six squat rows the live replay moves +1.0 to +1.8 points each (10-04 -5.97 -> -4.81,
10-05 -3.58 -> -1.74, 10-19 s1 -3.09 -> -2.04, 10-19 s2 1.07 -> 2.07, 10-29 s1 -0.11 -> 1.20,
10-29 s2 pinned at 1.60) and no other lift's row moves. As filmed with the step, today's two
squats would read about -0.9% and -0.3%.

**ROMANIAN DEADLIFT 135x8, set 2, square-on as asked: ROM 41.1 against 62.5 (-34.2%), mean 0.45
against 0.85, peak 0.81 against 1.43.** One cause, read off `calibration.scaleBlend`: the barbell
plate was boxed at 175.8px where the body consensus expects 108 (`plateBoxToExpectedRatio`
1.627), no gate fired (`rejectedReasons: []`, grip/shoulder 1.706 inside the plausibility
window), it stated 0.058, and it carried **85.8%** of the blend at 0.00256 against body_3d
0.00392 (the collapsed pair, with depth at its new 0.6) and shoulder_width 0.00441. This is
exactly the tail the 10-09 note left open ("at 1.2-1.5 the next work is a corroboration rule
that can tell a 25% disagreement from agreement -- written against a measured take"); the
measured take arrived at 1.63x.
Why the lone-plate rule slept: the agreement test is asked from the anchor's end. Anchored on
body_3d the plate is 0.653 of it, |0.653 - 1| = 0.347 <= 0.4, admitted; anchored on the plate the
body rulers are 1.53-1.72x away, refused. The cluster anchored on body_3d held all three, so the
plate was never alone. `scalesAgree` now asks a PLATE from both ends: a ruler claiming a known
size to 6% that cannot vouch for its anchor is a box of the wrong size (Rule #4), not a witness.
With the plate refused the two body rulers blend to 0.00416, **-1.9%** of the sensor. So the
square-on hinge's body rulers are within 2% -- where the oblique morning take had every ruler
16-44% high -- and the record shipped at 697 did what it was built to do once the plate was out
of the way.
**Making the test symmetric for every ruler was replayed first and rejected**: it takes the
10-05 Back Squat from -3.58% to +24.43% (its height ruler at 0.7 of the body rulers was the good
one, admitted from their end). The ledger row for this take carries `shippedUnderDefect` and the
replay asserts the fixed pipeline no longer reproduces the shipped scale.
**What is still wrong with the scale right:** mean would read 0.68 against 0.85 (-20%), peak 1.23
against 1.43 (-14%). Concentric 0.83-0.93s per rep where the sensor's 0.625m at 0.85m/s is about
0.74s -- a window a quarter long on a hinge, no rep floored or capped, 0-7 frames under the
wrist floor per rep (the morning's trace fault did not recur square-on). 7 of 8 reps found on
both sets. The next RDL step is the drive window in the RDL's own record, after the next
square-on take confirms the scale lands.

**BOX JUMP x6 onto 24in, set 2 (rep 1 a set-up rep on the OVR, skipped).** `boxRise` applied
1.201 (net rises 74.8/74.6/73.2/72.1/72.6 onto 61cm, 5 reps used), set 1 1.222. Hip
countermovement against the OVR's hip, reps 2-6:

| | corrected (shipped) | uncorrected | sensor |
|---|---|---|---|
| set 2 peak | 2.03 2.24 2.30 2.20 2.40 (2.23, -15%) | x1.201 = 2.68 (+2%) | 2.49 2.89 2.61 2.64 2.45 (2.62) |
| set 1 peak | 2.28 1.86 1.93 1.60 1.82 (1.90, -29%) | x1.222 = 2.32 (-13%) | 2.62 2.75 2.60 2.68 2.64 (2.66) |
| set 2 mean | 1.22 1.53 1.11 1.38 1.38 (1.32, -4%) | 1.58 (+15%) | 1.37 |
| set 1 mean | 1.33 1.31 1.32 0.97 1.22 (1.23, -13%) | 1.50 (+7%) | 1.41 |

The raw hip peak shipped on 697 answered its question: raw and smoothed are within 0.08 m/s on
every rep (2.00/2.19/2.21/2.14/2.48 against 2.03/2.24/2.30/2.20/2.40), so smoothing lag is not
where the -15% comes from. What the two sets disagree about is whether the ankle's box ruler
should divide the hip's velocities at all -- set 2 says no (the uncorrected peak is +2%), set 1
says partly. Two takes that disagree by 17% on the same number are Rule #5's case exactly, so
**no jump number moved**; `uncorrectedConcentricMeanVelocityMps` and
`uncorrectedConcentricPeakVelocityMps` ride beside the corrected ones in every box-set export
now, and the next two box sets decide. The ankle's rise onto the box is consistent at 1.20-1.22x
on both sets, which is the one steady thing about the jump.

Also fixed on the way: the box jump's `jumpBreakdown` carries the raw hip peak for the first
time (697), and the admin export now has four traced captures from 697 to replay.
`a-plate-agrees-from-both-ends` is covered by the ledger's defect row rather than a new file: the
RDL set 2 row reds if the as-filmed replay ever reproduces the plate-admitted scale again.

## Second pass, 2026-10-29: the RDL gets its own numbers, and the harness learns to see them

Scott, after the first pass shipped nothing to the phone: "Change something and push to Apple ...
if I don't have changes why would I re-record? We will just get bad numbers again with no fix."
And twice more: "everything should be separate ... any changes you're making to squat should
not effect rdl should not effect the jump and vice versa."

Both are right, and the second is what made the first answerable. The ledger (six new rows this
morning) replays every sensor-paired take through the live pipeline, so a change can be costed on
every squat and every RDL BEFORE it ships rather than on the next filming day. Three candidates
were replayed; two were rejected by the replay and one shipped.

### Rejected by the replay, so nobody tries them again

- **A shared refit of `DEPTH_RULER_BIAS`.** Swept 0.9 -> 1.3 on all ten ledger rows: every value
  that helps the RDL hurts every squat (squat median 3.6% -> 5.5% at 1.10), the worst case never
  drops below 20%, and at 1.25 the 10-19 RDL set 2 flips from +4.5% to -36.3% because the plate
  takes the cluster. Removing depth from the vote entirely: squats 3.6% -> 5.9%. A shared
  constant cannot fix a hinge-only error, which is the registry's whole argument.
- **Reading a floored peak off the unfiltered window.** Today's RDL floored 5 of 7 peaks and the
  window diagnostics said why: the confidence filter removed 17 of 18, 19 of 24, 23 of 46
  samples, so the surviving pool was the slow frames. The obvious rule -- when the filter has
  emptied half the window and the filtered peak sits below the mean, read the 95th percentile of
  the whole window instead -- replayed to 2.56, 1.95, 2.0 and 1.9 m/s on reps the sensor read at
  1.57-1.64. The low-confidence frames are noise, not the peak the filter hid. Reverted. The
  floor stays, and the peak on that take is honestly unmeasurable from its trace.

### Shipped: the Romanian Deadlift's own record, and the collapse weighing its pair

**`FITTED_OVERRIDES["Romanian Deadlift"] = { depthRulerUncertainty: 0.6, maxPeakToMeanRatio: 2.5 }`**,
the registry's first entry, with `FITTED_OVERRIDE_EVIDENCE` beside it and the copy test rewritten
from "the list is empty" to "every entry names its date, its sensor and its takes".

- **The depth ruler is a 0.6 instrument on a hinge, stated as such.** Against the sensor it read
  +10, +8, +35, +27, +44% on the five RDL takes in the ledger while the in-plane bone read -9,
  -17, -1, -1, +16 -- and the two were averaged EQUALLY into one witness (build 578's collapse was
  an unweighted geometric mean), so half the depth ruler's error rode into every hinge. The
  collapse is inverse-variance weighted in log space now, which is the old geometric mean to the
  last digit whenever both halves state the same uncertainty (every lift but this one), and the
  collapsed witness states the TIGHTER half's uncertainty -- the first draft kept the wider, and
  that handed the vote to the shoulder ruler instead (RDL rows moved by a point). This is a
  judgement about an uncertainty, not a fit of a bias: nothing is corrected, the depth ruler is
  believed a ninth as much as the bone on this lift.
- **The peak-to-mean cap is 2.5 on this lift.** The 2.0 was fitted on 60 bench reps (sensor ratio
  1.35-1.5). The OVR's own ratio on this athlete's RDL is 1.57-1.78 on all 16 reps across 10-19
  and 10-29, and Forge's mean reads LOW on a hinge (0.74 against 0.89), so a correctly-read peak
  reaches 2.1-2.2x the mean and the cap was cutting it: 10-19 set 2 wrote 1.575 and 1.624 down as
  1.53 and 1.49. At 2.5 the un-rack the cap exists for (3.5x on the 10-06 bench) is still caught.

**What it does on every paired take, replayed:**

| ledger row | as filmed | before today | shipped 10-29 |
|---|---|---|---|
| 10-04 RDL | -7.9% | +3.6% | **-0.2%** |
| 10-05 RDL | -7.0% | -1.9% | -6.6% |
| 10-19 RDL set 1 | +16.4% | +16.4% | **+9.7%** |
| 10-19 RDL set 2 | +12.0% | +12.0% | **+6.7%** |
| 10-29 RDL | +30.5% | +30.5% | **+25.2%** |
| every Back Squat row | | | **identical to the hundredth of a point** |

RDL median error 12.0% -> 6.7%. The 10-05 take is the cost (4.7 points worse; it was filmed with
no height on file and is the one where depth read only +8%) and it is in the ledger's own comment
rather than averaged away. Today's +25% is still a trace problem as much as a scale problem
(see the first pass), which the next square-on RDL separates.

On the peak: 10-19 RDL set 2 replays at 1.43 against the sensor's 1.59 (was 1.40); today's RDL
is unchanged at 1.06 because a floored rep is floored whatever the cap says.

**And the harness had never seen a per-lift number.** `capture-replay.ts` passed no record to
`summarizeTrackedSet`, so every replay ran on the shared defaults; the first override replayed as
if it did not exist, which is how the fidelity gap was found. It resolves `cameraTunablesFor` for
the capture's exercise now, exactly as the dialog does, and the ledger's live replay reads each
row's uncertainties off the same record instead of the module constants (asserting the registry's
defaults still equal those constants, so a drift there is loud).

**Separation, proved rather than promised** (`ovr-2026-10-29-every-lift-reads-only-its-own-record.test.ts`,
over the four traced captures of the export): the harness reproduces the shipped reps, range of
motion and mean on all four; the two squat traces replay to their shipped peaks with no rep capped
or floored; the RDL traces read their own cap. And `the-collapse-weighs-the-pair.test.ts` pins the
equal-uncertainty case to the old geometric mean to eight decimals.

### The squat and the jump, asked for directly and not changed

Scott: "Make sure you fix the squat and the jump as well. How can we get those closer."

**The squat is at -1.9% on range of motion and nothing here touched it.** What is off today is the
mean, -10% (0.72 against 0.80), where 10-19 set 2 read 0.0% on the same code. Per rep the sensor's
means are 0.87 0.83 0.82 0.77 0.74 and Forge's 0.57 0.80 0.79 0.76 0.65: reps 2-4 are inside 4%,
rep 1 is 35% low and rep 5 12% low. Rep 1's drive window is 1.23s inside a 5.0s phase that opens
at the walk-out (`open` 0.032), so the window started before the descent did. That is a
segmentation rule about a FIRST rep that follows a walk-out, it has one take of evidence, and it
is recorded here for the next squat rather than written today.

**The jump's box height is right; its velocities are the open item, and the export could not say
why.** `jumpHeightCm` on a box set is the net rise onto the box corrected by the box ruler, so it
reads the box (61.5-69.2 on 61cm). The two velocities bracket the sensor's 2.66 m/s by +30% and
-30% (first pass). The hip's own peak is the right quantity and reads low; the one thing that
could tell smoothing lag from a bad hip trace is the same read off the UNSMOOTHED hip, so the
countermovement now carries `concentricPeakVelocityRawMps` beside the smoothed one (declared in
the schema, read by nothing). The hip trace itself is not in the export, so the jump cannot be
replayed here the way a bar take can; that is the gap the next jump fills.

### Next

1. Film the RDL square-on. The record shipped today is tested by that take: the scale should land
   near +7-10% if the extra +15% today was the angle, and the trace should stop losing a quarter
   of its wrist frames.
2. Read `concentricPeakVelocityRawMps` against the smoothed read on the next box jump.
3. The squat's first-rep window after a walk-out, once a second take shows it.
