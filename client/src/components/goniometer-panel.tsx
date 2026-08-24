import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO, formatISO } from "date-fns";
import { Plus, Trash2, Ruler, Camera } from "lucide-react";
import {
  GONIOMETER_JOINTS,
  classifyGoniometerReading,
  findGoniometerMovement,
} from "@shared/goniometer";
import { cameraSupportsGoniometerMovement } from "@/lib/movement-screen-vision";
import { GoniometerCaptureDialog } from "@/components/goniometer-capture-dialog";
import { ArGoniometerCaptureDialog } from "@/components/ar-goniometer-capture-dialog";
import { isArPreviewPlatform } from "@/lib/native-ar-preview";

type GoniometerReading = {
  id: number;
  date: string;
  joint: string;
  movement: string;
  angleDegrees: number;
  notes: string | null;
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  restricted: "bg-destructive/15 text-destructive",
  normal: "bg-success/15 text-success",
  hypermobile: "bg-amber-500/15 text-amber-400",
};

const STATUS_LABEL: Record<string, string> = {
  restricted: "Restricted",
  normal: "Normal",
  hypermobile: "Hypermobile",
};

function jointLabel(key: string) {
  return GONIOMETER_JOINTS.find((j) => j.key === key)?.label ?? key;
}

/** A coach's goniometer (joint ROM) readings for one athlete -- an
 * append-only log, not a wide per-date snapshot like testing results, since
 * one assessment session can cover any subset of joints. Each reading is
 * classified against the standard clinical normal-range reference in
 * shared/goniometer.ts, purely as a starting signal (population norms, not
 * this athlete's own baseline) -- never a diagnosis. */
export function GoniometerPanel({ athleteId }: { athleteId: number }) {
  const qc = useQueryClient();
  const fetchUrl = `/api/coach/roster/${athleteId}/goniometer`;
  const [showForm, setShowForm] = useState(false);
  const [jointKey, setJointKey] = useState(GONIOMETER_JOINTS[0].key);
  const [movementKey, setMovementKey] = useState(GONIOMETER_JOINTS[0].movements[0].key);
  const [angle, setAngle] = useState("");
  const [notes, setNotes] = useState("");
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);

  const { data: readings = [], isLoading } = useQuery<GoniometerReading[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  const joint = GONIOMETER_JOINTS.find((j) => j.key === jointKey)!;

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        date: formatISO(new Date(), { representation: "date" }),
        joint: jointKey,
        movement: movementKey,
        angleDegrees: Number(angle),
        notes: notes.trim() || null,
      };
      const res = await apiRequest("POST", fetchUrl, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      toast.success("Reading saved");
      setAngle("");
      setNotes("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save reading"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${fetchUrl}/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      toast.success("Reading deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete reading"),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Joint range-of-motion readings from a goniometer, compared against standard clinical
        normal ranges as a starting signal -- not a diagnosis.
      </p>

      {!showForm ? (
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Log Reading
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Joint</Label>
              <Select
                value={jointKey}
                onValueChange={(v) => {
                  setJointKey(v);
                  const next = GONIOMETER_JOINTS.find((j) => j.key === v)!;
                  setMovementKey(next.movements[0].key);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GONIOMETER_JOINTS.map((j) => (
                    <SelectItem key={j.key} value={j.key}>
                      {j.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Movement</Label>
              <Select value={movementKey} onValueChange={setMovementKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {joint.movements.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.label} (~{m.normalDegrees}° normal)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Angle (degrees)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                placeholder="e.g. 165"
              />
              {cameraSupportsGoniometerMovement(jointKey, movementKey) && (
                <Button type="button" variant="outline" onClick={() => setCameraCaptureOpen(true)}>
                  <Camera className="h-4 w-4" />
                  Camera
                </Button>
              )}
            </div>
          </div>
          {(() => {
            const captureProps = {
              open: cameraCaptureOpen,
              onOpenChange: setCameraCaptureOpen,
              jointKey,
              movementKey,
              jointLabel: joint.label,
              movementLabel: joint.movements.find((m) => m.key === movementKey)?.label ?? movementKey,
              onCapture: (deg: number) => {
                setAngle(String(deg));
                setCameraCaptureOpen(false);
              },
            };
            return isArPreviewPlatform() ? (
              <ArGoniometerCaptureDialog {...captureProps} />
            ) : (
              <GoniometerCaptureDialog {...captureProps} />
            );
          })()}
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="End-feel, compensation, athlete-reported pain..."
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !angle}
            >
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-surface" />
      ) : readings.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No goniometer readings logged yet.
        </p>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {readings.map((r) => {
            const status = classifyGoniometerReading(r.joint, r.movement, r.angleDegrees);
            const movement = findGoniometerMovement(r.joint, r.movement);
            return (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5 text-sm"
              >
                <div className="flex items-start gap-2">
                  <Ruler className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">
                      {jointLabel(r.joint)} &middot; {movement?.label ?? r.movement}:{" "}
                      {r.angleDegrees}&deg;
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(r.date), "MMM d, yyyy")}
                    </p>
                    {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {status && (
                    <Badge className={cn("border-none", STATUS_BADGE_CLASS[status])}>
                      {STATUS_LABEL[status]}
                    </Badge>
                  )}
                  <button
                    type="button"
                    aria-label="Delete reading"
                    onClick={() => deleteMutation.mutate(r.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
