import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { summarizeJumpSet } from "./jump-tracking";
import type { TrackedPoint } from "./bar-tracking";

/* 2026-11-16, Box Jump set 1 beside the OVR (build 764). Five jumps onto a 24in box came back as
 * two: each landing settled 64-69cm above the takeoff floor against a typed 61cm, so the landing
 * gate read it as "floating above the box", left the athlete airborne until the step-down, and
 * the flight was then too long to be a jump. Replayed with the gate off, the same trace gives five
 * landings averaging 66.8cm against the sensor's 67.3. A landing ON the box reads above the box on
 * every take (it is nearer the lens than the floor the box top was drawn from), so the gate's
 * slack is a share of the box height, and what it still refuses is the dismount's own apex.
 *
 * Two halves on purpose: the synthetic drives the decision (a scan can only see the words a
 * decision is written with), and the source case forbids the old fixed-slack comparison. */
const FPS = 30, DT = 1000 / FPS, G = 9.81;
function arc(h0: number, h1: number, peakRise: number): number[] {
  const v0 = Math.sqrt(2 * G * peakRise);
  const T = (v0 + Math.sqrt(v0 * v0 + 2 * G * (h0 - h1))) / G;
  const out: number[] = [];
  for (let i = 0; i <= Math.round(T * FPS); i++) out.push(h0 + v0 * (i / FPS) - 0.5 * G * (i / FPS) ** 2);
  out[out.length - 1] = h1;
  return out;
}
/** Five jumps onto a box whose landing READS `landingReadsM` above the floor, a 1.2s stand on
 *  it, a controlled step down and a stand on the floor. */
function boxSet(landingReadsM: number): TrackedPoint[] {
  const out: TrackedPoint[] = [];
  let t = 0;
  const push = (h: number) => { out.push({ t, x: 0, y: -h, z: 0, confidence: 1 }); t += DT; };
  for (let i = 0; i < 45; i++) push(0);
  for (let r = 0; r < 5; r++) {
    for (const h of arc(0, landingReadsM, landingReadsM + 0.12)) push(h);
    for (let i = 0; i < 36; i++) push(landingReadsM);
    for (let i = 1; i <= 20; i++) push(landingReadsM * (1 - i / 20));
    for (let i = 0; i < 45; i++) push(0);
  }
  return out;
}
const BOX_M = 0.61;
const run = (landingReadsM: number) =>
  summarizeJumpSet(boxSet(landingReadsM), 75, 35, -BOX_M, 1 / FPS, [], { usesBox: true, boxHeightCm: 61 });

describe("a landing on the box is a landing", () => {
  it("counts all five when the landing reads exactly the box", () => {
    expect(run(BOX_M)!.repBreakdown.length).toBe(5);
  });

  it("counts all five when the landing reads 10% above the typed box, as it did on 2026-11-16", () => {
    const m = run(BOX_M * 1.1)!;
    expect(m.repBreakdown.length).toBe(5);
    for (const r of m.repBreakdown) expect(r.flightSeconds).toBeLessThan(0.8);
  });

  // Scott, 2026-11-16, looking at two chips under a five-jump set: "why didn't box jump give my
  // m/s every rep? Used to ... Lock that in place." The row draws one chip per counted jump, so
  // the m/s went missing with the jumps. Every counted jump carries its own takeoff speed, and
  // the workout screen prints it on that jump's chip.
  it("every one of the five jumps carries its own m/s, and the screen prints it per jump", () => {
    for (const landing of [BOX_M, BOX_M * 1.1, BOX_M * 1.4]) {
      const m = run(landing)!;
      expect(m.repBreakdown.length).toBe(5);
      for (const r of m.repBreakdown) {
        expect(r.takeoffVelocityMps).not.toBeNull();
        expect(r.takeoffVelocityMps!).toBeGreaterThan(2);
        expect(r.takeoffVelocityMps!).toBeLessThan(5);
      }
    }
    const screen = readFileSync(join(__dirname, "../pages/workout.tsx"), "utf8");
    expect(screen).toContain("j.takeoffVelocityMps != null ? ` · ${j.takeoffVelocityMps} m/s takeoff` : \"\"");
  });

  it("counts all five at the 1.40x the box ruler has measured on a paired take", () => {
    expect(run(BOX_M * 1.4)!.repBreakdown.length).toBe(5);
  });

  it("the gate's slack is a share of the box height, never the fixed few centimetres alone", () => {
    const src = readFileSync(join(__dirname, "jump-tracking.ts"), "utf8")
      .replace(/^\s*\/\*[\s\S]*?\*\/\s*$/gm, "")
      .split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "")).join("\n");
    expect(src).not.toMatch(/boxTopWorldY\s*-\s*LANDING_ABOVE_BOX_TOLERANCE_M/);
    expect(src).toMatch(/boxTopWorldY\s*-\s*landingAboveBoxToleranceM/);
    expect(src).toMatch(/LANDING_ABOVE_BOX_FRACTION_OF_BOX\s*=\s*0\.5/);
  });
});
