import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PhotoUploadField } from "@/components/photo-upload-field";
import type { CapturedPhoto } from "@/lib/photo-capture";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { format, parseISO, formatISO } from "date-fns";
import { Plus, ClipboardCheck, AlertTriangle, Camera, PenLine, Loader2 } from "lucide-react";
import { resolveMovementScreenUnitLabel, formatMovementScreenScore } from "@shared/movement-screen";

type Battery = { id: number; name: string; isForgeOfficial: boolean; editable: boolean };
type BatteryTest = {
  testKey: string;
  label: string;
  category: string;
  scoreType: "grade_0_3" | "distance_in" | "time_sec" | "asymmetry_pct";
  unitLabel: string | null;
  side: "bilateral" | "unilateral";
  instructions: string | null;
};
type ScreenSummary = {
  id: number;
  date: string;
  captureMethod: string;
  testCount: number;
  flaggedCount: number;
};
type ScreenResult = {
  id: number;
  testKey: string;
  label: string;
  category: string;
  scoreType: BatteryTest["scoreType"];
  unitLabel: string | null;
  side: "left" | "right" | null;
  scoreValue: number;
  flagged: boolean;
  notes: string | null;
  correctives: { id: number; name: string; muscleGroup: string }[];
};
type PhotoRow = {
  testKey: string;
  label: string;
  category: string;
  scoreType: BatteryTest["scoreType"];
  unitLabel: string | null;
  side: "left" | "right" | null;
  scoreValue: number;
  notes: string | null;
};

/** Coach/PT-administered functional-movement screening -- see
 * shared/movement-screen.ts for the test taxonomy. Deliberately quiet: no
 * composite grade badge on the athlete's summary card, no gating logic
 * anywhere here -- a flagged result surfaces suggested correctives and
 * feeds the AI's own context, nothing more. */
export function MovementScreenPanel({ athleteId }: { athleteId: number }) {
  const qc = useQueryClient();
  const historyUrl = `/api/coach/roster/${athleteId}/movement-screens`;
  const [showNew, setShowNew] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);

  const { data: screens = [], isLoading } = useQuery<ScreenSummary[]>({
    queryKey: [historyUrl],
    queryFn: () => getJson(historyUrl),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Functional-movement screening history -- informational, not a gate. A flagged result
          suggests correctives below and quietly informs the AI's program suggestions; nothing
          here blocks an assignment.
        </p>
        <Button size="sm" className="shrink-0" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" />
          New Screen
        </Button>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-surface" />
      ) : screens.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No screens logged yet.</p>
      ) : (
        <div className="space-y-2">
          {screens.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setViewingId(s.id)}
              className="flex w-full items-center justify-between rounded-md border border-border p-3 text-left text-sm hover:border-primary/40"
            >
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-semibold">{format(parseISO(s.date), "MMM d, yyyy")}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.testCount} test{s.testCount === 1 ? "" : "s"} &middot;{" "}
                    {s.captureMethod === "photo_import" ? "photo import" : "manual entry"}
                  </p>
                </div>
              </div>
              {s.flaggedCount > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {s.flaggedCount} flagged
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <NewScreenDialog
          athleteId={athleteId}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: [historyUrl] });
            setShowNew(false);
          }}
        />
      )}

      {viewingId != null && <ScreenDetailDialog screenId={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  );
}

