import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { isAvPreviewPlatform } from "@/lib/native-av-preview";

const SEEN_KEY = "forge:non-ios-accuracy-notice-seen";

/** A one-time, permanent notice for any platform that isn't native iOS --
 * Android and web both fall back to MediaPipe (a 2D-camera ML model) for
 * every camera-tracked capture, since ARKit's body tracking (real-world 3D
 * joint positions, the more accurate source) is an iPhone-only capability.
 * Shown once ever per device (a localStorage flag, not tied to the
 * account, since the same login can land on different devices with
 * different accuracy) and never again after being dismissed -- mounted in
 * AppShell so it fires the first time any authenticated screen renders on
 * a qualifying device, not just right after a fresh login (an already-
 * signed-in session on a device that gets this feature for the first time
 * would otherwise never see it). */
export function NonIosTrackingNotice() {
  const [open, setOpen] = useState(() => {
    if (isAvPreviewPlatform()) return false;
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
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            About Camera Tracking Here
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          On this device, bar path, sprint, and mechanics tracking run on a 2D-camera model
          instead of iPhone's more accurate native motion tracking. Numbers here may be a bit
          less precise -- for the most accurate readings, use an iPhone.
        </p>
        <DialogFooter>
          <Button onClick={dismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
