import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Moon, Activity, Brain, Droplets, Focus, Pencil, X } from "lucide-react";
import {
  SORENESS_SCALE,
  STRESS_SCALE,
  HYDRATION_SCALE,
  MENTAL_FOCUS_SCALE,
  BODY_PAIN_PARTS,
  computeReadiness,
  READINESS_LABEL,
} from "@shared/wellness";

type WellnessCheckin = {
  id: number;
  date: string;
  sleepHours: number;
  soreness: number;
  stress: number;
  hydration: number;
  mentalFocus: number;
  bodyPainMap: string[];
  onPeriod: boolean;
} | null;

/** Inline, always-editable check-in card for today's training session --
 * not a blocking gate. Renders a one-line summary once submitted (tap to
 * edit, in case an athlete under- or over-estimated how sore or stressed
 * they were), or the open form when there's nothing on file yet. Never
 * blocks the rest of the page: the workout underneath is fully usable
 * either way. The 0-100 readiness score and its inputs always show in the
 * collapsed summary; the body-part pain map is deliberately left out of it
 * and only ever appears in the expanded edit form. */
export function WellnessGate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery<WellnessCheckin>({
    queryKey: ["/api/athlete/wellness/today"],
    queryFn: () => getJson("/api/athlete/wellness/today"),
  });

  const [editing, setEditing] = useState(false);
  const [sleepHours, setSleepHours] = useState("");
  const [soreness, setSoreness] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [hydration, setHydration] = useState<number | null>(null);
  const [mentalFocus, setMentalFocus] = useState<number | null>(null);
  const [bodyPainMap, setBodyPainMap] = useState<string[]>([]);
  const [onPeriod, setOnPeriod] = useState(false);

  // Anyone who hasn't told us they're male gets the option -- gender is
  // self-reported and non-binary/prefer-not-to-say/not-set athletes may
  // still menstruate, so excluding anyone but an explicit "male" answer is
  // the least presumptuous default. See onPeriod's own comment in
  // shared/schema.ts for why this never reaches the athlete's coach.
  const showPeriodToggle = user?.gender !== "male";

  // Re-sync the editable fields from whatever's on file whenever it
  // changes (first load, or right after a save) so opening the editor
  // shows the athlete's actual answers rather than blanks.
  useEffect(() => {
    if (data) {
      setSleepHours(String(data.sleepHours));
      setSoreness(data.soreness);
      setStress(data.stress);
      setHydration(data.hydration);
      setMentalFocus(data.mentalFocus);
      setBodyPainMap(data.bodyPainMap);
      setOnPeriod(data.onPeriod);
    }
  }, [data]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/athlete/wellness", {
        sleepHours: Number(sleepHours),
        soreness,
        stress,
        hydration,
        mentalFocus,
        bodyPainMap,
        onPeriod,
      });
      return res.json();
    },
    onSuccess: (checkin) => {
      qc.setQueryData(["/api/athlete/wellness/today"], checkin);
      // The very first submission of the day may have just started a CARA
      // training-time session server-side -- refetch so the timer widget
      // picks it up immediately instead of waiting up to 30s for its own
      // poll.
      qc.invalidateQueries({ queryKey: ["/api/athlete/cara/status"] });
      toast.success(data ? "Check-in updated" : "Thanks -- have a great session");
      setEditing(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save your check-in"),
  });

  if (isLoading) return null;

  const sleepValue = Number(sleepHours);
  const canSubmit =
    sleepHours.trim() !== "" &&
    !Number.isNaN(sleepValue) &&
    sleepValue >= 0 &&
    sleepValue <= 24 &&
    soreness != null &&
    stress != null &&
    hydration != null &&
    mentalFocus != null;

  if (data && !editing) {
    const { score, level } = computeReadiness(data);
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/40"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            {score}/100
            <span className="font-semibold text-muted-foreground">{READINESS_LABEL[level]}</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Moon className="h-3.5 w-3.5 shrink-0" /> {data.sleepHours}h sleep
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Activity className="h-3.5 w-3.5 shrink-0" />
            {SORENESS_SCALE.find((s) => s.value === data.soreness)?.label}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Brain className="h-3.5 w-3.5 shrink-0" />
            {STRESS_SCALE.find((s) => s.value === data.stress)?.label}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Droplets className="h-3.5 w-3.5 shrink-0" />
            {HYDRATION_SCALE.find((s) => s.value === data.hydration)?.label}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Focus className="h-3.5 w-3.5 shrink-0" />
            {MENTAL_FOCUS_SCALE.find((s) => s.value === data.mentalFocus)?.label}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
          <Pencil className="h-3 w-3" /> Edit
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Daily Check-In
          </p>
          <p className="text-xs text-muted-foreground">
            Takes 20 seconds and helps your coach see how you're recovering.
          </p>
        </div>
        {data && (
          <button
            type="button"
            aria-label="Cancel editing"
            onClick={() => setEditing(false)}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="wellness-sleep" className="flex items-center gap-1.5 text-xs">
            <Moon className="h-3.5 w-3.5" /> Sleep (hrs)
          </Label>
          <Input
            id="wellness-sleep"
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={sleepHours}
            onChange={(e) => setSleepHours(e.target.value)}
            placeholder="e.g. 7.5"
          />
        </div>
        <ScaleField
          label="Soreness"
          icon={Activity}
          scale={SORENESS_SCALE}
          value={soreness}
          onChange={setSoreness}
        />
        <ScaleField
          label="Stress"
          icon={Brain}
          scale={STRESS_SCALE}
          value={stress}
          onChange={setStress}
        />
        <ScaleField
          label="Hydration"
          icon={Droplets}
          scale={HYDRATION_SCALE}
          value={hydration}
          onChange={setHydration}
        />
        <ScaleField
          label="Mental Focus"
          icon={Focus}
          scale={MENTAL_FOCUS_SCALE}
          value={mentalFocus}
          onChange={setMentalFocus}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Anything hurting today? (optional)</Label>
        <div className="flex flex-wrap gap-1.5">
          {BODY_PAIN_PARTS.map((part) => {
            const active = bodyPainMap.includes(part.key);
            return (
              <button
                key={part.key}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setBodyPainMap((prev) =>
                    active ? prev.filter((k) => k !== part.key) : [...prev, part.key],
                  )
                }
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  active
                    ? "border-destructive bg-destructive/15 text-destructive"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                {active ? `${part.label} ✓` : part.label}
              </button>
            );
          })}
        </div>
      </div>
      {showPeriodToggle && (
        <div className="space-y-1.5">
          <Label className="text-xs">On your period today? (optional, private)</Label>
          <button
            type="button"
            aria-pressed={onPeriod}
            onClick={() => setOnPeriod((v) => !v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              onPeriod
                ? "border-destructive bg-destructive/15 text-destructive"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {onPeriod ? "Yes ✓" : "Yes"}
          </button>
          <p className="text-xs text-muted-foreground">
            Only ever factors into your own readiness score -- your coach never sees this answer.
          </p>
        </div>
      )}
      <Button
        className="w-full sm:w-auto"
        disabled={!canSubmit || submitMutation.isPending}
        onClick={() => submitMutation.mutate()}
      >
        {data ? "Update Check-In" : "Submit Check-In"}
      </Button>
    </div>
  );
}

function ScaleField({
  label,
  icon: Icon,
  scale,
  value,
  onChange,
}: {
  label: string;
  icon: typeof Moon;
  scale: { value: number; label: string }[];
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5" /> {label}
      </Label>
      <div className="flex gap-1">
        {scale.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            aria-label={opt.label}
            title={opt.label}
            className={cn(
              "flex-1 rounded-md border py-2 text-xs font-semibold transition-colors",
              value === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {opt.value}
          </button>
        ))}
      </div>
      <p className="h-4 text-xs text-muted-foreground">
        {value != null ? scale.find((s) => s.value === value)?.label : " "}
      </p>
    </div>
  );
}
