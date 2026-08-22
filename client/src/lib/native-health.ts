import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";

// Opt-in, per-device sync of recovery metrics (sleep, resting heart rate,
// heart rate variability) from Apple Health into the daily wellness
// check-in -- see the "Sync Apple Health" checkbox in
// NotificationSettingsDialog. Off by default, same "don't ask for something
// nobody opted into" posture as biometric-lock.ts. Read-only: Forge never
// writes anything back to Health.
//
// iOS only for now, same gating as ar-measure.ts/native-ar-preview.ts --
// the underlying plugin also supports Android Health Connect, but that
// needs its own AndroidManifest permissions and a privacy-policy handler
// this app doesn't have yet, so exposing the toggle there would offer
// something that silently does nothing.
const STORAGE_KEY = "forge-health-sync-enabled";
// Separate from STORAGE_KEY -- tracks whether we've ever put the OS
// permission sheet in front of the athlete, so WellnessGate can ask
// automatically the first time (no settings hunt required) without
// re-asking every single day someone said no. iOS gives apps no way to
// distinguish "denied" from "not yet decided" after the first ask anyway,
// so this is the only reliable signal for "already asked."
const PROMPTED_KEY = "forge-health-sync-prompted";
const READ_TYPES = [
  "sleep",
  "restingHeartRate",
  "heartRateVariability",
  "vo2Max",
  "respiratoryRate",
  "weight",
] as const;
// Read-only for the same reason as the rest of this file's own comment --
// workouts aren't part of the daily check-in snapshot (they don't have a
// "today's value" the way sleep/HR do), so they're fetched separately by
// fetchRecentWorkouts below, not folded into HealthSnapshot.
const WORKOUT_READ_TYPE = "workouts" as const;
// Segments that don't represent actual sleep time -- everything else
// (an explicit 'asleep'/'rem'/'deep'/'light', or no stage info at all,
// which is what a basic tracker reports) counts toward the total.
const NON_SLEEP_STATES = new Set(["inBed", "awake"]);

// The plugin's "weight" type comes back in kilograms unless a unit is
// requested explicitly (there's no "pound" HealthUnit to ask for instead),
// but wellnessCheckins.bodyMass and its validator (20-400) assume pounds,
// matching the rest of the app's imperial-by-default convention (see
// distance-unit.ts). Converted once here so every caller downstream just
// gets pounds, same as it would from the manual Body Metrics form.
const LBS_PER_KG = 2.20462;

export function isNativeHealthSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function isHealthSyncEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function hasPromptedHealthSync(): boolean {
  return localStorage.getItem(PROMPTED_KEY) === "1";
}

/** Prompts the native Health permission sheet. Throws with a user-facing
 * message if every type was denied, so the caller can toast it -- matches
 * subscribeToNativePush()'s shape. Partial grants (e.g. sleep allowed,
 * heart data denied) still turn sync on; fetchLatestHealthSnapshot() just
 * comes back with nulls for whatever wasn't authorized. */
export async function enableHealthSync(): Promise<void> {
  if (!isNativeHealthSupported()) {
    throw new Error("Health sync isn't supported on this device.");
  }
  const status = await Health.requestAuthorization({ read: [...READ_TYPES, WORKOUT_READ_TYPE], write: [] });
  localStorage.setItem(PROMPTED_KEY, "1");
  const authorized = status.readAuthorized ?? [];
  if (!READ_TYPES.some((t) => authorized.includes(t))) {
    throw new Error("Health access was denied. Enable it in iOS Settings to sync.");
  }
  localStorage.setItem(STORAGE_KEY, "1");
}

/** Same request as enableHealthSync(), but swallows the "denied" case
 * instead of throwing -- for the automatic first-ask in WellnessGate,
 * where a no-thanks should just leave the form blank, not surface an
 * error toast for something the athlete never explicitly clicked. */
export async function promptHealthSyncOnce(): Promise<void> {
  if (hasPromptedHealthSync() || !isNativeHealthSupported()) return;
  try {
    await enableHealthSync();
  } catch {
    // Denied -- hasPromptedHealthSync() is already true from inside
    // enableHealthSync(), so this won't ask again.
  }
}

export function disableHealthSync() {
  localStorage.removeItem(STORAGE_KEY);
}

export type HealthSnapshot = {
  sleepHours: number | null;
  restingHeartRate: number | null;
  hrv: number | null;
  vo2Max: number | null;
  respiratoryRate: number | null;
  bodyMass: number | null;
};

