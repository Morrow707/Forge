import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { measureSamplingSeconds, measureTraceSampling } from "./trace-sampling";

// A REP MEASURED ON FIVE SAMPLES READS LIKE A REP MEASURED ON TWENTY, IN EVERY OTHER FIELD.
//
// Replaying the 2026-10-07 Pendlay row off its own stored trace, rep 8 spans 0.550 seconds and
// holds FIVE points -- an effective 9Hz inside one rep, on a take whose median cadence is 29.4Hz.
// Its mean, its peak and its window were all computed over those five points and nothing in any
// export said so. Scott, the same day: "if you're leaving things open and not guessing, add the
// diagnostic to the export so we can hammer it down, make sure every skill and exercise video
// capture export gives the same diagnostic as well."
//
// "Every" is the part this file holds. It is a scan and never a list, for the same reason
// refused-capture-survives.test.ts is: that file began as a hand-written list of the eight
// dialogs known to have a bug and, rerun as a scan, immediately found six more.
const DIALOGS = join(process.cwd(), "client/src/components");

function dialogFiles(): string[] {
  return readdirSync(DIALOGS).filter((f) => f.endsWith("tracker-dialog.tsx"));
}

describe("the sampling measure", () => {
  it("reports the cadence as a median, so one dropout cannot define it", () => {
    // Thirty samples at 33ms with a single 1.9-second hole in the middle -- the shape of the
    // 2026-10-07 shoulder press.
    const times: number[] = [];
    for (let i = 0; i < 15; i++) times.push(i * 0.033);
    times.push(times[times.length - 1] + 1.9);
    for (let i = 1; i < 15; i++) times.push(times[times.length - 1] + 0.033);
    const s = measureSamplingSeconds(times)!;
    expect(s.medianIntervalSeconds).toBeCloseTo(0.033, 3);
    expect(s.effectiveHz).toBeGreaterThan(29);
    expect(s.largestGapSeconds).toBeCloseTo(1.9, 2);
    expect(s.dropouts).toBe(1);
    // The EXCESS over the cadence, not the whole gap: the sampler was always going to take one
    // interval to reach the next point.
    expect(s.secondsInDropouts).toBeCloseTo(1.867, 2);
    // Span is 2.824s, of which 1.867 is the hole: a third of the take held its cadence.
    expect(s.cadenceHeld).toBeCloseTo(0.339, 2);
  });

  it("says a clean take held its cadence", () => {
    const times = Array.from({ length: 40 }, (_, i) => i * 0.0333);
    const s = measureSamplingSeconds(times)!;
    expect(s.dropouts).toBe(0);
    expect(s.cadenceHeld).toBe(1);
  });

  it("returns null rather than guessing on a trace too short to have a cadence", () => {
    expect(measureSamplingSeconds([])).toBeNull();
    expect(measureSamplingSeconds([0, 0.033])).toBeNull();
    expect(measureTraceSampling(null)).toBeNull();
  });

  it("survives a non-monotonic timestamp without poisoning the median", () => {
    const times = [0, 0.033, 0.066, 0.033, 0.099, 0.132, 0.165];
    const s = measureSamplingSeconds(times)!;
    expect(s.medianIntervalSeconds).toBeGreaterThan(0);
    expect(Number.isFinite(s.effectiveHz)).toBe(true);
  });

  it("takes seconds, and the two trace shapes convert at the boundary", () => {
    // A stored bar-path point carries `t` in MILLISECONDS; a native pose frame carries
    // `timestamp` in SECONDS. A function that sniffed which it had would be wrong on a
    // one-second take, so the units are converted by the caller and this pins that.
    const fromMillis = measureTraceSampling([{ t: 0 }, { t: 33 }, { t: 66 }, { t: 99 }])!;
    expect(fromMillis.medianIntervalSeconds).toBeCloseTo(0.033, 3);
  });
});

describe("every capture mode reports it", () => {
  it("the shared builder computes it, so every dialog that uses the builder gets it", () => {
    const src = readFileSync(join(process.cwd(), "client/src/lib/tracking-diagnostics.ts"), "utf8");
    expect(src).toMatch(/sampling: measureFrameSampling\(args\.rawFrames\)/);
  });

  it("no tracker dialog writes diagnostics without sampling in them", () => {
    const offenders: string[] = [];
    for (const file of dialogFiles()) {
      const src = readFileSync(join(DIALOGS, file), "utf8");
      const writesDiagnostics = /trackingDiagnostics:/.test(src);
      const usesBuilder = /buildTrackingDiagnostics/.test(src);
      if (!writesDiagnostics && !usesBuilder) continue;
      // Either it routes through the builder (which computes sampling for it), or it names the
      // measure itself, or it uses samplingOnlyDiagnostics -- the blob for a mode that has a trace
      // and none of the native machinery. Anything else is a capture whose export cannot answer how well it was
      // sampled, which is the hole this file exists to keep closed.
      if (!usesBuilder && !/measure(Trace|Frame)Sampling|samplingRef|samplingOnlyDiagnostics/.test(src)) offenders.push(file);
    }
    expect(offenders, `these write diagnostics with no sampling: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the four skill dialogs send diagnostics at all -- they sent none until 2026-10-07", () => {
    // skill_session_logs had no trackingDiagnostics column, so every sprint and mechanics take
    // ever filmed left no account of itself. Named rather than scanned because the point is that
    // these four specifically were silent, and a scan would go quiet again if one were deleted.
    for (const file of [
      "av-sprint-tracker-dialog.tsx",
      "av-mechanics-tracker-dialog.tsx",
      "sprint-tracker-dialog.tsx",
      "mechanics-tracker-dialog.tsx",
    ]) {
      const src = readFileSync(join(DIALOGS, file), "utf8");
      expect(src, `${file} stopped sending diagnostics`).toMatch(/trackingDiagnostics: \{ outcome: "tracked", sampling:/);
    }
  });

  it("is declared in the zod schema, which strips what it does not declare", () => {
    const schema = readFileSync(join(process.cwd(), "shared/schema.ts"), "utf8");
    expect(schema).toMatch(/sampling: z\s*\n?\s*\.object\(\{/);
    for (const field of [
      "samples", "spanSeconds", "medianIntervalSeconds", "effectiveHz",
      "largestGapSeconds", "dropouts", "secondsInDropouts", "cadenceHeld",
    ]) {
      expect(schema, `sampling.${field} is not declared`).toContain(`${field}: z.number()`);
    }
    // And the skill log has somewhere to put the whole blob.
    expect(schema).toContain('trackingDiagnostics: json("tracking_diagnostics")');
  });

  it("gates nothing: a take with a terrible cadence still produces its measure", () => {
    const awful = measureSamplingSeconds([0, 2, 4.1, 6.3, 11])!;
    expect(awful).toBeTruthy();
    expect(awful.samples).toBe(5);
    expect(awful.cadenceHeld).toBeGreaterThanOrEqual(0);
  });
});
