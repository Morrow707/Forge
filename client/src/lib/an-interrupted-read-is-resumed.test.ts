import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/* 2026-11-16, Back Squat beside the OVR (build 764): the video was stopped and the app left at
 * once for the sensor's screen. iOS took the decoder away, the file reader failed with "Operation
 * Interrupted" 15.6s into a 33s clip, and the 512 frames it had read were reported as the whole
 * take: two reps of five. The read is resumed now (AvBodyTrackingPlugin.swift, runPoseAnalysis).
 * There is no Swift test target, so this reads the source with comments stripped, the way
 * tracker-arbiter.test.ts does, and holds the two diagnostics to the schema (zod strips what it
 * does not declare, silently). */
const swift = readFileSync(join(__dirname, "../../../ios/App/App/AvBodyTrackingPlugin.swift"), "utf8")
  .split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "")).join("\n");
const at = swift.indexOf("private func runPoseAnalysis(");
const body = swift.slice(at, swift.indexOf("\n    private func ", at + 10));

describe("a file read the phone interrupted is resumed, never reported as the take", () => {
  it("finds the analysis function", () => {
    expect(at).toBeGreaterThan(-1);
    expect(body.length).toBeGreaterThan(2000);
  });

  it("a failed reader with the clip unfinished opens a new reader at the last frame read", () => {
    expect(body).toMatch(/guard reader\.status == \.failed, unfinished, !analysisCancelled, readerResumes < maxReaderResumes else \{ break readLoop \}/);
    expect(body).toMatch(/resumed\.timeRange = CMTimeRange\(start: lastReadTime, duration: \.positiveInfinity\)/);
    expect(body).toMatch(/reader = resumed/);
    expect(body).toMatch(/readerResumes \+= 1/);
  });

  it("waits for the app to be on screen before it reads again", () => {
    expect(body).toMatch(/UIApplication\.shared\.applicationState == \.active/);
  });

  it("never processes a frame twice after a resume", () => {
    expect(body).toMatch(/CMTimeCompare\(pts, lastReadTime\) <= 0 \{ continue \}/);
  });

  it("is bounded", () => {
    expect(body).toMatch(/let maxReaderResumes = \d+/);
  });

  it("reports the resumes, and the schema keeps them", () => {
    expect(body).toMatch(/result\["readerResumes"\] = readerResumes/);
    expect(body).toMatch(/result\["readerSecondsWaitingForForeground"\] = secondsWaitingForForeground/);
    const schema = readFileSync(join(__dirname, "../../../shared/schema.ts"), "utf8");
    expect(schema).toMatch(/^\s*readerResumes: z\.number\(\)\.optional\(\),/m);
    expect(schema).toMatch(/^\s*readerSecondsWaitingForForeground: z\.number\(\)\.optional\(\),/m);
  });
});
