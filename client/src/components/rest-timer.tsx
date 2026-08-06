import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Timer, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { playRestOverAlarm } from "@/lib/audio-cues";

// Felt on Android/most PWA contexts. iOS Safari has never implemented the
// Vibration API at all -- in *any* context, tab or installed-to-homescreen
// PWA alike -- so this is silently a no-op there, and no amount of JS on
// our side changes that; it's a WebKit gap, not a bug here.
function vibrateRestOver() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([300, 150, 300, 150, 300]);
  }
}

const PRESETS = [30, 60, 90, 120, 180];

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type RestTimerHandle = {
  /** Starts the timer for `seconds`, but only if it's currently idle -- a
   * set completing mid-countdown (e.g. the other side of a superset)
   * shouldn't interrupt a rest that's already running. */
  autoStart: (seconds: number | null | undefined) => void;
};

/** Rest timer for the bottom nav bar of the athlete's workout view -- presets
 * default to the current exercise's prescribed rest, counts down, then rings
 * repeatedly (not a single chime-and-forget) until the athlete dismisses it. */
export const RestTimerControl = forwardRef<RestTimerHandle, { defaultSeconds?: number | null }>(
  function RestTimerControl({ defaultSeconds }, ref) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ringing, setRinging] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useImperativeHandle(ref, () => ({
    autoStart: (seconds) => {
      if (!seconds || seconds <= 0) return;
      setRemaining((current) => {
        if (current !== null || ringing) return current;
        return seconds;
      });
    },
  }));

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      setRemaining(null);
      setRinging(true);
      return;
    }
    timeoutRef.current = setTimeout(() => setRemaining((r) => (r !== null ? r - 1 : null)), 1000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [remaining]);

  useEffect(() => {
    if (!ringing) return;
    playRestOverAlarm();
    vibrateRestOver();
    ringIntervalRef.current = setInterval(() => {
      playRestOverAlarm();
      vibrateRestOver();
    }, 1800);
    return () => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    };
  }, [ringing]);

  // A tiny bottom-nav pill is easy to miss if attention is on the camera
  // tracker, a comment thread, or anywhere else on screen -- both the
  // running countdown and the "time's up" state below render centered over
  // the whole viewport, as a portal to document.body instead of inline in
  // this component's normal position. A plain `fixed inset-0` here isn't
  // enough on its own: this component sits inside AppShell's scroll area,
  // and any ancestor with a transform, filter, or backdrop-filter (several
  // show up between here and <body> in this app) turns into a containing
  // block for fixed descendants, which silently clips them to that ancestor
  // instead of the true viewport -- confirmed happening here, the sticky top
  // header was rendering above the "rest over" overlay instead of being
  // covered by it. The portal sidesteps that entirely, and since this
  // component instance is mounted once for the whole logging session (not
  // remounted per exercise page), both overlays stay centered and running
  // no matter how far the athlete scrolls or how many times they tap
  // Back/Next between exercises. The small inline control below the portal
  // calls stays in its normal spot for the bottom nav row's layout. The
  // overlay's audio/vibration are still bound by whatever the phone's
  // ringer/silent switch and Web Audio allow (see audio-cues.ts) -- no web
  // API lets a page or installed PWA override that on iOS, so a muted phone
  // genuinely won't make sound no matter how the tone is built; that's a
  // WebKit platform ceiling, not something fixable in this file.
  if (ringing) {
    return (
      <>
        <button
          type="button"
          onClick={() => setRinging(false)}
          className="flex animate-pulse items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground"
        >
          <BellRing className="h-4 w-4" />
          Rest over
        </button>
        {createPortal(
          <div
            role="alertdialog"
            aria-label="Rest time is up"
            onClick={() => setRinging(false)}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-primary px-6 text-center"
          >
            <BellRing className="h-20 w-20 text-primary-foreground" />
            <p className="font-display text-6xl font-extrabold leading-none text-primary-foreground">
              Rest Over
            </p>
            <p className="text-lg font-semibold text-primary-foreground/80">
              Time to get back to it
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRinging(false);
              }}
              className="mt-4 rounded-full bg-primary-foreground px-10 py-4 text-lg font-bold text-primary shadow-lg"
            >
              Dismiss
            </button>
          </div>,
          document.body,
        )}
      </>
    );
  }

  if (remaining !== null) {
    return (
      <>
        <button
          type="button"
          onClick={() => setRemaining(null)}
          className="flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          <Timer className="h-4 w-4" />
          {formatClock(remaining)}
        </button>
        {createPortal(
          <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center px-4">
            <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-3xl border border-primary/40 bg-surface/95 px-10 py-8 text-center shadow-2xl backdrop-blur">
              <Timer className="h-8 w-8 text-primary" />
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Resting
              </p>
              <p className="font-display text-7xl font-extrabold leading-none tabular-nums text-primary">
                {formatClock(remaining)}
              </p>
              <button
                type="button"
                onClick={() => setRemaining(null)}
                className="mt-2 text-sm font-semibold text-muted-foreground underline"
              >
                Skip
              </button>
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  const presets =
    defaultSeconds && !PRESETS.includes(defaultSeconds) ? [defaultSeconds, ...PRESETS] : PRESETS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          <Timer className="h-4 w-4" />
          Select Timer
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-48">
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Rest timer</p>
        <div className="grid grid-cols-3 gap-1.5">
          {presets.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setRemaining(s);
                setOpen(false);
              }}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors",
                s === defaultSeconds
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
              )}
            >
              {s}s
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
  },
);
