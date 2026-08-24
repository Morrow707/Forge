import { useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Moon,
  Activity,
  Brain,
  Droplets,
  Focus,
  Pencil,
  X,
  HeartPulse,
  Watch,
  RefreshCw,
  Gauge,
} from "lucide-react";
import {
  SORENESS_SCALE,
  STRESS_SCALE,
  HYDRATION_SCALE,
  MENTAL_FOCUS_SCALE,
  BODY_PAIN_PARTS,
  computeReadiness,
  READINESS_LABEL,
} from "@shared/wellness";
import {
  isNativeHealthSupported,
  isHealthSyncEnabled,
  enableHealthSync,
  promptHealthSyncOnce,
  fetchLatestHealthSnapshot,
  fetchTodaysHeartRateRecovery,
} from "@/lib/native-health";

type WellnessCheckin = {
  id: number;
  date: string;
  sleepHours: number;
  soreness: number;
  stress: number;
  hydration: number;
  mentalFocus: number;
  bodyPainMap: string[];
  restingHeartRate: number | null;
  hrv: number | null;
  vo2Max: number | null;
  respiratoryRate: number | null;
  bodyMass: number | null;
  heartRateRecovery: number | null;
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
  const [restingHeartRate, setRestingHeartRate] = useState<number | null>(null);
  const [hrv, setHrv] = useState<number | null>(null);
  const [vo2Max, setVo2Max] = useState<number | null>(null);
  const [respiratoryRate, setRespiratoryRate] = useState<number | null>(null);
  const [bodyMass, setBodyMass] = useState<number | null>(null);
  const [heartRateRecovery, setHeartRateRecovery] = useState<number | null>(null);

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
      setRestingHeartRate(data.restingHeartRate);
      setHrv(data.hrv);
      setVo2Max(data.vo2Max);
      setRespiratoryRate(data.respiratoryRate);
      setBodyMass(data.bodyMass);
      setHeartRateRecovery(data.heartRateRecovery);
    }
  }, [data]);

  // Tracks the sleep-hours string we last set *from Health*, so a refresh
  // can tell "still whatever Health said last time" (safe to overwrite)
  // apart from "the athlete typed over it" (never touch again this
  // session). restingHeartRate/hrv have no manual input in this form, so
  // they carry no equivalent risk and always take the freshest reading.
  const lastSyncedSleep = useRef<string | null>(null);
  // syncFromHealth runs from a setInterval/resume-listener closure set up
  // once per mount (see the effect below) -- it needs the *current*
  // sleepHours to check against, not whatever sleepHours was when that
  // closure was created, so it reads through a ref kept fresh here rather
  // than the state variable directly.
  const sleepHoursRef = useRef(sleepHours);
  useEffect(() => {
    sleepHoursRef.current = sleepHours;
  }, [sleepHours]);

  async function syncFromHealth() {
    if (!isHealthSyncEnabled()) return;
    const [snapshot, hrr] = await Promise.all([
      fetchLatestHealthSnapshot(),
      fetchTodaysHeartRateRecovery(),
    ]);
    if (
      snapshot.sleepHours != null &&
      (lastSyncedSleep.current == null || sleepHoursRef.current === lastSyncedSleep.current)
    ) {
      lastSyncedSleep.current = String(snapshot.sleepHours);
      setSleepHours(String(snapshot.sleepHours));
    }
    if (snapshot.restingHeartRate != null) setRestingHeartRate(snapshot.restingHeartRate);
    if (snapshot.hrv != null) setHrv(snapshot.hrv);
    if (snapshot.vo2Max != null) setVo2Max(snapshot.vo2Max);
    if (snapshot.respiratoryRate != null) setRespiratoryRate(snapshot.respiratoryRate);
    if (snapshot.bodyMass != null) setBodyMass(snapshot.bodyMass);
    if (hrr != null) setHeartRateRecovery(hrr.hrrBpm);
  }

  // Explicit "Sync" tap -- unlike the automatic pull above, this works
  // any time, including after today's check-in is already submitted,
  // where the automatic effect deliberately goes quiet (see its own
  // comment). Prompts for Health access on the spot if it was never
  // granted, rather than requiring a trip to Notification Settings first,
  // since tapping a button labeled "Sync" is as explicit an ask as the
  // permission prompt itself.
  const [manualSyncing, setManualSyncing] = useState(false);
  async function handleManualSync() {
    setManualSyncing(true);
    try {
      if (!isHealthSyncEnabled()) await enableHealthSync();
      await syncFromHealth();
      toast.success("Synced with Apple Health");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't sync with Health");
    } finally {
      setManualSyncing(false);
    }
  }

  // Nothing on file yet for today -- ask for Health access right here, the
  // first time it's actually relevant, instead of making the athlete find
  // a checkbox in settings first (same "ask in context" shape as the rest
  // of the app's permission prompts). Then pre-fill, and keep pre-filling:
  // a poll every few minutes plus a refresh on every app-foreground catches
  // a watch that finishes syncing to the phone after this screen already
  // opened, without needing true OS-level background execution (which
  // would need native Swift + HealthKit background delivery this plugin
  // doesn't expose over its JS bridge).
  useEffect(() => {
    if (data || isLoading || !isNativeHealthSupported()) return;
    let cancelled = false;

    (async () => {
      await promptHealthSyncOnce();
      if (!cancelled) await syncFromHealth();
    })();

    const interval = setInterval(() => void syncFromHealth(), 5 * 60 * 1000);
    const resumeListener = App.addListener("resume", () => void syncFromHealth());

    return () => {
      cancelled = true;
      clearInterval(interval);
      resumeListener.then((l) => l.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isLoading]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/athlete/wellness", {
        sleepHours: Number(sleepHours),
        soreness,
        stress,
        hydration,
        mentalFocus,
        bodyPainMap,
        restingHeartRate,
        hrv,
        vo2Max,
        respiratoryRate,
        bodyMass,
        heartRateRecovery,
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
      <div className="flex gap-2">
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
            {data.restingHeartRate != null && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <HeartPulse className="h-3.5 w-3.5 shrink-0" /> {Math.round(data.restingHeartRate)} bpm
                RHR
              </span>
            )}
            {data.hrv != null && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Watch className="h-3.5 w-3.5 shrink-0" /> {Math.round(data.hrv)}ms HRV
              </span>
            )}
            {data.heartRateRecovery != null && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Gauge className="h-3.5 w-3.5 shrink-0" /> {Math.round(data.heartRateRecovery)} bpm
                HRR
              </span>
            )}
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
        {isNativeHealthSupported() && (
          <button
            type="button"
            aria-label="Sync from Health"
            disabled={manualSyncing}
            onClick={() => {
              setEditing(true);
              void handleManualSync();
            }}
            className="flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface px-3 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", manualSyncing && "animate-spin")} />
          </button>
        )}
      </div>
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
        <div className="flex shrink-0 items-center gap-2">
          {isNativeHealthSupported() && (
            <button
              type="button"
              disabled={manualSyncing}
              onClick={() => void handleManualSync()}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", manualSyncing && "animate-spin")} />
              Sync
            </button>
          )}
          {data && (
            <button
              type="button"
              aria-label="Cancel editing"
              onClick={() => setEditing(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
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
          {lastSyncedSleep.current != null && sleepHours === lastSyncedSleep.current && (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Watch className="h-3 w-3" /> Synced from Health -- edit if this looks off
            </p>
          )}
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
      {(restingHeartRate != null || hrv != null || heartRateRecovery != null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-background px-2.5 py-2">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Watch className="h-3 w-3" /> From your watch:
          </span>
          {restingHeartRate != null && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <HeartPulse className="h-3.5 w-3.5 shrink-0" /> {Math.round(restingHeartRate)} bpm
              resting HR
            </span>
          )}
          {hrv != null && (
            <span className="text-xs font-semibold text-foreground">{Math.round(hrv)}ms HRV</span>
          )}
          {heartRateRecovery != null && (
            <span className="text-xs font-semibold text-foreground">
              {Math.round(heartRateRecovery)} bpm HRR
            </span>
          )}
        </div>
      )}
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
