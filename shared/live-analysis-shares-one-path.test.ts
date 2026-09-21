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

  it("decodes both paths to one budget", () => {
    expect(source).toMatch(/static let analysisDecodeMaxDimension/);
    const uses = source.match(/Self\.analysisDecodeMaxDimension/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
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
