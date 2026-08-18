import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoUploadField, type PhotoImportStep } from "@/components/photo-upload-field";
import type { CapturedPhoto } from "@/lib/photo-capture";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";

type RosterEntry = { id: number; name: string };

type Row = {
  athleteId: number | null;
  nameOnSheet: string;
  weight: number;
  weightUnit: "lbs" | "kg";
};

/** Photo of a team weigh-in sheet -> logs every matched athlete's weight
 * in one shot instead of a coach opening each athlete's Body Metrics form
 * one at a time. Same review-before-commit shape as every photo-import
 * dialog -- see TestingDayImportDialog's own comment. */
export function WeighInImportDialog({
  open,
  onOpenChange,
  roster,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: RosterEntry[];
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<PhotoImportStep>("capture");
  const [images, setImages] = useState<CapturedPhoto[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  function reset() {
    setStep("capture");
    setImages([]);
    setRows([]);
    setDate(new Date().toISOString().slice(0, 10));
  }

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setStep("analyzing");
      const res = await apiRequest("POST", "/api/coach/roster/weigh-in/analyze-photo", { images });
      return res.json() as Promise<{ rows: Row[] }>;
    },
    onSuccess: (data) => {
      setRows(data.rows);
      setStep("review");
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Couldn't read that photo");
      setStep("capture");
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const entries = rows
        .filter((r) => r.athleteId != null)
        .map((r) => ({ athleteId: r.athleteId, date, weight: r.weight, weightUnit: r.weightUnit }));
      const res = await apiRequest("POST", "/api/coach/roster/weigh-in/apply", { entries });
      return res.json() as Promise<{ applied: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      toast.success(`Logged ${data.applied} weigh-in${data.applied === 1 ? "" : "s"}`);
      onOpenChange(false);
      reset();
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not apply weigh-ins"),
  });

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const matchedCount = rows.filter((r) => r.athleteId != null).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Weigh-In Sheet</DialogTitle>
          <DialogDescription>
            Photograph the team's weigh-in sheet -- review before it logs to anyone's history.
          </DialogDescription>
        </DialogHeader>

        {step === "capture" || step === "analyzing" ? (
          <div className="space-y-4">
            <PhotoUploadField images={images} onChange={setImages} />
            <Button
              type="button"
              className="w-full"
              disabled={images.length === 0 || analyzeMutation.isPending}
              onClick={() => analyzeMutation.mutate()}
            >
              {analyzeMutation.isPending ? "Reading photo..." : "Read Photo"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="min-w-0 space-y-1.5">
              <label className="text-xs text-muted-foreground">Weigh-in date</label>
              <Input
                type="date"
                className="w-full min-w-0"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {matchedCount} of {rows.length} row{rows.length === 1 ? "" : "s"} matched.
            </p>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <Select
                    value={row.athleteId != null ? String(row.athleteId) : "none"}
                    onValueChange={(v) => updateRow(i, { athleteId: v === "none" ? null : Number(v) })}
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue placeholder="Match athlete" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unmatched ("{row.nameOnSheet}") -- skip</SelectItem>
                      {roster.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-8 w-20 shrink-0 text-xs"
                    value={row.weight}
                    onChange={(e) => updateRow(i, { weight: Number(e.target.value) })}
                  />
                  <Select
                    value={row.weightUnit}
                    onValueChange={(v) => updateRow(i, { weightUnit: v as "lbs" | "kg" })}
                  >
                    <SelectTrigger className="h-8 w-16 shrink-0 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lbs">lbs</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "review" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("capture")}>
                Back
              </Button>
              <Button
                type="button"
                disabled={matchedCount === 0 || applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending ? "Saving..." : `Log ${matchedCount} Weigh-In${matchedCount === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
