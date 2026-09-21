# Phase 5b: analysis during recording

Asked for four times, not built. This is the plan, written before any code so the
shape is arguable without a 400-line diff in the way.

## What it is

Today the pipeline is strictly sequential:

    record -> file closes -> AVAssetReader re-reads every frame -> Vision per frame -> save

The Vision work is the long pole (a 25.6s clip at 120fps/stride 4 is ~19s of
analysis after the athlete has already stopped). Every one of those frames also
went through the capture session live, moments earlier, and was thrown away.

Phase 5b runs the same per-frame work on the live sample buffers, so that by the
time `stopRecording` returns the trace already exists and `analyzeRecording`
resolves from it instead of re-reading the file.

## The honest limit on "79% when I'm done filming"

Analysis can finish at the moment recording stops. **The upload cannot start
before it.** `AVCaptureMovieFileOutput` writes one container and closes it at
stop; there is no partial file to send. So what changes at stop is:

- before: `Analyzing...` for ~19s, then `Saving... 0-100%`
- after: `Saving... 0-100%` immediately, no analysis wait

That is the whole win and it is a real one, but it is not a save bar ticking
during the set. Chunked recording (AVAssetWriter, segment output, upload per
segment) would buy that and is a much larger change; it is not in this phase.

## Structure

The per-frame body inside `runPoseAnalysis`'s `while reader.status == .reading`
loop is ~320 lines and carries ~20 mutable locals that live across frames
(`frameIndex`, `processedCount`, `trackedCount`, `visionFailureCount`,
`previousProcessedTimestamp`, `maxInterFrameGapSeconds`, `handPoseElapsedSeconds`,
`body3DElapsedSeconds`, `body3DFrameCount`, `boxTopCandidates`, plus the four
tracker/overwatch objects). Passing those as inout parameters would be a
twenty-argument function nobody can call correctly twice.

So: **`AvFrameAnalyzer`, a final class that owns that state.**

    final class AvFrameAnalyzer {
        init(trackingMode: String?, detectBox: Bool, sampleEveryNthFrame: Int,
             orientation: CGImagePropertyOrientation, emit: @escaping ([String: Any]) -> Void)
        func consume(sampleBuffer: CMSampleBuffer)   // applies the stride itself
        func finish() -> Summary                     // the result dict + the diag lines
    }

- The loop body moves in verbatim. `self.notifyListeners` becomes the `emit`
  closure so the analyzer has no Capacitor dependency.
- `runPoseAnalysis` keeps everything else it does -- the reader, the watchdog,
  cancellation, the background task, `settle` -- and its loop becomes
  `analyzer.consume(sampleBuffer:)`.
- The live delegate constructs the same class with the same arguments.

One implementation, two feeders. Anything else and the two paths drift and only
one of them is the one being calibrated against OVR.

## The live feeder

`AVCaptureVideoDataOutput` added alongside the existing `AVCaptureMovieFileOutput`
in `continueStart`, with its delegate on a dedicated serial queue (never
`sessionQueue`, never main).

Four things have to match the file path exactly or the numbers move:

1. **Resolution.** The reader decodes down to 1280 max dimension. The data
   output gets `videoSettings` with the same width/height, so Vision sees the
   same pixels. Without this the live trace is a different measurement.
2. **Orientation.** The file path derives `CGImagePropertyOrientation` from the
   track's `preferredTransform`. Live, it comes from the data output's
   connection `videoOrientation` (set to `captureOrientation`, same as the movie
   connection). Computed once at record start, not per frame.
3. **Stride.** The same rate-relative stride the file path uses
   (`baselineStride * max(1, activeCaptureFrameRate / 60)`), so the same cadence
   of frames is analyzed. `AvFrameAnalyzer` owns the stride, so both get it for
   free.
4. **Timestamps.** `CMSampleBufferGetPresentationTimeStamp` on a live buffer is
   on the session clock, not zero-based. The analyzer subtracts the first
   processed frame's timestamp so `timestamp` in the `poseFrame` event stays
   "seconds since the start of the clip", which is what the JS side assumes.

`alwaysDiscardsLateVideoFrames = true`. The alternative backs the capture session
up and risks the recording itself, which is the one thing that must not break.
Drops are counted in `captureOutput(_:didDrop:from:)`.

## When to fall back to the file

The post-capture path stays, and stays the default whenever the live trace is not
demonstrably complete. Fall back if any of:

- the data output could not be added to the session
- `ProcessInfo.thermalState` is `.serious` or `.critical` at record start
- dropped frames exceed 5% of frames that would have been sampled
- processed frame count is under 90% of `clipDuration * activeCaptureFrameRate / stride`
- the session reported a runtime error or interruption during the take

`stopRecording` decides, and `analyzeRecording` either resolves from the live
summary or does exactly what it does today. The diagnostics blob records which
path produced the take (`analysisPath: "live" | "file"`, plus
`liveDroppedFrames`), because a calibration run against a trace is worthless if
nobody can tell which of two implementations produced it. Report and admin
export surface it.

## Risks, named

- **Thermal.** Vision now runs concurrently with 120fps encode rather than after
  it. Total Vision work is unchanged (same stride, same frames), but the peak is
  higher. The thermal gate above is the mitigation; the telemetry is how we find
  out whether it was enough.
- **No Swift compiler in this sandbox.** `verify_build` on the macOS runner is
  the only compile. This change cannot be shipped on a `beta` without a green
  `verify_build` first, and cannot be trusted without Scott filming a set on it.
- **A bug here breaks the camera outright**, not a number on a report. That is
  why the fallback is a real branch and not a comment.

## Verification

1. `shared/live-analysis-shares-one-path.test.ts` -- reads the Swift source and
   fails if `runPoseAnalysis` grows its own per-frame Vision calls again, or if
   the live delegate does. Same technique as `shared/tracker-arbiter.test.ts`,
   same reason: the constants and the logic live in Swift, which has no test
   target here.
2. `verify_build` before any upload.
3. Scott films one squat set and one jump set. The comparison that matters is
   the live trace against a file-path trace of the same clip -- forcing
   `analysisPath: "file"` on a second run of the same recording gives both from
   one take, which is the only way to tell an implementation difference from a
   filming difference.

## Order of work

1. Extract `AvFrameAnalyzer` with no behaviour change; the file path uses it.
   `verify_build`. This is a safe, separately shippable commit.
2. Add the data output, the delegate, the gates and the fallback.
   `verify_build`.
3. `analyzeRecording` resolves from the live summary when one is complete.
4. Diagnostics + report surfacing of `analysisPath` and `liveDroppedFrames`.
