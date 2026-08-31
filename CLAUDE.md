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
