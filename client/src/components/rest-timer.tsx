import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Timer, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { playSuccessChime as playChime } from "@/lib/audio-cues";
import { toast } from "sonner";

// Felt on Android/most PWA contexts (iOS Safari doesn't implement the
// Vibration API at all, so this silently no-ops there) -- a second,
// non-audio channel for "rest is over" that doesn't depend on the phone's
// volume, ringer state, or whatever else might be routing audio.
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
    playChime();
    vibrateRestOver();
    // The bottom-nav pill alone is easy to miss if attention is on the
    // camera tracker or anywhere else on screen -- a sticky, full-width
    // toast makes "rest is over" impossible to overlook visually, on top of
    // the repeating chime + vibration. Stays up (duration: Infinity) until
    // the athlete dismisses it from either this toast or the pill itself.
    const toastId = toast.error("Rest time is up!", {
      duration: Infinity,
      action: { label: "Dismiss", onClick: () => setRinging(false) },
    });
    ringIntervalRef.current = setInterval(() => {
      playChime();
      vibrateRestOver();
    }, 1500);
    return () => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
      toast.dismiss(toastId);
    };
  }, [ringing]);

  if (ringing) {
    return (
      <button
        type="button"
        onClick={() => setRinging(false)}
        className="flex animate-pulse items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground"
      >
        <BellRing className="h-4 w-4" />
        Rest over — tap to dismiss
      </button>
    );
  }

  if (remaining !== null) {
    return (
      <button
        type="button"
        onClick={() => setRemaining(null)}
        className="flex items-center gap-1.5 text-sm font-semibold text-primary"
      >
        <Timer className="h-4 w-4" />
        {formatClock(remaining)}
      </button>
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
