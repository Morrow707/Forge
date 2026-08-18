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
import { Checkbox } from "@/components/ui/checkbox";
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
  bodyPart: string;
  occurredOn?: string | null;
  description?: string | null;
  resolved?: boolean | null;
};

/** Photo of a pre-participation physical / injury history intake form ->
 * bulk-logs a new team's medical history instead of a coach re-typing each
 * entry from paperwork. Medical information, so the review step here is
 * mandatory (there's no "apply everything blind" shortcut) and every row
 * needs an explicit date before it can apply -- unlike the other import
 * dialogs, a missing field here isn't just cosmetically incomplete. */
export function InjuryIntakeImportDialog({
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
      const res = await apiRequest("POST", "/api/coach/roster/injury-intake/analyze-photo", { images });
      return res.json() as Promise<{ rows: Row[] }>;
    },
    onSuccess: (data) => {
      setRows(data.rows.map((r) => ({ ...r, occurredOn: r.occurredOn ?? new Date().toISOString().slice(0, 10) })));
      setStep("review");
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Couldn't read that photo");
      setStep("capture");
    },
  });

  const readyRows = rows.filter((r) => r.athleteId != null && r.bodyPart.trim().length > 0 && r.occurredOn);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const entries = readyRows.map((r) => ({
        athleteId: r.athleteId,
        bodyPart: r.bodyPart,
        occurredOn: r.occurredOn,
        description: r.description || undefined,
      }));
      const res = await apiRequest("POST", "/api/coach/roster/injury-intake/apply", { entries });
      return res.json() as Promise<{ applied: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      toast.success(`Logged ${data.applied} entr${data.applied === 1 ? "y" : "ies"}`);
      onOpenChange(false);
      reset();
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not apply entries"),
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
          <DialogTitle>Import Injury History Intake</DialogTitle>
          <DialogDescription>
            Photograph a pre-participation/injury intake form -- this is medical information, so check every row
            carefully before applying.
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
              {readyRows.length} of {rows.length} entr{rows.length === 1 ? "y" : "ies"} ready (matched, with body
              part and date).
            </p>
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-3">
                  <Select
                    value={row.athleteId != null ? String(row.athleteId) : "none"}
                    onValueChange={(v) => updateRow(i, { athleteId: v === "none" ? null : Number(v) })}
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0 space-y-1">
                      <label className="text-[10px] text-muted-foreground">Body part</label>
                      <Input
                        className="h-8 w-full min-w-0 text-xs"
                        value={row.bodyPart}
                        onChange={(e) => updateRow(i, { bodyPart: e.target.value })}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <label className="text-[10px] text-muted-foreground">Date</label>
                      <Input
                        type="date"
                        className="w-full min-w-0 text-xs"
                        value={row.occurredOn ?? ""}
                        onChange={(e) => updateRow(i, { occurredOn: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <label className="text-[10px] text-muted-foreground">Description (optional)</label>
                    <Input
                      className="h-8 w-full text-xs"
                      value={row.description ?? ""}
                      onChange={(e) => updateRow(i, { description: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={row.resolved ?? false}
                      onCheckedChange={(c) => updateRow(i, { resolved: c === true })}
                    />
                    Already resolved
                  </label>
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
                {applyMutation.isPending
                  ? "Saving..."
                  : `Log ${readyRows.length} Entr${readyRows.length === 1 ? "y" : "ies"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
