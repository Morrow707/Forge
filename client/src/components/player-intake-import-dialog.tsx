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
import { Copy, Check } from "lucide-react";

type Row = {
  name: string;
  heightIn?: number | null;
  bodyWeightLbs?: number | null;
  age?: number | null;
  gender?: "male" | "female" | "non_binary" | "prefer_not_to_say" | null;
  sport?: string | null;
  position?: string | null;
};

type CreatedSlot = { id: number; name: string; claimCode: string };

/** Photo of a mass tryout/registration sheet -> creates PROVISIONAL roster
 * slots, not live accounts (see provisionalAthletes' schema comment: there
 * is no path today for a coach to create a login-capable account on
 * someone else's behalf). Each row gets a claim code the coach hands back
 * to that athlete, who finishes signup themselves at /claim/:code whenever
 * they get to a phone -- their profile comes pre-filled, no coachCode step
 * needed since the coach link is already implied by the slot they're
 * claiming. */
export function PlayerIntakeImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<PhotoImportStep | "done">("capture");
  const [images, setImages] = useState<CapturedPhoto[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [created, setCreated] = useState<CreatedSlot[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  function reset() {
    setStep("capture");
    setImages([]);
    setRows([]);
    setCreated([]);
  }

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setStep("analyzing");
      const res = await apiRequest("POST", "/api/coach/roster/player-intake/analyze-photo", { images });
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

  const readyRows = rows.filter((r) => r.name.trim().length > 0);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/roster/player-intake/apply", { rows: readyRows });
      return res.json() as Promise<CreatedSlot[]>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster/provisional"] });
      toast.success(`Created ${data.length} claim code${data.length === 1 ? "" : "s"}`);
      setCreated(data);
      setStep("done");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not create roster slots"),
  });

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function copyClaimUrl(slot: CreatedSlot) {
    const url = `${window.location.origin}/claim/${slot.claimCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(slot.id);
      setTimeout(() => setCopiedId((c) => (c === slot.id ? null : c)), 1500);
    });
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
          <DialogTitle>Import Player Intake Sheet</DialogTitle>
          <DialogDescription>
            Photograph a tryout/sign-up sheet -- each person gets a claim code to finish their own signup with.
          </DialogDescription>
        </DialogHeader>

        {(step === "capture" || step === "analyzing") && (
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
        )}

        {step === "review" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {readyRows.length} of {rows.length} row{rows.length === 1 ? "" : "s"} have a name and are ready.
            </p>
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-3">
                  <Input
                    className="h-8 text-xs font-medium"
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    placeholder="Name"
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      placeholder="Height (in)"
                      value={row.heightIn ?? ""}
                      onChange={(e) => updateRow(i, { heightIn: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      placeholder="Weight (lbs)"
                      value={row.bodyWeightLbs ?? ""}
                      onChange={(e) =>
                        updateRow(i, { bodyWeightLbs: e.target.value === "" ? null : Number(e.target.value) })
                      }
                    />
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      placeholder="Age"
                      value={row.age ?? ""}
                      onChange={(e) => updateRow(i, { age: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                    <Select
                      value={row.gender ?? "unset"}
                      onValueChange={(v) => updateRow(i, { gender: v === "unset" ? null : (v as Row["gender"]) })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">--</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="non_binary">Non-binary</SelectItem>
                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Sport"
                      value={row.sport ?? ""}
                      onChange={(e) => updateRow(i, { sport: e.target.value })}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Position"
                      value={row.position ?? ""}
                      onChange={(e) => updateRow(i, { position: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Hand each person their claim link -- they finish signup themselves and it links to you automatically.
            </p>
            <div className="space-y-2">
              {created.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{slot.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{slot.claimCode}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => copyClaimUrl(slot)}>
                    {copiedId === slot.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === slot.id ? "Copied" : "Copy Link"}
                  </Button>
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
                  ? "Creating..."
                  : `Create ${readyRows.length} Claim Code${readyRows.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
