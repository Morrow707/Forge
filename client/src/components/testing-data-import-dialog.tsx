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
  date?: string | null;
  exerciseName: string;
  setNumber?: number | null;
  loadLbs?: number | null;
  velocityMps?: number | null;
  powerWatts?: number | null;
};

/** Photo of an OVR/Perch (or similar velocity-based training device)
 * printout or screen -> transcribes the table into a standalone,
 * reviewable "imported testing data" log -- deliberately NOT wired into a
 * program's tracked sets or trend charts the way a live camera-tracked set
 * is (see importedTestingData's schema comment): there's no assignment to
 * attach to, and a bad OCR read here has no live capture to catch it, so
 * this stays its own log a coach can look at, not something that silently
 * feeds the same charts a verified set would. Highest-risk of the photo
 * imports -- a dense numeric table, not a handful of labeled fields -- so
 * check every row before applying, same caution as the injury intake. */
export function TestingDataImportDialog({
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

  function reset() {
    setStep("capture");
    setImages([]);
    setRows([]);
  }

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setStep("analyzing");
      const res = await apiRequest("POST", "/api/coach/roster/testing-data-import/analyze-photo", { images });
      return res.json() as Promise<{ rows: Row[] }>;
    },
    onSuccess: (data) => {
      setRows(data.rows.map((r) => ({ ...r, date: r.date ?? new Date().toISOString().slice(0, 10) })));
      setStep("review");
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Couldn't read that photo");
      setStep("capture");
    },
  });

  const readyRows = rows.filter((r) => r.athleteId != null && r.exerciseName.trim().length > 0 && r.date);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const applyRows = readyRows.map((r) => ({
        athleteId: r.athleteId,
        date: r.date,
        exerciseName: r.exerciseName,
        setNumber: r.setNumber ?? undefined,
        loadLbs: r.loadLbs ?? undefined,
        velocityMps: r.velocityMps ?? undefined,
        powerWatts: r.powerWatts ?? undefined,
      }));
      const res = await apiRequest("POST", "/api/coach/roster/testing-data-import/apply", { rows: applyRows });
      return res.json() as Promise<{ applied: number }>;
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.applied} row${data.applied === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      onOpenChange(false);
      reset();
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not import rows"),
  });

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import OVR / Perch Testing Data</DialogTitle>
          <DialogDescription>
            Photograph a velocity-based-training printout or screen -- check every number, this doesn't
            auto-correct itself the way a live tracked set does.
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
            <p className="text-sm text-muted-foreground">
              {readyRows.length} of {rows.length} row{rows.length === 1 ? "" : "s"} ready. Review every value.
            </p>
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={row.athleteId != null ? String(row.athleteId) : "none"}
                      onValueChange={(v) => updateRow(i, { athleteId: v === "none" ? null : Number(v) })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Match athlete" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unmatched ("{row.nameOnSheet}")</SelectItem>
                        {roster.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={row.date ?? ""}
                      onChange={(e) => updateRow(i, { date: e.target.value })}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <label className="text-[10px] text-muted-foreground">Exercise</label>
                    <Input
                      className="h-8 w-full min-w-0 text-xs"
                      value={row.exerciseName}
                      onChange={(e) => updateRow(i, { exerciseName: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="min-w-0 space-y-1">
                      <label className="text-[10px] text-muted-foreground">Set #</label>
                      <Input
                        type="number"
                        className="h-8 w-full min-w-0 text-xs"
                        value={row.setNumber ?? ""}
                        onChange={(e) => updateRow(i, { setNumber: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <label className="text-[10px] text-muted-foreground">Load (lbs)</label>
                      <Input
                        type="number"
                        className="h-8 w-full min-w-0 text-xs"
                        value={row.loadLbs ?? ""}
                        onChange={(e) => updateRow(i, { loadLbs: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <label className="text-[10px] text-muted-foreground">Velocity (m/s)</label>
                      <Input
                        type="number"
                        className="h-8 w-full min-w-0 text-xs"
                        value={row.velocityMps ?? ""}
                        onChange={(e) =>
                          updateRow(i, { velocityMps: e.target.value === "" ? null : Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <label className="text-[10px] text-muted-foreground">Power (W)</label>
                      <Input
                        type="number"
                        className="h-8 w-full min-w-0 text-xs"
                        value={row.powerWatts ?? ""}
                        onChange={(e) =>
                          updateRow(i, { powerWatts: e.target.value === "" ? null : Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
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
                disabled={readyRows.length === 0 || applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending ? "Saving..." : `Import ${readyRows.length} Row${readyRows.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
