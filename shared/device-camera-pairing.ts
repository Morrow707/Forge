/** A CAMERA SET BESIDE A VELOCITY DEVICE'S READING OF THE SAME SET (2026-11-21).
 *
 * Every calibration round since 2026-09-29 started from a screenshot of the OVR's screen typed by
 * hand into `client/src/lib/tracker-ground-truth.ts`. A connected device (GymAware) or an uploaded
 * device export puts the sensor's own numbers in `device_readings`; this pairs each camera set
 * with the reading that measured the same set and states the differences in the shape the ground
 * truth and the ledger already use: per rep and per set, mean and peak velocity and range of
 * motion, camera over sensor as a per-cent error.
 *
 * IT RECORDS AND CHANGES NOTHING. No camera number, constant or `FITTED_OVERRIDES` entry reads
 * this (Rule #1, Rule #6's machinery only). A pairing is evidence for a person to read.
 *
 * Pure: the server's admin export calls it with rows it read, a test calls it with literals. */

export type PairingRep = { meanVelocityMps: number | null; peakVelocityMps: number | null; romCm: number | null };

export type CameraSetForPairing = {
  setId: number;
  athleteId: number;
  exerciseName: string | null;
  /** When the set was filmed, as precisely as the row knows it. */
  performedAt: Date;
  /** "clock" when performedAt is a real capture time; "date_only" when only the day is known,
   *  in which case any reading that day may pair and the result says so. */
  timeBasis: "clock" | "date_only";
  meanVelocityMps: number | null;
  peakVelocityMps: number | null;
  romCm: number | null;
  reps: PairingRep[];
};

export type DeviceReadingForPairing = {
  readingId: number;
  athleteId: number;
  deviceName: string;
  exerciseName: string | null;
  recordedAt: Date;
  meanVelocityMps: number | null;
  peakVelocityMps: number | null;
  romCm: number | null;
  reps: PairingRep[];
};

export type Difference = { camera: number | null; sensor: number | null; errorPct: number | null };

export type RepDifference = {
  /** 1-based, the camera's rep number. */
  cameraRep: number;
  /** 1-based, the sensor's rep number (offset by `deviceRepOffset`). */
  sensorRep: number;
  meanVelocity: Difference;
  peakVelocity: Difference;
  rom: Difference;
};

export type CameraDevicePair = {
  setId: number;
  readingId: number;
  deviceName: string;
  athleteId: number;
  cameraExercise: string | null;
  deviceExercise: string | null;
  exerciseNamesAgree: boolean;
  /** Seconds between the camera's time and the device's; null on a date-only camera set. */
  secondsApart: number | null;
  timeBasis: "clock" | "date_only";
  cameraRepCount: number;
  sensorRepCount: number;
  set: { meanVelocity: Difference; peakVelocity: Difference; rom: Difference };
  reps: RepDifference[];
};

export type PairingOptions = {
  /** How far apart in time a set and a reading may be and still be the same set. */
  windowMinutes?: number;
  /** Sensor reps to skip before rep 1 lines up with the camera's rep 1 -- the OVR counts a set-up
   *  rep on some lifts (the box jump's first jump, the press's clean). */
  deviceRepOffset?: number;
};

export const DEFAULT_PAIRING_WINDOW_MINUTES = 20;
const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1000;
const PERCENT = 100;
const ISO_DATE_LENGTH = 10;

export function difference(camera: number | null, sensor: number | null): Difference {
  const errorPct = camera != null && sensor != null && sensor !== 0 ? (camera / sensor - 1) * PERCENT : null;
  return { camera, sensor, errorPct };
}

/** Lower case, letters and digits only: "Back Squat" and "back-squat" agree, "Front Squat" does not. */
function exerciseKey(name: string | null): string {
  return Array.from((name ?? "").toLowerCase())
    .filter((c) => (c >= "a" && c <= "z") || (c >= "0" && c <= "9"))
    .join("");
}

export function exerciseNamesAgree(a: string | null, b: string | null): boolean {
  const ka = exerciseKey(a);
  const kb = exerciseKey(b);
  return ka !== "" && kb !== "" && (ka === kb || ka.includes(kb) || kb.includes(ka));
}

const sameUtcDay = (a: Date, b: Date) => a.toISOString().slice(0, ISO_DATE_LENGTH) === b.toISOString().slice(0, ISO_DATE_LENGTH);

