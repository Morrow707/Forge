import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAMERA_ACCURACY_SHORT, CAMERA_ACCURACY_INLINE } from "@shared/camera-accuracy-copy";

/**
 * The camera-accuracy warning, sized to sit next to a number rather than in
 * front of a page.
 *
 * CameraAccuracyNotice (the one-time dialog) and the pricing banner both fire
 * once, somewhere other than where the claim is made. An athlete reading a
 * 0.62 m/s on a set row six weeks after dismissing a dialog has no reason to
 * doubt it, and a coach changing that athlete's programming off the same
 * number never saw the dialog on this device at all. This is the version that
 * goes where the number is, every time the number is there.
 *
 * Not dismissible on purpose. A caveat the reader can clear is a caveat that
 * is absent for every reading after the first, which is the whole problem
 * this is here to fix.
 */
export function CameraMetricCaveat({
  variant = "short",
  className,
}: {
  /** "short" for a standalone row (under a chart, on a card); "inline" when
   * the surrounding UI already makes it obvious which numbers are meant. */
  variant?: "short" | "inline";
  className?: string;
}) {
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
      <span>{variant === "inline" ? CAMERA_ACCURACY_INLINE : CAMERA_ACCURACY_SHORT}</span>
    </p>
  );
}
