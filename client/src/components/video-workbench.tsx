import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VideoCompareDialog } from "@/components/video-compare";
import { SessionRecorderControls } from "@/components/session-recorder-controls";
import { CameraMetricCaveat } from "@/components/camera-metric-caveat";
import { getJson } from "@/lib/queryClient";
import type { FreeAgentAddOnId } from "@shared/free-agent-tiers";

type AthleteEntitlements = {
  addOns: Record<FreeAgentAddOnId, boolean>;
  ownedAddOns: Record<FreeAgentAddOnId, boolean>;
  billingOpen: boolean;
};

/** WHAT A FREE AGENT CAN DO WITH THEIR OWN FOOTAGE, now that the coach cards are gone.
 *
 * The three review cards were removed for a Free Agent because every one of them ended at a
 * coach who does not exist -- a list that can never fill, a breakdown whose purpose is sending
 * it somewhere, a request with no recipient. This is what replaces them, and it deliberately
 * ends somewhere real: their own phone.
 *
 * Their lift against a reference clip they supply, side by side, with the skeleton, the
 * drawings and a voice-over -- then recorded and exported. Forge stores none of it.
 *
 * ACCESS COMES FROM THE SERVER (see sport-coaches.tsx for why this is a fix rather than a
 * refactor): `addOns.video_analysis` is "may I open this", which beta, a trial or enforcement
 * being off all answer yes to, and none of which the client can work out for itself.
 */
export function VideoWorkbenchCard() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery<AthleteEntitlements>({
    queryKey: ["/api/athlete/entitlements"],
    queryFn: () => getJson("/api/athlete/entitlements"),
  });

  // Unknown is not yes. Same convention as useCameraAccess: drawing this before the answer
  // lands flashes a bought feature at somebody who has not bought it.
  if (data?.addOns?.video_analysis !== true) return null;

  return (
    <>
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Clapperboard className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Video analysis</p>
              <p className="text-sm text-muted-foreground">
                Put one of your lifts next to a reference clip, step through them together, draw
                on them and talk over the top. Record the session and save it to your phone --
                Forge keeps no copy.
              </p>
            </div>
          </div>
          {/* The numbers on screen are still the uncalibrated ones. What is sold here is the
              video work; the measurements carry the same warning they carry everywhere. */}
          <CameraMetricCaveat />
          <Button type="button" onClick={() => setOpen(true)}>
            Open video analysis
          </Button>
        </CardContent>
      </Card>
      <VideoCompareDialog
        open={open}
        onOpenChange={setOpen}
        // "self": the athlete's own clips. A Free Agent has no roster and no guardian view --
        // the only footage they can put on a side is their own.
        subject={{ kind: "self" }}
        title="Video analysis"
        footer={<SessionRecorderControls />}
      />
    </>
  );
}
