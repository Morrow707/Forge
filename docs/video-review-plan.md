# Video review: the plan

Written 2026-09-20 for Scott, so that whichever model continues this work starts from the same
place. Scott: "Right now coaches can review submitted videos, draw angles, and put a skeleton over
the video to check for various things. I want to make sure all of those work, but I want to add
some things, I want to add a voice over process, I want to add a side by side video comparison so
I can take let's say an Olympic power lifter and compare it, I want to be able to overlay, and
match them up for time, so I can pause and stop both videos separately or together, what I'm after
is what onform does."

**If you are a model picking this up:** read `CLAUDE.md` first (batching rule for TestFlight,
file-ownership rule for parallel helpers, the camera caveat rule, the "hydrate-in-an-effect"
shape, capture-diagnostics invariants). Work on branch `claude/modest-babbage-y53kyw`, PR into
`main`, merge, run `verify_build` (these are client changes, they reach the app), do NOT run
`beta` unless Scott says "upload". Every phase below ends with tests green (`npx tsc --noEmit -p .`,
`npm test`, the relevant `*.itest.ts` against Postgres on 5433 per CLAUDE.md), a commit, a PR, a
merge, and a tick in the checklist at the bottom of this file. Do the phases in order.

## What exists today (verified 2026-09-20)

| Piece | File | What it does |
|---|---|---|
| Analysis tool | `client/src/components/video-analysis-dialog.tsx` (933 lines) | Read-only review of one clip, modelled on OnForm: skeleton overlay (from saved `skeletonFrames` on iOS captures, or MediaPipe re-run on web), tap-a-joint angles, manual angle tool, drawing, ruler, stopwatch, slow-motion 0.25/0.5/1/2x, frame step. Nothing is saved. |
| Frame annotation | `client/src/components/video-annotation-dialog.tsx` (257 lines) | Coach pauses a form-check clip, draws freehand in four colours, and the frame is uploaded (`POST /api/coach/annotations`, an image) and attached to a comment reply (`workoutComments.coachAnnotationUrl`). The only thing that persists today. |
| Set comparison | `client/src/components/set-video-review.tsx` (582 lines) | Best/worst flags per set; side-by-side and ghost-overlay of two sets FROM THE SAME DAY, aligned by rep when tracked data exists, with a linked scrub slider. Cannot compare across days, athletes, or against a reference clip. |
| Recorder | `client/src/components/form-video-recorder-dialog.tsx` | MediaRecorder + getUserMedia, so mic capture is already proven on the iOS WebView. |
| Upload | `POST /api/athlete/form-video` (athlete, coach, admin) | Stores clips under `STORAGE_PATH`, signed URLs, retention cap per athlete (`server/video-retention-job.ts`). |

Gaps against what Scott asked for: no comparison across clips/athletes/reference lifts, no manual
time-sync, no independent-or-linked transport, no overlay controls (opacity, flip, scale, nudge),
no voice-over, no saved review (drawings and angles vanish on close), no export, no reference
library, no arrows/lines/text (freehand only).

## Principles that hold for every phase

- **A review is data, not a rendered video.** A saved review is the clip reference(s) plus a
  timed event log (scrub position, drawings, angles, audio). Playback re-renders it. That keeps
  a review at kilobytes, editable, and free of a transcode step. Burning to a real video file is
  the LAST phase and only for sharing outside the app.
- **Camera numbers carry the caveat.** Any joint angle, velocity or timing shown in a review
  goes through `<CameraMetricCaveat>` like every other surface (`camera-caveat-coverage.test.ts`
  scans pages; add the new page to it, never exempt it).
- **Access is the existing rule.** Who may open a clip is `canManageWaiversFor`-style
  relationship logic already used by the form-video routes: the athlete, their guardian, their
  coach (roster-scoped, per-team narrowed), an admin never gets the file URL. A reference clip a
  coach uploads is the COACH's, visible to their staff; an athlete's clip never becomes a
  "reference" for another athlete without the coach choosing it and the athlete's clip retention
  rules still applying.