function withinWindow(set: CameraSetForPairing, reading: DeviceReadingForPairing, windowMs: number): boolean {
  if (set.athleteId !== reading.athleteId) return false;
  if (set.timeBasis === "date_only") return sameUtcDay(set.performedAt, reading.recordedAt);
  return Math.abs(set.performedAt.getTime() - reading.recordedAt.getTime()) <= windowMs;
}

/** Pairs one set with one reading. Exported so a caller that has already chosen the pair (a test,
 *  a session note) gets the same differences. */
export function pairOne(set: CameraSetForPairing, reading: DeviceReadingForPairing, opts: PairingOptions = {}): CameraDevicePair {
  const offset = Math.max(0, opts.deviceRepOffset ?? 0);
  const sensorReps = reading.reps.slice(offset);
  const aligned = Math.min(set.reps.length, sensorReps.length);
  const reps = set.reps.slice(0, aligned).map(
    (c, i): RepDifference => ({
      cameraRep: i + 1,
      sensorRep: i + 1 + offset,
      meanVelocity: difference(c.meanVelocityMps, sensorReps[i].meanVelocityMps),
      peakVelocity: difference(c.peakVelocityMps, sensorReps[i].peakVelocityMps),
      rom: difference(c.romCm, sensorReps[i].romCm),
    }),
  );
  return {
    setId: set.setId,
    readingId: reading.readingId,
    deviceName: reading.deviceName,
    athleteId: set.athleteId,
    cameraExercise: set.exerciseName,
    deviceExercise: reading.exerciseName,
    exerciseNamesAgree: exerciseNamesAgree(set.exerciseName, reading.exerciseName),
    secondsApart:
      set.timeBasis === "clock" ? Math.round(Math.abs(set.performedAt.getTime() - reading.recordedAt.getTime()) / MS_PER_SECOND) : null,
    timeBasis: set.timeBasis,
    cameraRepCount: set.reps.length,
    sensorRepCount: reading.reps.length,
    set: {
      meanVelocity: difference(set.meanVelocityMps, reading.meanVelocityMps),
      peakVelocity: difference(set.peakVelocityMps, reading.peakVelocityMps),
      rom: difference(set.romCm, reading.romCm),
    },
    reps,
  };
}

type Candidate = { set: CameraSetForPairing; reading: DeviceReadingForPairing; agree: boolean; gapMs: number };

/** Pairs each camera set with at most one reading and each reading with at most one set. Within
 *  the window, a reading whose exercise name agrees beats one that does not, then the closer in
 *  time wins. A set with no reading in its window is simply not in the result -- nothing is
 *  invented for it. */
export function pairCameraSetsWithDeviceReadings(
  sets: readonly CameraSetForPairing[],
  readings: readonly DeviceReadingForPairing[],
  opts: PairingOptions = {},
): CameraDevicePair[] {
  const windowMs = (opts.windowMinutes ?? DEFAULT_PAIRING_WINDOW_MINUTES) * MS_PER_MINUTE;
  const candidates: Candidate[] = sets
    .flatMap((set) =>
      readings
        .filter((reading) => withinWindow(set, reading, windowMs))
        .map((reading) => ({
          set,
          reading,
          agree: exerciseNamesAgree(set.exerciseName, reading.exerciseName),
          gapMs: Math.abs(set.performedAt.getTime() - reading.recordedAt.getTime()),
        })),
    )
    .sort((a, b) => Number(b.agree) - Number(a.agree) || a.gapMs - b.gapMs || a.set.setId - b.set.setId);
  const chosen = candidates.reduce<{ pairs: Candidate[]; sets: Set<number>; readings: Set<number> }>(
    (acc, c) =>
      acc.sets.has(c.set.setId) || acc.readings.has(c.reading.readingId)
        ? acc
        : {
            pairs: [...acc.pairs, c],
            sets: new Set([...acc.sets, c.set.setId]),
            readings: new Set([...acc.readings, c.reading.readingId]),
          },
    { pairs: [], sets: new Set(), readings: new Set() },
  );
  return chosen.pairs
    .sort((a, b) => b.set.performedAt.getTime() - a.set.performedAt.getTime())
    .map((c) => pairOne(c.set, c.reading, opts));
}
