# Operating notes for Claude Code sessions in this repo

- After pushing a change to `main` that actually affects the iOS app, trigger a new
  TestFlight build automatically (`.github/workflows/ios-testflight.yml`,
  `workflow_dispatch` with `lane: beta`) -- do not ask for confirmation first. The
  web bundle is compiled into the native binary, so even client-only changes (not
  just `ios/` Swift edits) need a fresh build to reach a real device. Explicit user
  instruction (Scott): "Yes upload to testflight, don't ask anymore just do it" /
  "Make a note to always upload to Apple" / "Obviously if it applies, some builds
  don't apply to iOS" -- so skip the build when a change genuinely can't reach the
  app (e.g. this file, an admin-only server route the app never calls, a workflow
  file, docs). When in doubt whether a change reaches the app, build.
- If a change touches native code or adds/changes a native dependency (Swift
  files under `ios/`, or a new Capacitor plugin), run the `verify_build` lane
  first to confirm it compiles on real Xcode before spending a `beta` upload
  (Apple rate-limits TestFlight uploads) -- then follow with `beta` automatically,
  still without asking.
- This environment's local git checkout has repeatedly reverted `main` to a stale
  commit between tool calls, especially after an idle gap (waiting on a build,
  a long pause between user messages) -- looks like a container-resume quirk in
  the remote sandbox, not anything wrong with the repo or with how commits are
  made. `origin/main` is never affected, and recovery is always a clean
  `git fetch origin main && git merge --ff-only origin/main` (verify
  `git status --short` is empty first). Once bitten (a whole audit run against
  a checkout ~112 commits behind origin/main, producing a real false report):
  run that fetch+ff-only check at the START of any work in this repo -- before
  reading files for research, not just before committing -- so stale state gets
  caught before it feeds conclusions, not just before it feeds a push.