- **Retention reaches reviews.** When a clip is purged by the retention cap, every review that
  references it loses the clip too (the review row stays, marked, so the coach's notes survive);
  voice-over audio and exported videos live under the same `STORAGE_PATH` and the same purge.
  Purging never touches metrics (CLAUDE.md invariant).
- **Minors.** A review is coaching content about a child. It is shown to the athlete and their
  guardian; it is never shared outside the app except by the coach's explicit export, and the
  export carries no name burned in unless the coach types it.
- **Both platforms.** The web bundle IS the app. Test on the iOS WebView (Safari 15 target): no
  `OffscreenCanvas` assumptions, no WebCodecs; `MediaRecorder` audio on iOS yields `audio/mp4`,
  web yields `audio/webm` — store whatever comes and play it with `<audio>`.
- **Hydrate-in-an-effect is banned** (CLAUDE.md). Every editor gives its query `isError` and
  renders `ReadFailed` before the editor.

## Phase 0: make sure what exists works (small fixes only)

Runtime click-through of the three existing tools as coach and as athlete, on the seeded DB:
skeleton overlay draws on an iOS-captured set and on a web-captured set; tap-a-joint angle;
manual angle; drawing; ruler; stopwatch; each playback speed; frame step forward/back;
annotation dialog saves and the reply shows the image; set comparison split and overlay modes,
rep alignment, linked scrub. Record BROKEN with repro and fix anything small. Known suspect from
the perf pass: `VideoAnalysisDialog` is now lazy — confirm it still opens from all four callers
(`set-video-review`, `skills-trends-panel`, `skill-sessions-panel`, `coach/analytics`).

## Phase 0b: the 22-second "finishing" after a set (do this before Phase 1)

Scott, 2026-09-22, with a screenshot: after a bench set the card shows "Processing 100%",
"Saving 17%", and then "finishing" for about 22 seconds before the set reads as saved. "22
seconds is far too long."

### What the code says happens between "Processing 100%" and "saved"

1. Native analysis finishes (`analyzeRecording`, stride 2, `use-av-body-tracking.ts:35`) and
   hands the JS side every pose frame: on a 30 s set at 60 fps stride 2 that is ~900 frames ×
   33 landmarks × (x, y, z, visibility) plus world landmarks, i.e. several megabytes of JSON.
2. The dialog computes the metrics in JS on the main thread (`av-bar-tracker-dialog.tsx`,
   bar-tracking, calibration, trust scores) and calls `onCapture` with `skeletonFrames`,
   `barPathTrace`, `armPathTrace` and the diagnostics blob attached to the set.
3. `workout.tsx` `queueSave` serialises the WHOLE DAY (`JSON.stringify(payload)`,
   `workout.tsx:1856`) including those blobs and POSTs it to `/api/athlete/log`. The server's
   `express.json` limit was raised to 25 MB for exactly this payload, and the client already
   has a 413 fallback that strips the blobs (`log-payload-trim.ts`), which is evidence the
   payload is routinely multi-megabyte.
4. The server does a delete-and-reinsert of the day inside a transaction, writing the json
   columns, then the response returns the row ids.
5. Separately, the video upload ("Saving 17%") runs through `uploadOrQueueVideo`; it is
   backgrounded and never blocks the save, and on cellular (the screenshot shows two bars) a
   1080p60 clip is tens of megabytes.

Hypothesis, in order of likelihood: (a) step 3 — a multi-megabyte JSON body on a two-bar
cellular link is 10 to 30 seconds by itself; (b) step 2 — metrics over ~900 frames on the
main thread, blocking the UI; (c) step 4 — jsonb parse and insert of megabytes per set. The
video upload is NOT the cause of the label; it has its own progress.

### Step 1: instrument before touching anything (one small PR)

Add `logDebug("SAVE", ...)` timestamps (the phone has no other instrument, CLAUDE.md) at:
analysis complete; metrics computed; `queueSave` called with `payload bytes = N`; POST sent;
response received with status and elapsed ms. Also log `skeletonFrames.length` and the
byte size of each heavy field. Scott films one set, sends the SAVE lines, and the numbers
decide which of (a), (b), (c) to fix first. Do not skip this: every earlier camera wait was
guessed at three times before somebody measured.

### Step 2: the fix for (a), which is the expected one — save the set small, ship the frames after

- The set save carries the metrics and the diagnostics only; `skeletonFrames`,
  `barPathTrace` and `armPathTrace` are OMITTED from `/api/athlete/log` (omission means
  "keep what the server has", the existing capture-column contract — never send null, that
  clears it). The save becomes kilobytes and returns in well under a second, and the card
  reads "Saved".
- A new route `PATCH /api/athlete/log/sets/:workoutSetEntryId/traces` accepts the three
  blobs for ONE set, by the row id the save response already returns (`savedSetRowIds`,
  added 2026-09-20 for video reattachment; reuse exactly that plumbing). Ownership check
  through the log's athleteId, same as `attachVideoToLoggedSet`. Coach and admin
  self-training use it too (same three roles as the form-video route).
- The client sends the traces in the background through the existing offline queue
  (`offline-queue.ts`), retried like a queued day, so a phone that loses signal still
  delivers them. Row ids can change on a resave (delete-and-reinsert): match by row id
  first, then by the (programExerciseId, setNumber, date) tuple, exactly the video
  reattachment precedence, and carry the blobs forward on resave the way `priorVideoByKey`
  carries the video.
- Compress before sending: quantise landmark floats to 4 decimals (they are 0–1
  normalised; 4 decimals is sub-pixel at 1080p) and gzip the body with `CompressionStream`
  where present (iOS 16.4+, Chrome) with `Content-Encoding: gzip`; the server already sits
  behind `compression()` for responses, so add the request-side decompress middleware for
  this one route. Expect 5–10× smaller. Measure with the Step 1 lines.
- Every reader of `skeletonFrames` (the analysis dialog's overlay, the compare tool, the
  tracking report) already treats the column as nullable, so a review opened before the
  traces land shows the video without the skeleton and a "skeleton still uploading" note;
  add that note where the overlay is drawn.
- The 413 fallback in `workout.tsx:1920` and `dropHeavyFields` stay as the safety net.
- Tests: itest that a set saved without traces then PATCHed by row id reads back with them;
  stale row id falls to the tuple; another athlete's row id 404s; the day save payload for
  a tracked set contains no `skeletonFrames` key (scan of the queueSave path); round-trip
  of the quantised frames through the zod schema.

### Step 3: the fix for (b), only if Step 1 shows it — metrics off the main thread

Move the post-analysis computation (`bar-tracking.ts` metrics, calibration, trust scores)
into a Web Worker (`client/src/workers/capture-metrics.worker.ts`) fed by `postMessage`
with transferable buffers. The dialog stays responsive; the athlete can start the next set
while the numbers finish. Keep the pure functions where they are; the worker imports them.
Not before measuring: a worker adds a bundle chunk and a message-passing seam for nothing if
the compute is under a second.

### Step 4: the fix for (c), only if Step 1 shows it — server write

If the insert is the wait: write the traces to their own table (`workout_set_traces`,
one row per set, keyed by `workoutSetEntryId`) so the day's delete-and-reinsert never
rewrites megabytes it did not change, and the set row stays small for every list read (the
perf pass already excludes the blob columns from lists). This is a schema change; the
reader functions get one join.

### Step 5: the label

Whatever the numbers say, the card must never show a bare "finishing". States, in order:
"Analysing N%" → "Saved" (the moment the small save returns) → a secondary line "Video
uploading N%" and "Skeleton uploading" that the athlete can ignore. The next set is never
blocked on either upload. Phase 5b (analyse while recording) later removes the "Analysing"
wait too.

## Phase 1: compare any two clips, synced, with a transport that can link or unlink

New page-level component `client/src/components/video-compare.tsx` (replaces the pairing half of
`set-video-review.tsx`; keep the best/worst flags there).

- **Clip picker** (`client/src/components/clip-picker.tsx`): sources are (a) this athlete's
  clips (any day, any set, skill clips), (b) any roster athlete's clips the coach may see,
  (c) the coach's reference library (Phase 4; stub with "none yet"). Server: extend the existing
  list routes or add `GET /api/coach/roster/:athleteId/clips?movement=` returning
  `{videoUrl, date, exercise, setNumber, skeletonFrames?: boolean, repBreakdown?}`; athlete
  variant `GET /api/athlete/clips`. Signed URLs as today.
- **Sync point.** Each side has "Mark sync here": stores `syncT` per side. Linked time
  `t_right = t_left - syncL + syncR`. Default sync = 0. When both clips carry `repBreakdown`,
  offer "Align to rep N" which sets both marks to that rep's `startT` (the existing alignment
  logic in `set-video-review.tsx`, lifted into `client/src/lib/video-sync.ts`, pure, tested).
