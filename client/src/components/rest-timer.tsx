import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Timer, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = [30, 60, 90, 120, 180];

// Web Audio output mixes with any other audio source (music, video, a call)
// rather than pausing/ducking it, and isn't subject to a silent-mode switch
// the way an <audio> element can be on iOS -- this is what makes it audible
// over headphones/media instead of a normal chime getting lost underneath.
function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    // Three quick beeps instead of one soft tone -- easier to notice over
    // music/headphones, and reads unambiguously as "timer done" rather than
    // a generic notification sound.
    [0, 0.25, 0.5].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.35, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.start(start);
      osc.stop(start + 0.2);
    });
    setTimeout(() => ctx.close(), 900);
  } catch {
    // Web Audio isn't available in every environment -- the timer still works, just silently.
  }
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Rest timer for the bottom nav bar of the athlete's workout view -- presets
 * default to the current exercise's prescribed rest, counts down, then rings
 * repeatedly (not a single chime-and-forget) until the athlete dismisses it. */
export function RestTimerControl({ defaultSeconds }: { defaultSeconds?: number | null }) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ringing, setRinging] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    ringIntervalRef.current = setInterval(playChime, 1500);
    return () => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
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
}
