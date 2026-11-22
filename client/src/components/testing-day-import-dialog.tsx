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
import { useT } from "@/i18n";

type RosterEntry = { id: number; name: string };

type Row = {
  athleteId: number | null;
  nameOnSheet: string;
  fortyYardDash?: number | null;
  verticalJumpIn?: number | null;
  broadJumpIn?: number | null;
  proAgilitySeconds?: number | null;
  threeConeSeconds?: number | null;
  benchMaxLbs?: number | null;
  squatMaxLbs?: number | null;
  deadliftMaxLbs?: number | null;
  note?: string | null;
};

const FIELDS: [keyof Row, string][] = [
  ["fortyYardDash", "40yd (s)"],
  ["verticalJumpIn", "Vert (in)"],
  ["broadJumpIn", "Broad (in)"],
  ["proAgilitySeconds", "Pro Agility (s)"],
  ["threeConeSeconds", "3-Cone/L-Drill (s)"],
  ["benchMaxLbs", "Bench (lbs)"],
  ["squatMaxLbs", "Squat (lbs)"],
  ["deadliftMaxLbs", "Deadlift (lbs)"],
];

/** Photo of a combine/testing results sheet -> bulk-fills the testing-
 * snapshot fields already sitting on the users table (fortyYardDash etc.)
 * across however many roster athletes the sheet covers, instead of a coach
 * retyping every row by hand. See PhotoUploadField's own comment for why a
 * plain file input is enough here (no live camera preview needed). */
export function TestingDayImportDialog({
  open,
  onOpenChange,
  roster,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: RosterEntry[];
}) {
  const t = useT();
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
      const res = await apiRequest("POST", "/api/coach/roster/testing-day/analyze-photo", { images });
      return res.json() as Promise<{ rows: Row[] }>;
    },
    onSuccess: (data) => {
      setRows(data.rows);
      setStep("review");
    },
    onError: (err: ApiError) => {
      toast.error(err.message || t("Couldn't read that photo"));
      setStep("capture");
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const updates = rows
        .filter((r) => r.athleteId != null)
        .map(({ nameOnSheet, note, ...rest }) => rest);
      const res = await apiRequest("POST", "/api/coach/roster/testing-day/apply", { updates });
      return res.json() as Promise<{ applied: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      toast.success(t.plural(data.applied, "Updated {count} athlete", "Updated {count} athletes"));
      onOpenChange(false);
      reset();
    },
    onError: (err: ApiError) => toast.error(err.message || t("Could not apply results")),
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Import Testing Day Results")}</DialogTitle>
          <DialogDescription>
            {t("Photograph a combine/testing results sheet, review the numbers before they save.")}
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
              {analyzeMutation.isPending ? t("Reading photo...") : t("Read Photo")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t.plural(rows.length, "{matched} of {count} row matched to a roster athlete. Fix any mismatches or numbers before applying.", "{matched} of {count} rows matched to a roster athlete. Fix any mismatches or numbers before applying.", { matched: matchedCount })}
            </p>
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {t("Sheet: \"{name}\"", { name: row.nameOnSheet })}
                    </span>
                    <Select
                      value={row.athleteId != null ? String(row.athleteId) : "none"}
                      onValueChange={(v) => updateRow(i, { athleteId: v === "none" ? null : Number(v) })}
                    >
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue placeholder={t("Match athlete")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("Unmatched, skip")}</SelectItem>
                        {roster.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {FIELDS.map(([key, label]) => (
                      <div key={key} className="min-w-0 space-y-1">
                        <label className="text-[10px] text-muted-foreground">{label}</label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-8 w-full min-w-0 text-xs"
                          value={row[key] ?? ""}
                          onChange={(e) =>
                            updateRow(i, { [key]: e.target.value === "" ? null : Number(e.target.value) } as Partial<Row>)
                          }
                        />
                      </div>
                    ))}
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
                {t("Back")}
              </Button>
              <Button
                type="button"
                disabled={matchedCount === 0 || applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending ? t("Saving...") : t.plural(matchedCount, "Apply to {count} Athlete", "Apply to {count} Athletes")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