- **Transport.** Play/pause/step/scrub for LEFT, RIGHT, and BOTH. "Link" toggle: when linked,
  one control drives both through the sync offset; when unlinked, each has its own. Speeds
  0.1, 0.25, 0.5, 1, 2. Frame step = 1/30 s by default, or the clip's real frame rate if
  known. Use `requestVideoFrameCallback` where present, fall back to `timeupdate` + rAF.
- **Overlay mode.** Right clip drawn over left on a canvas with opacity slider, mirror
  (horizontal flip, for a left-handed vs right-handed lifter), scale and x/y nudge, and a
  "swap" button. Split mode is the default.
- **Skeleton on both.** Reuse the analysis dialog's skeleton drawing for each side when frames
  exist.
- Tests: `client/src/lib/video-sync.test.ts` (offset math, rep alignment, clamping at clip
  ends); a scan that the transport never calls `play()` on a side that is unlinked and not
  targeted; itest for the clip list routes (roster scoping, per-team narrowing, admin gets no
  URL, minors' clips only to their coach/guardian).

## Phase 2: saved reviews with a timeline of drawings

- **Schema** (`shared/schema.ts`, single owner): `video_reviews` (id, coachId, athleteId
  nullable, title, leftClip json {videoUrl, source, label}, rightClip json nullable, syncL,
  syncR, mode, overlay settings json, createdAt, updatedAt, sharedWithAthleteAt nullable,
  purgedAt nullable) and `video_review_events` (id, reviewId, t (seconds on the review's
  timeline), kind: `stroke | arrow | line | circle | text | angle | ruler | pause | scrub |
  speed | flag`, payload json, side: `left | right | both`). Reconcile with idempotent
  `CREATE TABLE IF NOT EXISTS`, proved with `db:reconcile`.
- **Tools** added to the drawing toolbox (Scott, 2026-09-20: "I like your tool additions, add
  those to the plan"), each an event at the current time; a drawing persists until the next
  `scrub`/`pause` boundary unless pinned ("keep on screen for N s"):
  1. **Arrow** and **straight line** (direction of force; the bar path wanted versus got).
  2. **Circle** and **box** ("look here" without a scrawl).
  3. **Text label** at a timestamp; with voice-over it is the caption.
  4. **Vertical and horizontal guide lines** that SNAP TO A JOINT so they follow the skeleton
     frame to frame: a plumb line from the bar, a floor line, a hip-height line. The one
     lifters reach for most.
  5. **Bar path trace** drawn as an overlay from the iOS capture's tracked path, not only the
     deviation number. Data Forge already has; carries the camera caveat.
  6. **Tracked angle over time**: pick a joint angle and it stays on screen through playback,
     updating each frame, with a small graph. Today an angle is one frozen reading. Caveat
     attached.
  Plus the existing freehand and angle. Zoom/pan, trim marks, mirror and an optional grid are
  Phase 4.
- **Routes**: `POST/GET/PATCH /api/coach/video-reviews`, `GET /api/athlete/video-reviews`
  (only those `sharedWithAthleteAt`), guardian variant for a minor. A review is shared by
  posting it as a comment reply (extend `workoutComments` with `videoReviewId`, alongside the
  existing `coachAnnotationUrl`) so it lands where the annotation already does.
- **Playback** re-renders the event log against the video positions. The athlete's view is
  read-only.
- Tests: itest for ownership/scoping/share; unit tests for the event renderer (given events and
  a time, which drawings are visible).

## Phase 3: voice-over

- Record button in the review editor: `getUserMedia({audio: true})` + `MediaRecorder`;
  while recording, every transport action (play/pause/scrub/speed/link) and every drawing is
  logged as an event with `t = audio elapsed`. Stop writes the audio blob to
  `POST /api/coach/video-reviews/:id/audio` (stored under `STORAGE_PATH/reviews/`, mime as
  produced) and marks the review `hasVoiceOver`.
- Playback: `<audio>` is the master clock; video positions and drawings follow the event log.
  Pausing the audio pauses everything. A scrub of the review timeline seeks audio and replays
  state up to that point.
- Re-record replaces the audio and the events recorded during it; drawings made outside a
  recording are kept.
- Mic permission string already exists for iOS (check `NSMicrophoneUsageDescription` in
  `ios/App/App/Info.plist`; add if missing — that is an App Store rejection class, run
  `verify_build`).
- Tests: unit test for the clock model (audio time → per-side video time through sync and
  speed events); itest that audio upload is owner-only and purged with the review.

## Phase 4: reference library, polish, auto-sync

- **Reference clips**: `reference_clips` (coachId, title, movement tag from the exercise
  library, videoUrl, source: `uploaded | from_athlete` with the athlete id when copied, notes).
  Upload from the device (`POST /api/coach/reference-clips`, same multer + disk-space guard as
  form-video) or "save as reference" from a roster clip (coach only, and it copies the file so
  the athlete's retention purge does not break the reference; the copy is the coach's).
  Visible to the coach and their staff.
- **Polish**: mirror (overlay mode), speed 0.1x, an optional thirds grid, trim marks (play
  only the rep that matters, no re-encode -- two numbers and a loop), and the web keyboard
  (space plays both, arrows step a frame, `[` and `]` set the sync marks). DONE 2026-09-21.
  Still open: pinch-zoom and pan on either side, and the phone gestures (tap to pause, swipe
  to step) -- both need a real touch device to get right, and a gesture tuned in a sandbox is
  a gesture that fights the person using it.
- **Auto-sync suggestion**: when both clips have `repBreakdown` or a bar-path trace, propose
  the sync at the first rep's lowest point (`video-sync.ts`), and say it is a suggestion.

## Phase 4b: the Forge-specific additions (Scott, 2026-09-20: "add everything into the master plan")

Each of these uses something Forge already has and OnForm does not. Build after Phase 4, in
this order, one PR each.

1. **"You versus you."** When the coach or athlete opens Compare on a clip, the picker's first
   suggestion is the SAME athlete's most recent earlier clip of the SAME exercise (by
   `exerciseId`, falling back to name), at least 14 days older, preferring one with
   `repBreakdown` so auto-sync works. Route: `GET /api/athlete/clips/prior?exerciseId=&before=`
   and the coach variant. UI: a "Compare to N weeks ago" button beside the clip. No reference
   library needed for this case.
2. **Review queue.** Athlete taps "Ask my coach to check this" on a set with a clip; writes a
   `video_review_requests` row (athleteId, setId, requestedAt, resolvedAt, reviewId). Coach
   sees a queue (count badge in the nav, list sorted oldest first, age in days) and opening a
   request opens the review editor on that clip; saving and sharing the review resolves the
   request. Notification to the athlete on resolve; the in-app bell, and email through the
   same sendEmail path the documents chase uses.
3. **Cue library.** `coach_cues` (coachId, kind: `text | audio`, text, audioUrl, label). In
   the review editor a "Cues" drawer lists them; dropping one onto the timeline adds a `text`
   event or an `audio` event (a short audio clip played at that time during playback, mixed
   with or instead of the voice-over). Cues are the coach's and visible to their staff.
4. **Review-to-program loop.** From a saved review, "Add a corrective" opens the existing
   exercise picker and appends the chosen exercise to the athlete's next scheduled day (or a
   named day) with a note that links back to the review. Uses the existing program-edit
   routes; the only new column is `programExercises.sourceReviewId` nullable, so the athlete's
   day shows "from your review on <date>".
