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
- **Polish**: pinch-zoom and pan on either side; mirror; an optional grid; trim marks (play
  only the rep that matters, no re-encode); speed 0.1x; keyboard on web (space, arrows, [ ]
  for sync marks); gesture on phone (tap to pause, swipe to step).
- **Auto-sync suggestion**: when both clips have `repBreakdown` or a bar-path trace, propose
  the sync at the first rep's lowest point (`video-sync.ts`), and say it is a suggestion.

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
- Measure on a real phone: heat, battery, and analysis lag at 60 fps on the oldest supported
  device. This is why it sits after the compare tool: it needs `verify_build` and a phone,
  not a sandbox.
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

## Checklist (tick as each lands: PR number, commit)

- [ ] Phase 0: existing tools verified, fixes merged
- [ ] Phase 1: compare any two clips, sync, linked/unlinked transport, overlay controls
- [ ] Phase 2: saved reviews with timed drawings, shared as a comment
- [ ] Phase 3: voice-over
- [ ] Phase 4: reference library, zoom/pan, auto-sync, trim
- [ ] Phase 5: export and share
- [ ] Phase 5b: analyse while recording (native, needs a phone)
- [ ] Phase 6: AI draft notes (only if asked)
