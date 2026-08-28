import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, X } from "lucide-react";
import { useArBodyTracking } from "@/lib/use-ar-body-tracking";
import { arJointsToWorldLandmarks } from "@/lib/ar-body-landmarks";
import { MEASURABLE_JOINTS, measureJoint } from "@/lib/joint-angles";
import { cameraGoniometerJointFor, convertCameraAngle } from "@/lib/movement-screen-vision";

/** ARKit-native twin of goniometer-capture-dialog.tsx -- same live angle
 * readout and Capture flow, sourced from ARKit's real world-space joints
 * (via useArBodyTracking/ar-body-landmarks.ts) instead of MediaPipe.
 * measureJoint already accepts a null 2D-landmarks argument for exactly
 * this bridge (see its own comment in joint-angles.ts) so the shared angle
 * math and GONIOMETER_JOINTS conversion table are reused completely
 * unmodified -- only how a frame's joints get here differs. */
export function ArGoniometerCaptureDialog({
  open,
  onOpenChange,
  jointKey,
  movementKey,
  jointLabel,
  movementLabel,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jointKey: string;
  movementKey: string;
  jointLabel: string;
  movementLabel: string;
  onCapture: (angleDeg: number) => void;
}) {
  const { containerRef, frame, error, supported, supportError, cameraPermission, diagLog } = useArBodyTracking(open);
  const [liveAngle, setLiveAngle] = useState<number | null>(null);

  const measurableKey = cameraGoniometerJointFor(jointKey);
  const joint = measurableKey ? MEASURABLE_JOINTS.find((j) => j.key === measurableKey) : undefined;

  useEffect(() => {
    if (!open) setLiveAngle(null);
  }, [open]);

  useEffect(() => {
    if (!frame || !frame.tracked || !joint) {
      setLiveAngle(null);
      return;
    }
    const worldLm = arJointsToWorldLandmarks(frame.joints);
    const measured = measureJoint(null, worldLm, joint);
    setLiveAngle(measured ? convertCameraAngle(jointKey, movementKey, measured.insideDeg) : null);
  }, [frame, joint, jointKey, movementKey]);

  if (!joint) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-transparent backdrop-blur-none"
        className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent backdrop-blur-none p-0 overflow-hidden [&>button]:hidden"
      >
        <div className="relative flex h-full w-full flex-col">
          <div ref={containerRef} className="relative flex-1" style={{ background: "transparent" }}>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="absolute left-3 right-16 top-[max(0.75rem,env(safe-area-inset-top))] z-10 select-text space-y-0.5 rounded-md bg-black/60 px-2 py-1.5 font-mono text-[9px] leading-tight text-white/80 backdrop-blur-sm">
              <div>
                supported={String(supported)} perm={cameraPermission ?? "?"} tracked=
                {String(frame?.tracked ?? false)}
              </div>
              {diagLog.map((line, i) => (
                <div key={i} className="text-white/60">
                  {line}
                </div>
              ))}
            </div>

            <div className="absolute inset-x-4 top-3 rounded-md bg-black/60 px-3 py-2 text-center text-xs text-white backdrop-blur-sm">
              {jointLabel} &middot; {movementLabel} -- hold the end-range position. An estimate, not a
              clinical-grade reading; adjust the number if it looks off.
            </div>

            {!frame?.tracked && !error && supported !== false && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-black/60 px-3 py-2 text-center text-sm text-white backdrop-blur-sm">
                Step into frame so ARKit can lock onto your body
              </div>
            )}

            {error && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {supported === false && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  ARKit tracking isn't supported on this device.
                </div>
                {supportError && (
                  <p className="select-text break-all text-center text-xs opacity-90">{supportError}</p>
                )}
              </div>
            )}

            {frame?.tracked && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-3 text-center">
                <span className="font-mono text-3xl font-bold text-white">
                  {liveAngle != null ? `${liveAngle}°` : "--"}
                </span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-center bg-black/70 px-3 py-4 backdrop-blur-sm">
            <Button
              size="lg"
              onClick={() => liveAngle != null && onCapture(liveAngle)}
              disabled={liveAngle == null}
            >
              <Check className="h-4 w-4" />
              Capture {liveAngle != null ? `${liveAngle}°` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
