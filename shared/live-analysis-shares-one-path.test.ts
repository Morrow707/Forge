import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ONE PER-FRAME IMPLEMENTATION, TWO FEEDERS.
//
// The same Vision work now runs from two places: the AVAssetReader loop (a clip already on
// disk) and the live AVCaptureVideoDataOutput delegate (the athlete is still lifting). The
// whole value of Phase 5b depends on those being the SAME work -- a second copy would drift,
// and then the calibration runs against a bar sensor describe whichever one happened to
// produce the take, with nothing in the numbers to say which.
//
// There is no Swift test target in this repo, so this is a source scan, the same technique
// (and for the same reason) as shared/tracker-arbiter.test.ts.
const source = readFileSync(join(process.cwd(), "ios/App/App/AvBodyTrackingPlugin.swift"), "utf8");

describe("live analysis and file analysis are one implementation", () => {
  it("runs the body-pose request from exactly one place", () => {
    // The other VNImageRequestHandler constructions in this file belong to the object
    // detector and the camera stabilizer -- separate sensors with their own per-frame work,
    // deliberately. What must never be duplicated is the BODY pose request, because that is
    // the measurement every number downstream is built on.
    const performs = source.match(/perform\(\[ctx\.poseRequest\]\)/g) ?? [];
    expect(performs).toHaveLength(1);
  });

  it("is fed by both the reader loop and the live delegate", () => {
    const calls = source.match(/processFrame\(\s*sampleBuffer:/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // The live delegate has to be one of them.
    const delegate = source.slice(source.indexOf("didOutput sampleBuffer: CMSampleBuffer"));
    expect(delegate.slice(0, 600)).toMatch(/processFrame\(/);
  });

  it("derives both strides from one helper", () => {
    // A stride is a target RATE, not a frame count, and two feeders sampling different frames
    // are two different measurements. The native side also refuses a live trace whose stride
    // does not match what analysis later asked for -- but only because both come from here.
    const uses = source.match(/effectiveSampleStride\(baseline:/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
    // and nobody recomputes it inline any more
    expect(source).not.toMatch(/activeCaptureFrameRate\s*\/\s*60\.0\s*\)?\s*\n\s*let sampleEveryNthFrame/);
  });

  it("decodes the FILE path to the shared budget, and never demands it of the camera", () => {
    expect(source).toMatch(/static let analysisDecodeMaxDimension/);
    // The file path decodes-and-scales through AVAssetReader, which takes the size keys and
    // returns an error if it cannot honour them.
    const uses = source.match(/Self\.analysisDecodeMaxDimension/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);

    // THE LIVE PATH MUST NEVER ASK THE CAPTURE OUTPUT TO SCALE.
    //
    // AVCaptureVideoDataOutput accepts kCVPixelBufferWidthKey/HeightKey only for sizes the
    // source can deliver and RAISES an Objective-C exception otherwise -- uncatchable from
    // Swift, so the app force-closes the instant the camera opens. That is what build 510 did:
    // "it's crashing when I click on record, I can't film a set." The two APIs look alike and
    // behave completely differently, which is exactly how this gets rewritten by accident.
    const liveSettings = source.slice(
      source.indexOf("private func applyLiveAnalysisBufferSize"),
      source.indexOf("private func applyLiveAnalysisBufferSize") + 2000,
    );
    expect(liveSettings).not.toMatch(/settings\[kCVPixelBufferWidthKey/);
    expect(liveSettings).not.toMatch(/settings\[kCVPixelBufferHeightKey/);
  });

  // One more force-close has to produce the name of the line that did it. An AVFoundation
  // exception kills the process and takes logDiag's in-memory buffer with it, so the step is
  // written to UserDefaults before it runs and reported on the next launch.
  it("leaves a breadcrumb through live setup so a crash names itself", () => {
    expect(source).toContain("private func liveSetupBreadcrumb");
    expect(source).toContain("reportPreviousLiveSetupCrash()");
    expect(source).toContain('liveSetupBreadcrumb("session.addOutput(videoDataOutput)")');
    expect(source).toContain("PREVIOUS LAUNCH DIED DURING LIVE SETUP AT:");
  });

  it("never lets the live output back the capture session up behind Vision", () => {
    // The recording is the thing that must not break. A dropped analysis frame costs one
    // sample out of an already-strided trace; a stalled session costs the take.
    expect(source).toMatch(/alwaysDiscardsLateVideoFrames\s*=\s*true/);
    expect(source).toMatch(/didDrop sampleBuffer/);
  });

  it("refuses a live trace it cannot show to be complete", () => {
    const fn = source.slice(source.indexOf("private func liveAnalysisResult"));
    const body = fn.slice(0, fn.indexOf("\n    }\n"));
    // coverage and drop-rate gates, both returning nil (= fall back and re-read the file)
    expect(body).toMatch(/coverage >= 0\.9/);
    expect(body).toMatch(/dropRate <= 0\.05/);
    expect(body).toMatch(/return nil/);
  });

  it("says which path produced every take", () => {
    // A calibration run against a trace is worthless if nobody can attribute it.
    expect(source).toMatch(/"analysisPath": "live"/);
    expect(source).toMatch(/"analysisPath": "file"/);
  });

  it("only builds a live trace for a caller that declared what it is filming", () => {
    // Silence means no: a context with no tracking mode has no object detector and no
    // real-world scale, which is a WORSE measurement than the file path would have produced.
    // Degrading a measurement silently is worth more than the wait it saves.
    const fn = source.slice(source.indexOf("@objc func startRecording"));
    expect(fn.slice(0, 4000)).toMatch(/call\.getBool\("liveAnalysis"\) \?\? false/);
  });
});

// THE SAVE STARTS WHILE THE ATHLETE IS STILL LIFTING.
//
// Every capture in the 2026-09-28 export ran the file path, nothing said why, and the coach's
// 720p copy was a full second pass over the movie after every take. Scott: "why isn't it
// processing and then saving? ... you've already said it's possible to start processing and
// saving as the video is still recording." Three things make that true, and each is pinned
// here because each is one deletion away from silently reverting.
describe("processing and saving happen during the recording", () => {
  const hook = readFileSync(join(process.cwd(), "client/src/lib/use-av-body-tracking.ts"), "utf8");
  const preview = readFileSync(join(process.cwd(), "client/src/lib/native-av-preview.ts"), "utf8");

  it("encodes the upload copy from the live frames, before Vision sees them", () => {
    const delegate = source.slice(source.indexOf("didOutput sampleBuffer: CMSampleBuffer"));
    const body = delegate.slice(0, delegate.indexOf("processFrame("));
    // The append comes BEFORE the live-run guard: a coach's video is wanted on every take, a
    // live trace only on some, and a frame Vision drops as late is still a frame the video needs.
    expect(body).toMatch(/uploadCopyWriter\?\.append\(sampleBuffer\)[\s\S]*guard let run = liveRun/);
    expect(source).toMatch(/private final class AvUploadCopyWriter/);
    expect(source).toMatch(/expectsMediaDataInRealTime = true/);
  });

  it("hands the upload copy back with the movie path, and the client skips the re-encode", () => {
    expect(source).toMatch(/result\["uploadPath"\] = copy\.url\.path/);
    // The old export is the fallback, never the first choice.
    const fn = preview.slice(preview.indexOf("export async function readAvRecordingForUpload"));
    const before = fn.slice(0, fn.indexOf("compressForUpload"));
    expect(before).toMatch(/if \(uploadPath\)/);
    expect(before).toMatch(/return blob;/);
    // RULE #1: a copy that cannot be read falls through to the export, never throws out of
    // the save. The try wraps the read, and the export follows it in the same function.
    expect(before).toMatch(/try \{[\s\S]*response\.blob\(\)[\s\S]*\} catch \{/);
  });

  it("listens for live frames from Record, not from Stop, and tells the two feeders apart", () => {
    // The hook used to subscribe only in stopRecordingAndAnalyze, so every live frame was
    // emitted into nothing and even an accepted live trace would have produced no data.
    const start = hook.slice(hook.indexOf("function startRecording("));
    expect(start.slice(0, start.indexOf("startAvRecording("))).toMatch(/onAvPoseFrame\(/);
    expect(source).toMatch(/tagged\["source"\] = "live"/);
    expect(source).toMatch(/tagged\["source"\] = "file"/);
    expect(hook).toMatch(/recordingStats\.analysisPath === "live" \? liveFrames/);
  });

  it("says why a take fell back to the file read, every time", () => {
    const fn = source.slice(source.indexOf("private func liveAnalysisResult"));
    const body = fn.slice(0, fn.indexOf("let state = run.state"));
    // Every nil return is preceded by a reason. Count them: the gates and the reasons match.
    const nils = (body.match(/return nil/g) ?? []).length;
    const reasons = (body.match(/lastLiveFallbackReason = /g) ?? []).length;
    expect(reasons).toBe(nils);
    expect(source).toMatch(/"liveAttempted": liveAttempted/);
    expect(source).toMatch(/result\["liveFallbackReason"\] = reason/);
  });
});
