import { describe, it, expect } from "vitest";
import { summarizeCaptureRepeatability, type RepeatabilityInput } from "./capture-repeatability";

/* THE SAME LIFT, FILMED TWICE, SHOULD NOT DISAGREE WITH ITSELF BY 68%.
 *
 * Every number in the fixtures below is real, off the 2026-10-09 admin capture export. They are
 * here rather than invented because the point of this measure is that the scatter is large, and
 * a made-up fixture would let somebody "fix" the measure until it reported a comfortable number.
 *
 * See shared/capture-repeatability.ts for what this is for: three sessions of calibration had
 * measured a BIAS on one take each and none had measured the SPREAD across takes, which turns
 * out to be the same size -- which is why fitting a correction constant has never converged.
 */

/** The real Pendlay Row at 135lb, three takes across two days. 42.6 and 46.9 were 2026-10-06;
 *  71.6 was 2026-10-09, the one paired with the OVR (truth 58.2 cm). */
const ROW_135: RepeatabilityInput[] = [
  { athlete: "Athlete 1", exerciseName: "Pendlay Row", loadRaw: 135, loadUnit: "lbs", romCm: 42.6, scaleFactor: 0.004097, date: "2026-10-06" },
  { athlete: "Athlete 1", exerciseName: "Pendlay Row", loadRaw: 135, loadUnit: "lbs", romCm: 46.9, scaleFactor: 0.003847, date: "2026-10-06" },
  { athlete: "Athlete 1", exerciseName: "Pendlay Row", loadRaw: 135, loadUnit: "lbs", romCm: 71.6, scaleFactor: 0.004970, date: "2026-10-09" },
];

/** Bench sets 1 and 2 of 2026-10-07, which were BOTH build 637 -- the pre-refit control pair.
 *  Set 3 that day was the first take on 639, so the three-set group spans two builds and does
 *  NOT settle anything about code drift; these two do, and they are 1.26x apart with no code
 *  change between them. (An earlier draft of this fixture used all three and claimed one build.
 *  It was wrong, and `sameDay` is named for what it actually checks.) */
const BENCH_ONE_BUILD: RepeatabilityInput[] = [
  { athlete: "Athlete 1", exerciseName: "Bench Press", loadRaw: 135, loadUnit: "lbs", romCm: 25.7, scaleFactor: 0.002957, date: "2026-10-07" },
  { athlete: "Athlete 1", exerciseName: "Bench Press", loadRaw: 135, loadUnit: "lbs", romCm: 32.5, scaleFactor: 0.003432, date: "2026-10-07" },
];

describe("take-to-take repeatability", () => {
  it("reports the row's 1.68x spread rather than averaging it away", () => {
    const { groups } = summarizeCaptureRepeatability(ROW_135);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.takes).toBe(3);
    expect(g.romCm).toEqual([42.6, 46.9, 71.6]);
    expect(g.romHiLoRatio).toBeCloseTo(1.68, 2);
    // A mean would say 53.7 cm and sound like an answer. The spread is the finding.
    expect(g.romSpreadPct).toBeGreaterThan(20);
  });

  it("marks a group filmed entirely on one day, which narrows what can be blamed", () => {
    expect(summarizeCaptureRepeatability(BENCH_ONE_BUILD).groups[0].sameDay).toBe(true);
    expect(summarizeCaptureRepeatability(ROW_135).groups[0].sameDay).toBe(false);
    // sameDay is a DATE check and claims only that. One day can still span two builds -- 10-07
    // did -- so it narrows the question rather than closing it; the pair above closes it because
    // both sets were 637. They disagree by a quarter with no code change between them.
    expect(summarizeCaptureRepeatability(BENCH_ONE_BUILD).groups[0].romHiLoRatio).toBeCloseTo(1.26, 2);
  });

  it("separates loads, because a different load is a different movement", () => {
    const mixed: RepeatabilityInput[] = [
      ...ROW_135,
      { athlete: "Athlete 1", exerciseName: "Pendlay Row", loadRaw: 95, loadUnit: "lbs", romCm: 32.6, date: "2026-10-07" },
      { athlete: "Athlete 1", exerciseName: "Pendlay Row", loadRaw: 95, loadUnit: "lbs", romCm: 43.1, date: "2026-10-07" },
    ];
    const { groups } = summarizeCaptureRepeatability(mixed);
    expect(groups.map((g) => g.load).sort()).toEqual(["135lbs", "95lbs"]);
    // Pooling the two would have manufactured spread that is not a measurement problem: a row
    // at 95lb genuinely travels a different distance from one at 135lb.
    expect(groups.find((g) => g.load === "135lbs")!.takes).toBe(3);
  });

  it("separates athletes, so one person's spread is never another's", () => {
    const two: RepeatabilityInput[] = [
      ...ROW_135,
      { athlete: "Athlete 2", exerciseName: "Pendlay Row", loadRaw: 135, loadUnit: "lbs", romCm: 50.0, date: "2026-10-09" },
    ];
    const { groups } = summarizeCaptureRepeatability(two);
    // Athlete 2 has one take, which has no spread, so it is dropped rather than reported as 0%.
    expect(groups).toHaveLength(1);
    expect(groups[0].athlete).toBe("Athlete 1");
  });

  it("drops a lone take instead of calling it perfectly repeatable", () => {
    const one = summarizeCaptureRepeatability([ROW_135[0]]);
    expect(one.groups).toEqual([]);
    // Null, never 0 -- a zero here would read as "this lift is dead steady" on the strength of
    // one set, which is the opposite of what the file knows.
    expect(one.worstRomHiLoRatio).toBeNull();
    expect(one.medianRomSpreadPct).toBeNull();
  });

  it("ignores a capture with no range of motion rather than counting it as zero", () => {
    const withRefused: RepeatabilityInput[] = [
      ...ROW_135,
      { athlete: "Athlete 1", exerciseName: "Pendlay Row", loadRaw: 135, loadUnit: "lbs", romCm: null, date: "2026-10-09" },
    ];
    // Rule #1 means a refused take still has a row in the export. It has no range of motion to
    // be repeatable about, and letting a null through as 0 would report a 1.0 lo and an
    // infinite ratio -- the measure would break on exactly the takes that matter most.
    expect(summarizeCaptureRepeatability(withRefused).groups[0].takes).toBe(3);
  });

  it("sorts the worst group first, because that is the one to look at", () => {
    const { groups, worstRomHiLoRatio } = summarizeCaptureRepeatability([...BENCH_ONE_BUILD, ...ROW_135]);
    expect(groups[0].exerciseName).toBe("Pendlay Row");
    expect(worstRomHiLoRatio).toBeCloseTo(1.68, 2);
  });

  it("reports the scale spread beside the range-of-motion spread", () => {
    // Two different failures look identical in range of motion alone: the athlete moved the bar
    // a different distance, or a pixel was worth a different number of metres. Only the second
    // is this pipeline's fault, and the scale column is what tells them apart.
    const g = summarizeCaptureRepeatability(ROW_135).groups[0];
    expect(g.scaleFactors).toHaveLength(3);
    expect(g.scaleHiLoRatio).toBeCloseTo(1.29, 2);
  });

  it("survives an empty export without inventing a number", () => {
    expect(summarizeCaptureRepeatability([])).toEqual({
      groups: [],
      worstRomHiLoRatio: null,
      medianRomSpreadPct: null,
    });
  });
});
