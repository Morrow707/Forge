/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures are literal measurements */
import { describe, expect, it } from "vitest";
import {
  exerciseNamesAgree,
  pairCameraSetsWithDeviceReadings,
  pairOne,
  type CameraSetForPairing,
  type DeviceReadingForPairing,
} from "./device-camera-pairing";

const T0 = new Date("2026-11-20T15:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

const set = (over: Partial<CameraSetForPairing> = {}): CameraSetForPairing => ({
  setId: 1,
  athleteId: 7,
  exerciseName: "Back Squat",
  performedAt: T0,
  timeBasis: "clock",
  meanVelocityMps: 0.84,
  peakVelocityMps: 1.26,
  romCm: 72,
  reps: [
    { meanVelocityMps: 0.79, peakVelocityMps: 1.2, romCm: 70 },
    { meanVelocityMps: 0.92, peakVelocityMps: 1.4, romCm: 73 },
  ],
  ...over,
});

const reading = (over: Partial<DeviceReadingForPairing> = {}): DeviceReadingForPairing => ({
  readingId: 100,
  athleteId: 7,
  deviceName: "GymAware",
  exerciseName: "Squat - Back",
  recordedAt: minutes(2),
  meanVelocityMps: 0.82,
  peakVelocityMps: 1.24,
  romCm: null,
  reps: [
    { meanVelocityMps: 0.79, peakVelocityMps: 1.24, romCm: 68.6 },
    { meanVelocityMps: 0.9, peakVelocityMps: 1.4, romCm: 73.2 },
  ],
  ...over,
});

describe("pairing a camera set with a device reading", () => {
  it("states per-set and per-rep differences as camera over sensor", () => {
    const p = pairOne(set(), reading());
    expect(p.set.meanVelocity.errorPct).toBeCloseTo((0.84 / 0.82 - 1) * 100, 6);
    expect(p.set.rom.errorPct).toBeNull();
    expect(p.reps).toHaveLength(2);
    expect(p.reps[1].meanVelocity.errorPct).toBeCloseTo((0.92 / 0.9 - 1) * 100, 6);
    expect(p.reps[0].rom.errorPct).toBeCloseTo((70 / 68.6 - 1) * 100, 6);
    expect(p.secondsApart).toBe(120);
  });

  it("skips the sensor's set-up reps when told to", () => {
    const p = pairOne(set(), reading({ reps: [{ meanVelocityMps: 0.3, peakVelocityMps: 0.5, romCm: 20 }, ...reading().reps] }), { deviceRepOffset: 1 });
    expect(p.reps.map((r) => [r.cameraRep, r.sensorRep])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(p.reps[0].meanVelocity.sensor).toBe(0.79);
  });

  it("pairs within the window only, never across athletes", () => {
    expect(pairCameraSetsWithDeviceReadings([set()], [reading({ recordedAt: minutes(45) })])).toHaveLength(0);
    expect(pairCameraSetsWithDeviceReadings([set()], [reading({ athleteId: 8 })])).toHaveLength(0);
    expect(pairCameraSetsWithDeviceReadings([set()], [reading({ recordedAt: minutes(45) })], { windowMinutes: 60 })).toHaveLength(1);
  });

  it("each set gets one reading and each reading one set; an agreeing name beats a nearer one", () => {
    const sets = [set({ setId: 1, performedAt: T0 }), set({ setId: 2, performedAt: minutes(4) })];
    const readings = [
      reading({ readingId: 100, recordedAt: minutes(0.5), exerciseName: "Bench Press" }),
      reading({ readingId: 101, recordedAt: minutes(1), exerciseName: "Back Squat" }),
      reading({ readingId: 102, recordedAt: minutes(4), exerciseName: "Back Squat" }),
    ];
    const pairs = pairCameraSetsWithDeviceReadings(sets, readings);
    const byset = Object.fromEntries(pairs.map((p) => [p.setId, p.readingId]));
    expect(byset).toEqual({ 1: 101, 2: 102 });
  });

  it("a date-only camera set pairs with that day's reading and says so", () => {
    const p = pairCameraSetsWithDeviceReadings([set({ timeBasis: "date_only", performedAt: new Date("2026-11-20T12:00:00Z") })], [reading()]);
    expect(p).toHaveLength(1);
    expect(p[0].timeBasis).toBe("date_only");
    expect(p[0].secondsApart).toBeNull();
  });

  it("exercise names agree across a device's wording", () => {
    expect(exerciseNamesAgree("Back Squat", "back-squat")).toBe(true);
    expect(exerciseNamesAgree("Bench Press", "Bench")).toBe(true);
    expect(exerciseNamesAgree("Back Squat", "Front Squat")).toBe(false);
    expect(exerciseNamesAgree(null, "Back Squat")).toBe(false);
  });

  it("changes no camera number: the inputs come back untouched", () => {
    const s = set();
    const before = JSON.stringify(s);
    pairCameraSetsWithDeviceReadings([s], [reading()]);
    expect(JSON.stringify(s)).toBe(before);
  });
});