function ScreenDetailDialog({ screenId, onClose }: { screenId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ date: string; notes: string | null; results: ScreenResult[] }>({
    queryKey: [`/api/coach/movement-screens/${screenId}`],
    queryFn: () => getJson(`/api/coach/movement-screens/${screenId}`),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data ? format(parseISO(data.date), "MMMM d, yyyy") : "Screen"}</DialogTitle>
          {data?.notes && <DialogDescription>{data.notes}</DialogDescription>}
        </DialogHeader>
        {isLoading || !data ? (
          <div className="h-32 animate-pulse rounded-md bg-surface" />
        ) : (
          <div className="space-y-2">
            {data.results.map((r) => (
              <div
                key={r.id}
                className={`rounded-md border p-2.5 text-sm ${r.flagged ? "border-destructive/40 bg-destructive/5" : "border-border"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    {r.label}
                    {r.side ? ` (${r.side})` : ""}
                  </p>
                  <span className="font-mono text-xs">{formatMovementScreenScore(r.scoreType, r.scoreValue, r.unitLabel)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{r.category}</p>
                {r.flagged && r.correctives.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-destructive/20 pt-2">
                    <p className="text-xs font-semibold text-destructive">Suggested correctives</p>
                    <p className="text-xs text-muted-foreground">
                      {r.correctives.map((c) => c.name).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewScreenDialog({
  athleteId,
  onClose,
  onCreated,
}: {
  athleteId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"manual" | "photo">("manual");
  const [batteryId, setBatteryId] = useState<number | null>(null);
  const [date, setDate] = useState(formatISO(new Date(), { representation: "date" }));
  const [notes, setNotes] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [photoRows, setPhotoRows] = useState<PhotoRow[] | null>(null);

  const { data: batteries = [] } = useQuery<Battery[]>({
    queryKey: ["/api/coach/movement-screens/batteries"],
    queryFn: () => getJson("/api/coach/movement-screens/batteries"),
  });
  const { data: batteryDetail } = useQuery<{ battery: Battery; tests: BatteryTest[] }>({
    queryKey: [`/api/coach/movement-screens/batteries/${batteryId}`],
    queryFn: () => getJson(`/api/coach/movement-screens/batteries/${batteryId}`),
    enabled: batteryId != null,
  });

  const analyze = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/coach/movement-screens/batteries/${batteryId}/analyze-photo`, {
        images: photos,
      });
      return res.json() as Promise<{ rows: PhotoRow[] }>;
    },
    onSuccess: (result) => setPhotoRows(result.rows),
    onError: (err: ApiError) => toast.error(err.message || "Couldn't read that photo"),
  });

  const create = useMutation({
    mutationFn: async () => {
      const manualRows: PhotoRow[] = (batteryDetail?.tests ?? []).flatMap((t) => {
        if (t.side === "bilateral") {
          const raw = scores[t.testKey];
          if (!raw) return [];
          return [
            { testKey: t.testKey, label: t.label, category: t.category, scoreType: t.scoreType, unitLabel: t.unitLabel, side: null, scoreValue: Number(raw), notes: null },
          ];
        }
        const out: PhotoRow[] = [];
        const left = scores[`${t.testKey}:left`];
        const right = scores[`${t.testKey}:right`];
        if (left) {
          out.push({ testKey: t.testKey, label: t.label, category: t.category, scoreType: t.scoreType, unitLabel: t.unitLabel, side: "left", scoreValue: Number(left), notes: null });
        }
        if (right) {
          out.push({ testKey: t.testKey, label: t.label, category: t.category, scoreType: t.scoreType, unitLabel: t.unitLabel, side: "right", scoreValue: Number(right), notes: null });
        }
        return out;
      });
      const results = mode === "photo" && photoRows ? photoRows : manualRows;
      if (results.length === 0) throw new Error("Enter at least one score first");
      const res = await apiRequest("POST", `/api/coach/roster/${athleteId}/movement-screens`, {
        batteryId,
        date,
        captureMethod: mode === "photo" ? "photo_import" : "manual",
        notes: notes.trim() || null,
        results,
      });
      return res.json();
    },
    onSuccess: () => {
      toast.success("Screen saved");
      onCreated();
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that screen"),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Movement Screen</DialogTitle>
          <DialogDescription>Pick a battery, then enter scores by hand or import a photo of a filled-out sheet.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Battery</Label>
              <Select value={batteryId?.toString() ?? ""} onValueChange={(v) => { setBatteryId(Number(v)); setPhotoRows(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a battery" />
                </SelectTrigger>
                <SelectContent>
                  {batteries.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.isForgeOfficial ? "FORGE -- " : ""}
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {batteryId != null && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode("manual")}>
                <PenLine className="h-3.5 w-3.5" />
                Manual entry
              </Button>
              <Button type="button" size="sm" variant={mode === "photo" ? "default" : "outline"} onClick={() => setMode("photo")}>
                <Camera className="h-3.5 w-3.5" />
                Photo import
              </Button>
            </div>
          )}

          {batteryId != null && mode === "manual" && batteryDetail && (
            <div className="space-y-3">
              {batteryDetail.tests.map((t) => (
                <div key={t.testKey} className="rounded-md border border-border p-3">
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.category} &middot; scored in {resolveMovementScreenUnitLabel(t.scoreType, t.unitLabel)}</p>
                  {t.side === "bilateral" ? (
                    <Input
                      className="mt-2"
                      type="number"
                      step="0.1"
                      placeholder="Score"
                      value={scores[t.testKey] ?? ""}
                      onChange={(e) => setScores((s) => ({ ...s, [t.testKey]: e.target.value }))}
                    />
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Left"
                        value={scores[`${t.testKey}:left`] ?? ""}
                        onChange={(e) => setScores((s) => ({ ...s, [`${t.testKey}:left`]: e.target.value }))}
                      />
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Right"
                        value={scores[`${t.testKey}:right`] ?? ""}
                        onChange={(e) => setScores((s) => ({ ...s, [`${t.testKey}:right`]: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {batteryId != null && mode === "photo" && (
            <div className="space-y-3">
              <PhotoUploadField images={photos} onChange={setPhotos} maxImages={2} document />
              <Button type="button" size="sm" onClick={() => analyze.mutate()} disabled={photos.length === 0 || analyze.isPending}>
                {analyze.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Read photo
              </Button>
              {photoRows && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review before saving</p>
                  {photoRows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                      <span>
                        {r.label}
                        {r.side ? ` (${r.side})` : ""}
                      </span>
                      <Input
                        type="number"
                        step="0.1"
                        className="w-24"
                        value={r.scoreValue}
                        onChange={(e) =>
                          setPhotoRows((rows) =>
                            rows!.map((row, ri) => (ri === i ? { ...row, scoreValue: Number(e.target.value) } : row)),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Session notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => create.mutate()} disabled={create.isPending || batteryId == null}>
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save Screen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
