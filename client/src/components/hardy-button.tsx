import { Suspense, lazy, useState } from "react";
import { countInteraction } from "@/lib/feature-usage";
import { useLocation } from "wouter";
import { HardyMark } from "@/components/hardy-mark";

/* HARDY'S CORNER BUTTON (2026-11-11). The Forge mark in the bottom corner of every signed-in page
 * the app shell draws (athlete, coach, admin; a guardian never renders the shell). Tapping it opens
 * his panel, which loads on first open so the panel's code is not on anybody's first paint. It sits
 * under every dialog (z-40), so a tracker or the rep keypad covers it rather than the reverse. */

const HardyPanel = lazy(async () => ({ default: (await import("@/components/hardy-panel")).HardyPanel }));

/** The workout day screen is the busiest in the app (set pills, the rep pad, the camera), so Hardy
 * steps out of its way there, as he does while a set is being logged. */
const WORKOUT_DAY = "/day/";

export function HardyButton() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (location.includes(WORKOUT_DAY)) return null;
  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close Hardy" : "Open Hardy, search your logs"}
        aria-expanded={open}
        onClick={() => {
          setLoaded(true);
          if (!open) countInteraction("Hardy: opened");
          setOpen((o) => !o);
        }}
        className="fixed z-40 grid h-14 w-14 place-items-center rounded-full border-2 border-[#c8102e] bg-[#fbf6f2] shadow-lg transition-transform hover:-rotate-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        style={{ right: "calc(16px + env(safe-area-inset-right, 0px))", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
      >
        <HardyMark className="h-11 w-11" id="hardy-button-mark" />
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <HardyPanel open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
