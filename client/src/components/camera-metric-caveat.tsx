import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAMERA_ACCURACY_SHORT, CAMERA_ACCURACY_INLINE } from "@shared/camera-accuracy-copy";

/** Own flag, deliberately NOT CameraAccuracyNotice's.
 *
 * That dialog fires on the first authenticated render, which for most people
 * is the dashboard -- somewhere with no tracked numbers on screen. Sharing its
 * flag would mean this line is already dismissed before the athlete ever opens
 * a workout, and the whole point of it is to be read once while an actual
 * velocity reading is in front of them. Separate key, so it survives the
 * dialog and gets one showing in context. */
const SEEN_KEY = "forge:camera-metric-caveat-seen";

function alreadyAcknowledged() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Private windows and blocked site data both throw here. Failing open
    // (showing the caveat) is the right way round: an extra warning is a
    // nuisance, a missing one is the thing this exists to prevent.
    return false;
  }
}

/**
 * The camera-accuracy warning, sized to sit next to a number rather than in
 * front of a page.
 *
 * Two modes, and the difference is about WHO is reading:
 *
 * - `dismissible` (in-app: the workout page, coach analytics). Shown until
 *   acknowledged once, then gone for good on that device. These are surfaces
 *   someone opens every session, and a permanent line on every tracked
 *   exercise stops being read after the second day -- at which point it is
 *   costing attention without buying disclosure.
 * - permanent (the price list, the landing page, the checkout). A prospect
 *   sees these once or twice, deciding whether to pay, and cannot acknowledge
 *   away a material fact about what they are buying.
 */
export function CameraMetricCaveat({
  variant = "short",
  dismissible = false,
  className,
}: {
  /** "short" for a standalone row (under a chart, on a card); "inline" when
   * the surrounding UI already makes it obvious which numbers are meant. */
  variant?: "short" | "inline";
  /** Let the reader clear it after one acknowledgment. In-app only -- see the
   * note above on why the sales surfaces do not get this. */
  dismissible?: boolean;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(() => dismissible && alreadyAcknowledged());

  if (dismissed) return null;

  function acknowledge() {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Same tolerance as the read above -- if the flag cannot be stored the
      // caveat simply comes back next time, which is the safe direction.
    }
    setDismissed(true);
  }

  return (
    <p
      className={cn(
        "flex items-start gap-1.5 font-semibold text-destructive",
        variant === "inline" ? "text-[11px]" : "text-xs",
        className,
      )}
    >
      <AlertTriangle
        className={cn("mt-0.5 shrink-0", variant === "inline" ? "h-3 w-3" : "h-3.5 w-3.5")}
      />
      <span className="flex-1">{variant === "inline" ? CAMERA_ACCURACY_INLINE : CAMERA_ACCURACY_SHORT}</span>
      {dismissible && (
        <button
          type="button"
          onClick={acknowledge}
          aria-label="Got it -- don't show this again"
          className="-mt-0.5 shrink-0 rounded p-0.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </p>
  );
}