5. **Athlete self-review.** Same editor for an athlete on their own clips; "Send to coach"
   shares it the way the coach's share works, in the other direction. The camera gate
   (`cameraAccessFor`) does not apply to REVIEWING an existing clip, only to recording (see
   CLAUDE.md "Watching a clip you already recorded is never gated").
6. **120 fps capture** (native, with Phase 5b): once analysis runs live and subsamples, the
   recorder can ask for 120 fps on devices that offer it at 1080p without the binned-readout
   formats the plugin comment warns about. Frame stepping and bar tracking both improve.
   Measure file size; keep 60 as the default until measured.

## Phase 5: export and share

- **Burn-in export**: render the review (both videos, overlay, drawings, angles, and audio)
  through a canvas at the review's own pace using `canvas.captureStream()` +
  `MediaRecorder`, producing `video/mp4` where the platform gives it (iOS) or `video/webm`
  (Chrome). Upload to `POST /api/coach/video-reviews/:id/export`; the file gets a signed
  share URL with expiry, and the share sheet on iOS. Export is explicit, coach-only, logged
  (who exported which athlete's review, when), and a minor's export shows a confirmation that
  names the guardian consent that covers it.
- Long clips: cap export length and warn; the render runs in real time, so a 60 s review takes
  60 s.

## Phase 5b (native): analyse while recording

Scott, 2026-09-20: "Is there a way for the video to process in the background as it's being
recorded?" Today the plugin records to disk natively, then RE-READS the finished file and runs
the body tracker per frame after stop (`analyzeRecording`, `AVAssetReader`), which is the wait
the athlete feels; upload already overlaps it and is queued in the background.

- Run `VNDetectHumanBodyPoseRequest` (and the object detector + overwatch) on the live sample
  buffers during recording, `AVCaptureVideoDataOutput` alongside `AVCaptureMovieFileOutput`,
  emitting the same `poseFrame` events the post-capture path emits today so the JS side is
  unchanged. Keep the post-capture path as the fallback for a clip that arrives without live
  frames (a device that fell behind, an imported video).
- Drop to every second frame when the analysis queue backs up (the existing
  `sampleEveryNthFrame` knob), never drop recording frames: the movie writer is separate
  hardware and must not be gated on analysis.
- This ADDS no work: the same per-frame tracking runs today, after the set instead of during
  it, and a set is twenty to forty seconds followed by a rest (Scott, 2026-09-20). The one
  thing to measure on a real phone is whether the oldest supported device keeps up at 60 fps or
  needs every second frame. It sits after the compare tool only because it needs
  `verify_build` and a phone, not a sandbox.
- Streaming the UPLOAD while recording (fragmented MP4 + a chunked upload route) is the
  smaller win; decide after measuring the live-analysis change.

## Phase 6 (optional, last): AI assist

- "Draft notes": send the review's angles and the coach's typed cues (never the video) to the
  cheap model for a first-pass note the coach edits. Goes through `callAnthropic` so usage is
  recorded. Camera caveat attached. Only if Scott wants it.

## What else OnForm-style tools have that is worth doing here, ranked

1. Side-by-side with sync and voice-over (Phases 1–3): the core ask.
2. Reference library (Phase 4): the "compare to an Olympic lifter" case needs somewhere for
   that lifter's clip to live.
3. Export/share (Phase 5): parents and athletes want the clip in Messages.
4. Ghost overlay with mirror and nudge (Phase 1): cheap, and it is what makes an overlay
   actually line up.
5. Arrows, lines, circles, text (Phase 2): freehand-only makes every note look scrawled.
6. Auto-sync from the rep data (Phase 4): Forge has data OnForm does not; use it.
7. Trim/clip: cut a 40 s take down to the rep that matters. Add in Phase 4 as start/end
   marks on the review (no re-encode; the review just plays the range).
8. Frame-accurate stepping with the real frame rate (Phase 1).
9. Athlete self-review: let an athlete use the same tool on their own clips and send a
   review to their coach (mirror of Phase 2's share). Cheap once Phase 2 exists.
10. Two-athlete leaderboard-style comparisons are NOT recommended: a comparison is a claim
    about people and the camera numbers are uncalibrated (CLAUDE.md).

## Handoff state, 2026-09-20 evening

Scott moved to another model at 93% usage while Phase 0 and Phase 1 were being built by two
helpers in the previous session. Their in-progress, UNVERIFIED work was snapshotted to branch
`claude/video-review-wip-2026-09-20` (pushed) so it is not lost; nothing from it is on `main`.
Whoever continues: check that branch first. If it typechecks and its tests pass, finish it on
`claude/modest-babbage-y53kyw` and PR to `main`; if it is half-built, treat it as reference and
rebuild the phase from the plan. What each helper was told to produce:

- **Phase 0 helper** (files: `video-analysis-dialog.tsx`, `video-annotation-dialog.tsx`,
  `workout-comment-thread.tsx`, `lib/video-pose-analysis.ts`, the annotations route): runtime
  click-through of every existing tool as coach and athlete on a seeded DB with uploaded test
  clips, a tool × role table, small fixes with a test each, and the name of the skeleton-draw
  function the compare tool should reuse.
- **Phase 1 helper** (files: NEW `video-compare.tsx`, NEW `clip-picker.tsx`, NEW
  `lib/video-sync.ts` + test, `set-video-review.tsx` minus its analysis-dialog call,
  `storage.ts`, `schema.ts`, `routes.ts` minus the annotations route): the compare tool exactly
  as Phase 1 specifies, clip list routes `GET /api/coach/roster/:athleteId/clips` and
  `GET /api/athlete/clips` (no skeletonFrames in list payloads), itest for scoping, transport
  scan test, lazy-loaded so the bundle budget test stays green.

Everything else in this file is unstarted. Build 488 is on TestFlight; #154 (SEO + perf) is on
`main` and waiting on the next upload.

## Checklist (tick as each lands: PR number, commit)

- [ ] Phase 0: existing tools verified, fixes merged
- [ ] Phase 0b: the 22-second finish (instrument, then small save + background traces)
- [ ] Phase 1: compare any two clips, sync, linked/unlinked transport, overlay controls
- [ ] Phase 2: saved reviews with timed drawings, shared as a comment
- [ ] Phase 3: voice-over
- [ ] Phase 4: reference library, zoom/pan, auto-sync, trim
- [x] Phase 4b.1: you versus you (prior-clip routes, the picker's first suggestion)
- [x] Phase 4b.2: review queue (athlete asks, coach queue oldest-first, resolve on share)
- [x] Phase 4b.3: cue library (coach_cues, the drawer, a `cue` event carrying a copy of the text)
- [x] Phase 4b.4: review to program (a per-athlete corrective on their next unlogged day)
- [x] Phase 4b.5: athlete self-review (authorId vs coachId, send-to-coach, the same editor)
- [ ] Phase 4 polish: pinch-zoom/pan and phone gestures (need a touch device)
- [ ] Phase 4b.6: 120 fps capture (native, with Phase 5b -- needs a phone)
- [x] Phase 5: export and share (burn-in render, expiring share link, audit trail, minor gate)
- [ ] Phase 5b: analyse while recording (native, needs a phone)
- [ ] Phase 6: AI draft notes (only if asked)