const EMPTY_SNAPSHOT: HealthSnapshot = {
  sleepHours: null,
  restingHeartRate: null,
  hrv: null,
  vo2Max: null,
  respiratoryRate: null,
  bodyMass: null,
};

/** Best-effort pull of last night's sleep plus the most recent resting
 * heart rate/HRV reading, to pre-fill the daily check-in -- an athlete can
 * always type over any of these by hand, so a partial or empty result here
 * never blocks submitting the form. */
export async function fetchLatestHealthSnapshot(): Promise<HealthSnapshot> {
  if (!isNativeHealthSupported() || !isHealthSyncEnabled()) return EMPTY_SNAPSHOT;

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  // vo2Max and bodyMass don't update daily the way sleep/heart data do --
  // VO2 max only refreshes off an occasional outdoor walk/run, and body
  // mass only changes when the athlete actually steps on a connected
  // scale. A 24h window would come back empty most days for both; a
  // month-wide lookback still surfaces "the most recent real reading"
  // instead of nothing.
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  try {
    const [sleep, restingHr, hrv, vo2Max, respiratoryRate, bodyMass] = await Promise.all([
      Health.readSamples({
        dataType: "sleep",
        startDate: dayAgo,
        endDate: nowIso,
        limit: 50,
        ascending: false,
      }),
      Health.readSamples({
        dataType: "restingHeartRate",
        startDate: dayAgo,
        endDate: nowIso,
        limit: 1,
        ascending: false,
      }),
      Health.readSamples({
        dataType: "heartRateVariability",
        startDate: dayAgo,
        endDate: nowIso,
        limit: 1,
        ascending: false,
      }),
      Health.readSamples({
        dataType: "vo2Max",
        startDate: monthAgo,
        endDate: nowIso,
        limit: 1,
        ascending: false,
      }),
      Health.readSamples({
        dataType: "respiratoryRate",
        startDate: dayAgo,
        endDate: nowIso,
        limit: 1,
        ascending: false,
      }),
      Health.readSamples({
        dataType: "weight",
        startDate: monthAgo,
        endDate: nowIso,
        limit: 1,
        ascending: false,
      }),
    ]);

    return {
      sleepHours: sumSleepHours(sleep.samples),
      restingHeartRate: restingHr.samples[0]?.value ?? null,
      hrv: hrv.samples[0]?.value ?? null,
      vo2Max: vo2Max.samples[0]?.value ?? null,
      respiratoryRate: respiratoryRate.samples[0]?.value ?? null,
      bodyMass: bodyMass.samples[0]?.value != null ? bodyMass.samples[0].value * LBS_PER_KG : null,
    };
  } catch {
    // Best-effort -- the manual form still works if HealthKit throws.
    return EMPTY_SNAPSHOT;
  }
}

export type HealthWorkoutSummary = {
  workoutType: string;
  durationMinutes: number;
  startDate: string;
  endDate: string;
  // Estimated by the OS from accelerometer + heart rate, same estimation
  // pipeline as Active Energy Burned -- see this file's own file comment
  // and native-health.ts's caller for why that estimate is materially
  // less trustworthy for resistance training than for steady-state cardio.
  // Kept (not dropped) so a caller can still show it, just labeled as an
  // estimate rather than treated as ground truth.
  estimatedCaloriesBurned: number | null;
};

/** Recent workouts logged to Health (Apple Watch or a third-party app that
 * writes to it) -- informational only, not folded into readiness scoring.
 * Read-only, same as the rest of this file. */
export async function fetchRecentWorkouts(days = 14): Promise<HealthWorkoutSummary[]> {
  if (!isNativeHealthSupported() || !isHealthSyncEnabled()) return [];

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { workouts } = await Health.queryWorkouts({
      startDate,
      endDate: now.toISOString(),
      limit: 50,
      ascending: false,
    });
    return workouts.map((w) => ({
      workoutType: w.workoutType,
      durationMinutes: Math.round((w.duration / 60) * 10) / 10,
      startDate: w.startDate,
      endDate: w.endDate,
      estimatedCaloriesBurned: w.totalEnergyBurned ?? null,
    }));
  } catch {
    return [];
  }
}

function sumSleepHours(
  samples: { startDate: string; endDate: string; sleepState?: string }[],
): number | null {
  const asleep = samples.filter((s) => !s.sleepState || !NON_SLEEP_STATES.has(s.sleepState));
  if (asleep.length === 0) return null;
  const totalMs = asleep.reduce(
    (sum, s) => sum + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()),
    0,
  );
  return Math.round((totalMs / 3_600_000) * 10) / 10;
}
