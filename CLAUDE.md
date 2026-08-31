# Operating notes for Claude Code sessions in this repo

- After pushing changes to `main`, trigger a new iOS TestFlight build automatically
  (`.github/workflows/ios-testflight.yml`, `workflow_dispatch` with `lane: beta`) --
  do not ask for confirmation first. The web bundle is compiled into the native
  binary, so even client-only changes need a fresh build to reach a real device.
  Explicit user instruction (Scott), given after repeated back-and-forth asking
  each time: "Yes upload to testflight, don't ask anymore just do it" / "Make a
  note to always upload to Apple."
- If a change touches native code or adds/changes a native dependency (Swift
  files under `ios/`, or a new Capacitor plugin), run the `verify_build` lane
  first to confirm it compiles on real Xcode before spending a `beta` upload
  (Apple rate-limits TestFlight uploads) -- then follow with `beta` automatically,
  still without asking.
