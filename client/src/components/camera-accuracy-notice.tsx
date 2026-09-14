import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const SEEN_KEY = "forge:camera-accuracy-notice-seen";

/** One-time, click-through acknowledgment that camera-tracked METRICS are
 * not trustworthy right now, distinct from NonIosTrackingNotice's narrower
 * "this device uses a less precise model than an iPhone" claim -- this one
 * applies on every platform, iPhone included. The camera still records and
 * saves video normally; what's unreliable is everything the pipeline
 * derives from it (velocity, range of motion, power, trust scores) while
 * calibration work is ongoing (see docs/camera-tracking-notes.md for the
 * real, current state of that work).
 *
 * Same shown-once-per-device localStorage pattern as NonIosTrackingNotice
 * and mounted alongside it in AppShell, but kept as its own component and
 * its own flag rather than folded into that one: the two are independent,
 * both-can-be-true claims (a non-iPhone user during this period would
 * legitimately need to see both), and this one has nothing to do with
 * which platform the athlete is on. "I understand" rather than "Got it" --
 * this is closer to a required acknowledgment than an FYI. */
export function CameraAccuracyNotice() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SEEN_KEY) !== "1";
  });

  function dismiss() {
    window.localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Camera Tracking Accuracy
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The camera records and saves your video normally. But right now, the numbers it
          calculates from that video -- velocity, range of motion, power, and similar tracked
          metrics -- are not accurate. We're actively calibrating the system. Don't make training
          decisions based on these numbers until that's done.
        </p>
        <DialogFooter>
          <Button onClick={dismiss}>I understand</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
