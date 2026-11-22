import { useState } from "react";
import { COACH_COPPA_ATTESTATION, needsCoppaAttestation } from "@shared/coach-attestation";
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
import { useT } from "@/i18n";

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
  const t = useT();
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
    setAttested(false);
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
      toast.error(err.message || t("Couldn't read that photo"));
      setStep("capture");
    },
  });

  const readyRows = rows.filter((r) => r.name.trim().length > 0);
  // Shown, not assumed. A Tier 1 account has no verified-parent step anywhere -- the coach
  // relaying a parent's permission IS the consent it rests on -- and an attestation nobody was
  // asked to read is a weaker record than one presented as a tick with the words next to it.
  // Only when the batch actually contains an under-13, so the ordinary import is untouched.
  const under13 = readyRows.filter((r) => needsCoppaAttestation({ age: r.age }));
  const [attested, setAttested] = useState(false);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/roster/player-intake/apply", {
        rows: readyRows,
        coppaAttested: attested,
      });
      return res.json() as Promise<CreatedSlot[]>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster/provisional"] });
      toast.success(t.plural(data.length, "Created {count} claim code", "Created {count} claim codes"));
      setCreated(data);
      setStep("done");
    },
    onError: (err: ApiError) => toast.error(err.message || t("Could not create roster slots")),
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
          <DialogTitle>{t("Import Player Intake Sheet")}</DialogTitle>
          <DialogDescription>
            {t("Photograph a tryout/sign-up sheet, each person gets a claim code to finish their own signup with.")}
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
              {analyzeMutation.isPending ? t("Reading photo...") : t("Read Photo")}
            </Button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t.plural(rows.length, "{ready} of {count} row have a name and are ready.", "{ready} of {count} rows have a name and are ready.", { ready: readyRows.length })}
            </p>
            {under13.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold">
                  {under13.length === 1
                    ? t("{name} is under 13.", { name: under13[0]!.name.trim() || t("One athlete") })
                    : t("{count} of these athletes are under 13.", { count: under13.length })}
                </p>
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                  {COACH_COPPA_ATTESTATION}
                </p>
                <label className="flex items-start gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={attested}
                    onChange={(e) => setAttested(e.target.checked)}
                  />
                  <span>{t("I confirm the above.")}</span>
                </label>
              </div>
            )}
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-3">
                  <Input
                    className="h-8 text-xs font-medium"
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    placeholder={t("Name")}
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      placeholder={t("Height (in)")}
                      value={row.heightIn ?? ""}
                      onChange={(e) => updateRow(i, { heightIn: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      placeholder={t("Weight (lbs)")}
                      value={row.bodyWeightLbs ?? ""}
                      onChange={(e) =>
                        updateRow(i, { bodyWeightLbs: e.target.value === "" ? null : Number(e.target.value) })
                      }
                    />
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      placeholder={t("Age")}
                      value={row.age ?? ""}
                      onChange={(e) => updateRow(i, { age: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                    <Select
                      value={row.gender ?? "unset"}
                      onValueChange={(v) => updateRow(i, { gender: v === "unset" ? null : (v as Row["gender"]) })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={t("Gender")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">--</SelectItem>
                        <SelectItem value="male">{t("Male")}</SelectItem>
                        <SelectItem value="female">{t("Female")}</SelectItem>
                        <SelectItem value="non_binary">{t("Non-binary")}</SelectItem>
                        <SelectItem value="prefer_not_to_say">{t("Prefer not to say")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder={t("Sport")}
                      value={row.sport ?? ""}
                      onChange={(e) => updateRow(i, { sport: e.target.value })}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder={t("Position")}
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
              {t("Hand each person their claim link, they finish signup themselves and it links to you automatically.")}
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
                    {copiedId === slot.id ? t("Copied") : t("Copy Link")}
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
                {t("Back")}
              </Button>
              <Button
                type="button"
                disabled={
                  readyRows.length === 0 ||
                  applyMutation.isPending ||
                  (under13.length > 0 && !attested)
                }
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending
                  ? t("Creating...")
                  : t.plural(readyRows.length, "Create {count} Claim Code", "Create {count} Claim Codes")}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t("Done")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
