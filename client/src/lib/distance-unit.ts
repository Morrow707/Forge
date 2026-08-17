// Jump height/distance is always stored and scored in centimeters (see
// jump-tracking.ts) -- this is purely a display-layer preference, the same
// device-level pattern as the tracker dialogs' voice-cue toggle, so a coach
// and an athlete can each view it in whichever unit is faster for them to
// read without any schema or scoring change.
import { useEffect, useState } from "react";

export type DistanceUnit = "cm" | "in";

const DISTANCE_UNIT_KEY = "forge:jump-distance-unit";
const CM_PER_INCH = 2.54;

export function loadDistanceUnitPref(): DistanceUnit {
  if (typeof window === "undefined") return "in";
  return window.localStorage.getItem(DISTANCE_UNIT_KEY) === "cm" ? "cm" : "in";
}

function saveDistanceUnitPref(unit: DistanceUnit) {
  window.localStorage.setItem(DISTANCE_UNIT_KEY, unit);
}

export function cmToDisplayUnit(cm: number, unit: DistanceUnit): number {
  return unit === "in" ? cm / CM_PER_INCH : cm;
}

// Rounded to whatever precision reads cleanly in each unit -- cm values
// already come pre-rounded to one decimal from jump-tracking.ts, inches
// gets the same treatment rather than a long float tail.
export function formatDistanceCm(cm: number, unit: DistanceUnit): string {
  const value = cmToDisplayUnit(cm, unit);
  return `${Math.round(value * 10) / 10} ${unit}`;
}

// In-tab listeners -- `storage` events only fire in OTHER tabs/windows, but
// a single page here can mount several independent useDistanceUnit() call
// sites at once (a header toggle plus a chart further down), and toggling
// one needs to repaint all of them immediately, not just cross-tab copies.
const listeners = new Set<(unit: DistanceUnit) => void>();

// Local, per-device state (like the tracker dialogs' voice-cue toggle) --
// every mounted toggle or display stays in sync with every other one, both
// within the same tab and across tabs, without any prop drilling.
export function useDistanceUnit(): [DistanceUnit, (next: DistanceUnit) => void] {
  const [unit, setUnitState] = useState<DistanceUnit>(loadDistanceUnitPref);

  useEffect(() => {
    listeners.add(setUnitState);
    function onStorage(e: StorageEvent) {
      if (e.key === DISTANCE_UNIT_KEY) setUnitState(loadDistanceUnitPref());
    }
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(setUnitState);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function setUnit(next: DistanceUnit) {
    saveDistanceUnitPref(next);
    listeners.forEach((l) => l(next));
  }

  return [unit, setUnit];
}
