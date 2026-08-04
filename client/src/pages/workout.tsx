import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { groupConsecutiveBySupersetGroup, colorForLabel } from "@/lib/supersets";
import { ExerciseVideoThumb } from "@/components/exercise-video";
import { RestTimerControl, type RestTimerHandle } from "@/components/rest-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { WorkoutCommentThread } from "@/components/workout-comment-thread";
import { BarTrackerDialog } from "@/components/bar-tracker-dialog";
import { FormVideoRecorderDialog } from "@/components/form-video-recorder-dialog";
import { extractVideoFrames } from "@/lib/video-frames";
import type { RepMetrics } from "@/lib/bar-tracking";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  dayCacheKey,
  saveDayCache,
  loadDayCache,
  queueLog,
  hasPendingLog,
} from "@/lib/offline-queue";
import {
  ArrowLeft,
  CheckCircle2,
  MoonStar,
  Stethoscope,
  Link2,
  Plus,
  Minus,
  Check,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  WifiOff,
  CloudUpload,
  Camera,
  Video,
  Crown,
  Calculator,
  CalendarRange,
  Layers,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { PublicUser } from "@shared/schema";
import { parseProgression } from "@/lib/progression";
import { PlateCalculatorDialog } from "@/components/plate-calculator-dialog";
import { ReadinessBanner } from "@/components/readiness-banner";

type ExerciseInfo = {
  id: number;
  name: string;
  muscleGroup: string;
  equipment: string;
  instructions: string | null;
  videoUrl: string | null;
  usesWeight: boolean;
  usesBodyweight: boolean;
  usesBand: boolean;
  usesBox: boolean;
};

type WeightUnit = "lbs" | "kg";
type BoxHeightUnit = "in" | "m";
type WeightMode = "numeric" | "bodyweight" | "band" | "box";

type Materials = {
  usesWeight: boolean;
  usesBodyweight: boolean;
  usesBand: boolean;
  usesBox: boolean;
};

// What the exercise's materials say the athlete should log, in the fixed
// order fields are shown -- box always renders alongside weight/band rather
// than replacing them, since a combo movement (dumbbell box step-up) needs
// both a weight and a box height on the same set.
function materialsFrom(ex: ExerciseInfo): Materials {
  return {
    usesWeight: ex.usesWeight,
    usesBodyweight: ex.usesBodyweight,
    usesBand: ex.usesBand,
    usesBox: ex.usesBox,
  };
}

function deriveWeightMode(m: Materials): WeightMode {
  if (m.usesWeight) return "numeric";
  if (m.usesBodyweight) return "bodyweight";
  if (m.usesBand) return "band";
  if (m.usesBox) return "box";
  return "numeric";
}

// Shared by the top "LAST" summary line and the per-set "Last @ X reps"
// history line -- combo movements (weight + box) show both parts together.
function formatLoad(entry: {
  weightMode: WeightMode;
  weight: string | null;
  weightUnit: WeightUnit | null;
  bandColor: string | null;
  boxHeight: string | null;
  boxHeightUnit: BoxHeightUnit | null;
}) {
  const parts: string[] = [];
  if (entry.weightMode === "numeric" && entry.weight) {
    parts.push(`${entry.weight}${entry.weightUnit ? ` ${entry.weightUnit}` : ""}`);
  }
  if (entry.weightMode === "band") {
    parts.push(entry.bandColor ?? entry.weight ?? "Band");
  }
  if (entry.boxHeight) {
    parts.push(`${entry.boxHeight}${entry.boxHeightUnit ? ` ${entry.boxHeightUnit}` : ""} box`);
  }
  return parts.length > 0 ? parts.join(", ") : "Bodyweight";
}

type LastPerformance = {
  date: string;
  sets: number;
  reps: string | null;
  weight: string | null;
  weightMode: WeightMode;
  weightUnit: WeightUnit | null;
  bandColor: string | null;
  boxHeight: string | null;
  boxHeightUnit: BoxHeightUnit | null;
  rpe: number | null;
  suggestion: { text: string; suggestedWeight: number | null } | null;
} | null;

type SetHistoryPoint = {
  date: string;
  reps: string;
  weight: string | null;
  weightMode: WeightMode;
  weightUnit: WeightUnit | null;
  bandColor: string | null;
  boxHeight: string | null;
  boxHeightUnit: BoxHeightUnit | null;
  rpe: number | null;
};

type TrackingLevel = "none" | "bar_path" | "full";

type PrescribedExercise = {
  id: number;
  sets: number;
  reps: string;
  weight: string | null;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
  trackingLevel: TrackingLevel;
  videoCheckEnabled: boolean;
  exercise: ExerciseInfo;
  lastPerformance: LastPerformance;
  setHistory: SetHistoryPoint[];
};

type PrescribedCorrective = {
  id: number;
  sets: number;
  reps: string;
  weight: string | null;
  restSeconds: number | null;
  notes: string | null;
  exercise: ExerciseInfo;
  lastPerformance: LastPerformance;
  setHistory: SetHistoryPoint[];
};

type FormFault = { code: string; label: string };

type SetMetrics = {
  peakVelocityMps: number | null;
  meanVelocityMps: number | null;
  concentricSeconds: number | null;
  eccentricSeconds: number | null;
  barPathDeviationCm: number | null;
  barPathTrace: { t: number; x: number; y: number }[] | null;
  formFaults: FormFault[] | null;
};

type LogEntry = {
  programExerciseId: number | null;
  correctiveId: number | null;
  weightMode: WeightMode;
  rpe: number | null;
  notes: string | null;
  sets: ({
    setNumber: number;
    reps: string | null;
    weight: string | null;
    bandColor: string | null;
    boxHeight: string | null;
    boxHeightUnit: BoxHeightUnit | null;
  } & Partial<SetMetrics>)[];
};

type DayDetail = {
  programId: number;
  programName: string;
  // Only ever true for an admin's own AI-built program (see the schema
  // comment on programs.aiAuthored) -- gates the "full function" AI form
  // check on the workout page, since that's the one AI feature in the app
  // that critiques technique with no human review step.
  programAiAuthored: boolean;
  correctivesEnabled: boolean;
  day: {
    id: number;
    title: string;
    isRestDay: boolean;
    weekNumber: number;
    exercises: PrescribedExercise[];
  };
  correctives: PrescribedCorrective[];
  log: { completed: boolean; entries: LogEntry[] } | null;
};

type SetRow = {
  setNumber: number;
  reps: string;
  weight: string;
  bandColor: string;
  boxHeight: string;
  boxHeightUnit: BoxHeightUnit;
} & SetMetrics;

type ItemState = {
  key: string;
  kind: "exercise" | "corrective";
  refId: number;
  exerciseName: string;
  muscleGroup: string;
  equipment: string;
  instructions: string | null;
  videoUrl: string | null;
  prescribedSets: number;
  prescribedReps: string;
  prescribedWeight: string | null;
  restSeconds: number | null;
  coachNotes: string | null;
  supersetGroup: string | null;
  trackingLevel: TrackingLevel;
  videoCheckEnabled: boolean;
  lastPerformance: LastPerformance;
  setHistory: SetHistoryPoint[];
  materials: Materials;
  weightMode: WeightMode;
  athleteNotes: string;
  rpe: string;
  sets: SetRow[];
  weekNumber: number;
};

function buildItem(
  kind: "exercise" | "corrective",
  prescribed: PrescribedExercise | PrescribedCorrective,
  existing: LogEntry | undefined,
  weekNumber: number,
): ItemState {
  const sets: SetRow[] = Array.from({ length: prescribed.sets }, (_, i) => {
    const setNumber = i + 1;
    const existingSet = existing?.sets.find((s) => s.setNumber === setNumber);
    return {
      setNumber,
      reps: existingSet?.reps ?? prescribed.reps,
      weight: existingSet?.weight ?? "",
      bandColor: existingSet?.bandColor ?? "",
      boxHeight: existingSet?.boxHeight ?? "",
      boxHeightUnit: existingSet?.boxHeightUnit ?? "in",
      peakVelocityMps: existingSet?.peakVelocityMps ?? null,
      meanVelocityMps: existingSet?.meanVelocityMps ?? null,
      concentricSeconds: existingSet?.concentricSeconds ?? null,
      eccentricSeconds: existingSet?.eccentricSeconds ?? null,
      barPathDeviationCm: existingSet?.barPathDeviationCm ?? null,
      barPathTrace: existingSet?.barPathTrace ?? null,
      formFaults: existingSet?.formFaults ?? null,
    };
  });
  const materials = materialsFrom(prescribed.exercise);
  return {
    key: `${kind}-${prescribed.id}`,
    kind,
    refId: prescribed.id,
    exerciseName: prescribed.exercise.name,
    muscleGroup: prescribed.exercise.muscleGroup,
    equipment: prescribed.exercise.equipment,
    instructions: prescribed.exercise.instructions,
    videoUrl: prescribed.exercise.videoUrl,
    prescribedSets: prescribed.sets,
    prescribedReps: prescribed.reps,
    prescribedWeight: prescribed.weight,
    restSeconds: prescribed.restSeconds,
    coachNotes: prescribed.notes,
    supersetGroup: kind === "exercise" ? (prescribed as PrescribedExercise).supersetGroup : null,
    trackingLevel: kind === "exercise" ? (prescribed as PrescribedExercise).trackingLevel : "none",
    videoCheckEnabled:
      kind === "exercise" ? (prescribed as PrescribedExercise).videoCheckEnabled : false,
    lastPerformance: prescribed.lastPerformance,
    setHistory: prescribed.setHistory,
    materials,
    weightMode: deriveWeightMode(materials),
    athleteNotes: existing?.notes ?? "",
    rpe: existing?.rpe != null ? String(existing.rpe) : "",
    sets,
    weekNumber,
  };
}

function isSetComplete(item: ItemState, set: SetRow) {
  if (!set.reps.trim()) return false;
  if (item.materials.usesWeight && !set.weight.trim()) return false;
  if (item.materials.usesBand && !set.bandColor.trim()) return false;
  if (item.materials.usesBox && !set.boxHeight.trim()) return false;
  return true;
}

function formatLastPerformance(lp: NonNullable<LastPerformance>) {
  let s = `${lp.sets} × ${lp.reps ?? "-"}`;
  const load = formatLoad(lp);
  if (load !== "Bodyweight") s += ` @ ${load}`;
  if (lp.rpe != null) s += ` · RPE ${lp.rpe}`;
  return s;
}

// Most recent prior set logged at this exact rep count -- a pyramid scheme
// (8/5/3/1) should compare each set against its own rep count, not just the
// first set of the last session.
function findHistoryForReps(history: SetHistoryPoint[], reps: string) {
  const trimmed = reps.trim();
  if (!trimmed) return null;
  return history.find((h) => h.reps.trim() === trimmed) ?? null;
}

// A set is a PR when its weight beats every prior numeric-weight set logged
// at that same rep count -- so one workout can produce several PRs (one per
// rep count), not just one for the whole exercise.
function isRepCountPR(
  history: SetHistoryPoint[],
  reps: string,
  weightMode: WeightMode,
  weight: string,
) {
  if (weightMode !== "numeric") return false;
  const trimmed = reps.trim();
  const currentWeight = parseFloat(weight);
  if (!trimmed || Number.isNaN(currentWeight)) return false;
  const priorWeights = history
    .filter((h) => h.reps.trim() === trimmed && h.weightMode === "numeric" && h.weight)
    .map((h) => parseFloat(h.weight!))
    .filter((w) => !Number.isNaN(w));
  if (priorWeights.length === 0) return false;
  return currentWeight > Math.max(...priorWeights);
}

// Matches a prescribed weight of "70% 1RM", "70%1rm", etc. -- the coach's
// shorthand for "load relative to this athlete's max," not a literal number.
function parsePercentOfOneRm(weightText: string | null) {
  if (!weightText) return null;
  const match = weightText.match(/(\d+(?:\.\d+)?)\s*%\s*1\s*rm/i);
  return match ? parseFloat(match[1]) : null;
}

function parseLiteralWeight(weightText: string) {
  const match = weightText.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

// Leading integer out of a prescribed rep scheme ("5" -> 5, "8-10" -> 8,
// "AMRAP" -> undefined) -- used only to auto-stop the camera tracker once
// that many reps are detected. A soft target: the athlete can always stop
// manually too, and non-numeric schemes just never trigger it.
function parseTargetReps(repsText: string): number | undefined {
  const match = repsText.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

// Epley-estimated 1RM from this athlete's own logged history for the
// exercise, same formula the coach's analytics page uses. Only counts sets
// logged in the athlete's current weight unit -- mixing lbs and kg maxes
// would silently produce a nonsense number.
function estimateOneRmFromHistory(history: SetHistoryPoint[], unit: WeightUnit) {
  let best = 0;
  for (const h of history) {
    if (h.weightMode !== "numeric" || !h.weight || h.weightUnit !== unit) continue;
    const weight = parseFloat(h.weight);
    const reps = parseInt(h.reps, 10);
    if (Number.isNaN(weight) || Number.isNaN(reps) || reps <= 0) continue;
    const oneRm = weight * (1 + reps / 30);
    if (oneRm > best) best = oneRm;
  }
  return best > 0 ? Math.round(best * 10) / 10 : null;
}

type Page = {
  kind: "corrective" | "exercise";
  items: ItemState[];
  labels: Record<string, string>;
};

/** Correctives always form one leading group (like TrainHeroic's A1-A5 block);
 * main exercises follow as their own groups, one per superset chain, continuing
 * the same letter sequence -- e.g. correctives are "A", the first working
 * superset is "B", the next solo lift is "C". */
function buildPages(items: ItemState[]): Page[] {
  const correctiveItems = items.filter((it) => it.kind === "corrective");
  const exerciseItems = items.filter((it) => it.kind === "exercise");
  const exerciseBlocks = groupConsecutiveBySupersetGroup(exerciseItems);

  const pages: Page[] = [];
  let letterIndex = 0;

  function pushBlock(kind: Page["kind"], block: ItemState[]) {
    const letter = String.fromCharCode(65 + letterIndex++);
    const labels: Record<string, string> = {};
    block.forEach((it, i) => {
      labels[it.key] = block.length > 1 ? `${letter}${i + 1}` : letter;
    });
    pages.push({ kind, items: block, labels });
  }

  if (correctiveItems.length > 0) pushBlock("corrective", correctiveItems);
  for (const block of exerciseBlocks) pushBlock("exercise", block);

  return pages;
}

function isPageComplete(page: Page) {
  return page.items.every(
    (it) => it.sets.length > 0 && it.sets.every((s) => isSetComplete(it, s)),
  );
}

function computeStats(items: ItemState[]) {
  let totalReps = 0;
  let totalVolume = 0;
  let totalSets = 0;
  let completeSets = 0;
  for (const item of items) {
    for (const set of item.sets) {
      totalSets++;
      if (isSetComplete(item, set)) completeSets++;
      const repsNum = parseInt(set.reps, 10);
      if (!Number.isNaN(repsNum)) {
        totalReps += repsNum;
        if (item.weightMode === "numeric") {
          const weightNum = parseFloat(set.weight);
          if (!Number.isNaN(weightNum)) totalVolume += repsNum * weightNum;
        }
      }
    }
  }
  return { totalReps, totalVolume, totalSets, completeSets };
}

export function WorkoutPage({
  apiBase,
  routeBase,
  showComments = true,
  showReadinessBanner = true,
}: {
  apiBase: string;
  routeBase: string;
  showComments?: boolean;
  showReadinessBanner?: boolean;
}) {
  const { assignmentId, programDayId, date } = useParams<{
    assignmentId: string;
    programDayId: string;
    date: string;
  }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const dayKey = dayCacheKey(assignmentId, programDayId, date);
  const [offline, setOffline] = useState(false);
  const [pendingSync, setPendingSync] = useState(() => hasPendingLog(dayKey));

  const { data, isLoading } = useQuery<DayDetail>({
    queryKey: [`${apiBase}/day`, assignmentId, programDayId, date],
    queryFn: async () => {
      try {
        const res = await apiRequest(
          "GET",
          `${apiBase}/day?assignmentId=${assignmentId}&programDayId=${programDayId}&date=${date}`,
        );
        const json = await res.json();
        saveDayCache(dayKey, json);
        setOffline(false);
        return json;
      } catch (err) {
        const cached = loadDayCache<DayDetail>(dayKey);
        if (cached) {
          setOffline(true);
          return cached;
        }
        throw err;
      }
    },
    // Workout data (history, PRs, prescriptions) must always reflect the
    // most recent log -- never serve a cached snapshot from before the last
    // completion just because it's still within the default staleTime window.
    staleTime: 0,
    refetchOnMount: "always",
  });

  const [items, setItems] = useState<ItemState[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"overview" | "logging">("overview");
  const restTimerRef = useRef<RestTimerHandle>(null);

  // Keep the screen awake for the length of an active logging session --
  // athletes are usually mid-set with the phone propped up, not holding it.
  useWakeLock(viewMode === "logging");

  function openPage(index: number) {
    setPageIndex(index);
    setViewMode("logging");
  }

  useEffect(() => {
    if (data && !hydrated) {
      const correctiveItems = data.correctives.map((c) =>
        buildItem(
          "corrective",
          c,
          data.log?.entries.find((e) => e.correctiveId === c.id),
          data.day.weekNumber,
        ),
      );
      const exerciseItems = data.day.exercises.map((pe) =>
        buildItem(
          "exercise",
          pe,
          data.log?.entries.find((e) => e.programExerciseId === pe.id),
          data.day.weekNumber,
        ),
      );
      setItems([...correctiveItems, ...exerciseItems]);
      setHydrated(true);
      setPageIndex(0);
    }
  }, [data, hydrated]);

  const unitMutation = useMutation({
    mutationFn: async (unit: "lbs" | "kg") => {
      const res = await apiRequest("PATCH", `${apiBase}/preferences`, {
        preferredWeightUnit: unit,
      });
      return res.json();
    },
    onSuccess: (updatedUser: PublicUser) => {
      qc.setQueryData(["/api/auth/me"], updatedUser);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update preference"),
  });

  const submitMutation = useMutation({
    mutationFn: async (completed: boolean) => {
      const payload = {
        assignmentId: Number(assignmentId),
        programDayId: Number(programDayId),
        date,
        completed,
        entries: items.map((it) => ({
          programExerciseId: it.kind === "exercise" ? it.refId : undefined,
          correctiveId: it.kind === "corrective" ? it.refId : undefined,
          weightMode: it.weightMode,
          rpe: it.rpe ? Number(it.rpe) : null,
          notes: it.athleteNotes || null,
          sets: it.sets.map((s) => ({
            setNumber: s.setNumber,
            reps: s.reps || null,
            weight: s.weight || null,
            bandColor: s.bandColor || null,
            boxHeight: s.boxHeight || null,
            boxHeightUnit: s.boxHeight ? s.boxHeightUnit : null,
            peakVelocityMps: s.peakVelocityMps,
            meanVelocityMps: s.meanVelocityMps,
            concentricSeconds: s.concentricSeconds,
            eccentricSeconds: s.eccentricSeconds,
            barPathDeviationCm: s.barPathDeviationCm,
            barPathTrace: s.barPathTrace,
            formFaults: s.formFaults,
          })),
        })),
      };
      try {
        const res = await apiRequest("POST", `${apiBase}/log`, payload);
        return { synced: true as const, data: await res.json() };
      } catch (err) {
        // A real server rejection (bad data, auth, etc) should surface as
        // an error same as always -- only a genuine network failure gets
        // queued for automatic retry.
        if (err instanceof ApiError) throw err;
        queueLog(dayKey, payload);
        return { synced: false as const, data: null };
      }
    },
    onSuccess: ({ synced }, completed) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/calendar`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/day`] });
      if (synced) {
        setPendingSync(false);
        toast.success(completed ? "Workout marked complete" : "Progress saved");
      } else {
        setPendingSync(true);
        toast.info("You're offline — saved on this device, will sync automatically");
      }
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save workout"),
  });

  function updateItem(key: string, patch: Partial<ItemState>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function updateSet(key: string, setNumber: number, patch: Partial<SetRow>) {
    setItems((prev) => {
      let restOnComplete: number | null = null;
      const next = prev.map((it) => {
        if (it.key !== key) return it;
        return {
          ...it,
          sets: it.sets.map((s) => {
            if (s.setNumber !== setNumber) return s;
            const wasComplete = isSetComplete(it, s);
            const updated = { ...s, ...patch };
            if (!wasComplete && isSetComplete(it, updated)) {
              restOnComplete = it.restSeconds;
            }
            return updated;
          }),
        };
      });
      if (restOnComplete !== null) restTimerRef.current?.autoStart(restOnComplete);
      return next;
    });
  }

  function addSet(key: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const nextNumber = it.sets.length > 0 ? it.sets[it.sets.length - 1].setNumber + 1 : 1;
        return {
          ...it,
          sets: [
            ...it.sets,
            {
              setNumber: nextNumber,
              reps: it.prescribedReps,
              weight: "",
              bandColor: "",
              boxHeight: "",
              boxHeightUnit: it.sets[it.sets.length - 1]?.boxHeightUnit ?? "in",
              peakVelocityMps: null,
              meanVelocityMps: null,
              concentricSeconds: null,
              eccentricSeconds: null,
              barPathDeviationCm: null,
              barPathTrace: null,
              formFaults: null,
            },
          ],
        };
      }),
    );
  }

  function removeSet(key: string) {
    setItems((prev) =>
      prev.map((it) => (it.key === key && it.sets.length > 1 ? { ...it, sets: it.sets.slice(0, -1) } : it)),
    );
  }

  if (isLoading || !data) {
    return (
      <AppShell title="Loading Workout…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  const pages = buildPages(items);
  const currentPage = pages[Math.min(pageIndex, pages.length - 1)];
  const unit = user?.preferredWeightUnit ?? "lbs";
  const stats = computeStats(items);
  // "comment" (coach-assigned programs) posts the video for the coach to
  // review, unchanged from before. "ai" only ever applies to an admin's own
  // AI-authored program (programAiAuthored is never true otherwise -- see
  // the schema comment on programs.aiAuthored) and sends it straight to the
  // AI for direct feedback instead, since there's no coach in that loop.
  const videoCheckMode: "comment" | "ai" | "off" = showComments
    ? "comment"
    : data.programAiAuthored
      ? "ai"
      : "off";

  return (
    <AppShell
      title={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(routeBase)}
            aria-label="Back to calendar"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-6 w-6 md:h-7 md:w-7" />
          </button>
          <span>{format(parseISO(date), "EEEE, MMM d")}</span>
        </div>
      }
      actions={
        <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
          {(["lbs", "kg"] as const).map((u) => (
            <button
              key={u}
              onClick={() => unitMutation.mutate(u)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold uppercase transition-colors",
                unit === u
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {u}
            </button>
          ))}
        </div>
      }
    >
      {(offline || pendingSync) && (
        <div
          className={cn(
            "mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
            offline
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
              : "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          {offline ? (
            <>
              <WifiOff className="h-4 w-4 shrink-0" />
              You're offline — showing your last saved workout.
            </>
          ) : (
            <>
              <CloudUpload className="h-4 w-4 shrink-0" />
              Saved on this device — will sync once you're back online.
            </>
          )}
        </div>
      )}

      <div className="mb-5 flex items-center gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{data.programName}</p>
          <h2 className="font-display text-2xl font-bold uppercase">{data.day.title}</h2>
        </div>
        {data.log?.completed && (
          <Badge variant="success" className="ml-auto">
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            Completed
          </Badge>
        )}
      </div>

      {data.day.isRestDay ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <MoonStar className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Recovery day. Take it easy, hydrate, and stretch.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={cn("space-y-4", viewMode === "logging" && "pb-4")}>
          {stats.totalSets > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex items-baseline gap-8">
                <div>
                  <p className="font-display text-3xl font-extrabold leading-none">
                    {stats.totalReps}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Reps
                  </p>
                </div>
                <div>
                  <p className="font-display text-3xl font-extrabold leading-none">
                    {stats.totalVolume.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    {unit}
                  </p>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-success transition-all"
                  style={{
                    width: `${stats.totalSets ? (stats.completeSets / stats.totalSets) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {viewMode === "overview" ? (
            <div className="space-y-3">
              {showReadinessBanner && <ReadinessBanner date={date} />}
              <p className="text-xs text-muted-foreground">
                Everything for today, A to Z — tap any exercise to prep or start logging.
              </p>
              {pages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nothing prescribed for this day yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {pages.map((page, i) => {
                    const complete = isPageComplete(page);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => openPage(i)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/50",
                          page.kind === "corrective"
                            ? "border-cyan-900/40 bg-cyan-950/10"
                            : "border-border",
                        )}
                      >
                        <ExerciseVideoThumb
                          url={page.items[0].videoUrl}
                          name={page.items[0].exerciseName}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {page.kind === "corrective" && (
                              <Stethoscope className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                            )}
                            {page.items.map((it) => (
                              <span key={it.key} className="flex items-center gap-1 text-sm font-semibold">
                                <span
                                  className={cn(
                                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold",
                                    page.kind === "corrective"
                                      ? "bg-cyan-500 text-white"
                                      : colorForLabel(page.labels[it.key]),
                                  )}
                                >
                                  {page.labels[it.key]}
                                </span>
                                {it.exerciseName}
                              </span>
                            ))}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {page.items.map((it) => it.equipment).join(" · ")}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                            complete
                              ? "border-success bg-success text-success-foreground"
                              : "border-dashed border-muted-foreground/30",
                          )}
                        >
                          {complete && <Check className="h-4 w-4" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {pages.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" className="flex-1" onClick={() => openPage(0)}>
                    Start with {pages[0].kind === "corrective" ? "Correctives" : pages[0].labels[pages[0].items[0].key]}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => submitMutation.mutate(true)}
                    disabled={submitMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Workout Complete
                  </Button>
                </div>
              )}
            </div>
          ) : currentPage ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setViewMode("overview")}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to full workout
              </button>
              {currentPage.kind === "corrective" && (
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-400">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Correctives
                </p>
              )}
              <Card
                className={cn(
                  currentPage.kind === "corrective"
                    ? "border-cyan-900/40 bg-cyan-950/10"
                    : currentPage.items.length > 1
                      ? "border-primary/40"
                      : undefined,
                )}
              >
                <CardContent className="divide-y divide-border p-4">
                  {currentPage.items.map((item, i) => (
                    <div key={item.key} className={i > 0 ? "pt-4" : ""}>
                      <ExerciseLogContent
                        item={item}
                        linked={currentPage.kind === "exercise" && currentPage.items.length > 1}
                        badgeLabel={currentPage.labels[item.key]}
                        unit={unit}
                        assignmentId={Number(assignmentId)}
                        programDayId={Number(programDayId)}
                        apiBase={apiBase}
                        videoCheckMode={videoCheckMode}
                        programId={data.programId}
                        dayTitle={data.day.title}
                        onUpdateItem={(patch) => updateItem(item.key, patch)}
                        onUpdateSet={(setNumber, patch) => updateSet(item.key, setNumber, patch)}
                        onAddSet={() => addSet(item.key)}
                        onRemoveSet={() => removeSet(item.key)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => submitMutation.mutate(false)}
                  disabled={submitMutation.isPending}
                >
                  Save Progress
                </Button>
                {pageIndex < pages.length - 1 ? (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      submitMutation.mutate(false);
                      setPageIndex((p) => p + 1);
                    }}
                    disabled={submitMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete &amp; Next
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      submitMutation.mutate(true);
                      setViewMode("overview");
                    }}
                    disabled={submitMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Workout Complete
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className={cn("mt-4", viewMode === "logging" && pages.length > 0 && "pb-14")}>
        {showComments && (
          <WorkoutCommentThread
            role="athlete"
            assignmentId={Number(assignmentId)}
            programDayId={Number(programDayId)}
          />
        )}
      </div>

      {viewMode === "logging" && pages.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-8">
            <button
              type="button"
              onClick={() =>
                pageIndex === 0 ? setViewMode("overview") : setPageIndex((p) => p - 1)
              }
              className="flex items-center gap-1.5 text-sm font-semibold text-primary"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <RestTimerControl ref={restTimerRef} defaultSeconds={currentPage?.items[0]?.restSeconds} />
            <button
              type="button"
              onClick={() => setPageIndex((p) => Math.min(pages.length - 1, p + 1))}
              disabled={pageIndex === pages.length - 1}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary disabled:pointer-events-none disabled:opacity-30"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ExerciseLogContent({
  item,
  linked,
  badgeLabel,
  unit,
  assignmentId,
  programDayId,
  apiBase,
  videoCheckMode,
  programId,
  dayTitle,
  onUpdateItem,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
}: {
  item: ItemState;
  linked: boolean;
  badgeLabel: string;
  unit: "lbs" | "kg";
  assignmentId: number;
  programDayId: number;
  apiBase: string;
  videoCheckMode: "comment" | "ai" | "off";
  programId: number;
  dayTitle: string;
  onUpdateItem: (patch: Partial<ItemState>) => void;
  onUpdateSet: (setNumber: number, patch: Partial<SetRow>) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
}) {
  const isCorrective = item.kind === "corrective";
  const [trackingSet, setTrackingSet] = useState<number | null>(null);
  const [formVideoOpen, setFormVideoOpen] = useState(false);
  const [plateCalcOpen, setPlateCalcOpen] = useState(false);
  const topSetWeight = Math.max(0, ...item.sets.map((s) => parseFloat(s.weight) || 0));
  // One column per material the exercise actually needs -- not mutually
  // exclusive, so a combo movement (dumbbell box step-up) shows both a
  // weight column and a box-height column on the same row.
  const valueColumns: { type: "weight" | "band" | "box"; label: string }[] = [
    ...(item.materials.usesWeight ? [{ type: "weight" as const, label: unit }] : []),
    ...(item.materials.usesBand ? [{ type: "band" as const, label: "Band" }] : []),
    ...(item.materials.usesBox ? [{ type: "box" as const, label: "Box" }] : []),
  ];
  const isBodyweightOnly = valueColumns.length === 0;
  const gridTemplate = `2.25rem 1fr repeat(${Math.max(valueColumns.length, 1)}, 1fr) 2rem`;
  const currentBoxUnit = item.sets[0]?.boxHeightUnit ?? "in";
  const qc = useQueryClient();
  const progression = parseProgression(item.prescribedWeight);
  const weeksElapsed = Math.max(0, item.weekNumber - 1);
  const baseWeightText = progression ? progression.baseText : item.prescribedWeight;
  const basePercentOfOneRm = parsePercentOfOneRm(baseWeightText);
  // Percent-of-1RM progressions shift the percentage itself (e.g. 70% ->
  // 72% in week 2); a flat lbs/kg increment doesn't make sense against a
  // percent base, so it's ignored rather than producing a nonsense number.
  const percentOfOneRm =
    basePercentOfOneRm != null && progression?.isPercent
      ? basePercentOfOneRm + progression.amount * weeksElapsed
      : basePercentOfOneRm;
  const estimatedOneRm =
    percentOfOneRm != null ? estimateOneRmFromHistory(item.setHistory, unit) : null;
  const suggestedFromOneRm =
    estimatedOneRm != null ? Math.round((percentOfOneRm! / 100) * estimatedOneRm) : null;
  // Literal-number progression (e.g. "225 lbs +5 lbs/week") -- only applies
  // when the base isn't a %1RM expression, which is handled above instead.
  const literalBase =
    basePercentOfOneRm == null && baseWeightText ? parseLiteralWeight(baseWeightText) : null;
  const progressionIncrementLabel = progression
    ? progression.isPercent
      ? `${progression.amount}%`
      : `${progression.amount} ${unit}`
    : null;
  const suggestedFromProgression =
    literalBase != null && progression
      ? Math.round(
          (literalBase +
            (progression.isPercent
              ? literalBase * (progression.amount / 100) * weeksElapsed
              : progression.amount * weeksElapsed)) *
            10,
        ) / 10
      : null;
  const commentsPath = `${apiBase}/assignments/${assignmentId}/days/${programDayId}/comments`;
  const postFormVideoMutation = useMutation({
    mutationFn: async (videoUrl: string) => {
      const res = await apiRequest("POST", commentsPath, {
        body: `Form check: ${item.exerciseName}`,
        videoUrl,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [commentsPath] });
      toast.success("Form check video sent to your coach");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not attach video"),
  });

  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const aiFormCheckPath = `/api/admin/programs/${programId}/form-check`;
  const aiFormCheckMutation = useMutation({
    mutationFn: async (videoUrl: string) => {
      const images = await extractVideoFrames(videoUrl);
      // No formal link between a form-check video and a specific set number
      // (the record button lives at the exercise level) -- the most
      // recently camera-tracked set for this exercise is the closest real
      // signal available, so it rides along as grounding context when one
      // exists.
      const trackedSet = [...item.sets]
        .reverse()
        .find((s) => s.peakVelocityMps != null || s.barPathDeviationCm != null);
      const res = await apiRequest("POST", aiFormCheckPath, {
        exerciseName: item.exerciseName,
        images,
        trackedMetrics: trackedSet
          ? {
              peakVelocityMps: trackedSet.peakVelocityMps,
              meanVelocityMps: trackedSet.meanVelocityMps,
              concentricSeconds: trackedSet.concentricSeconds,
              eccentricSeconds: trackedSet.eccentricSeconds,
              barPathDeviationCm: trackedSet.barPathDeviationCm,
              formFaults: trackedSet.formFaults,
            }
          : undefined,
      });
      return res.json() as Promise<{ assistantMessage: { content: string } }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [`/api/admin/programs/${programId}/chat`] });
      setAiFeedback(result.assistantMessage.content);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not get AI feedback on that video"),
  });

  const [swapOpen, setSwapOpen] = useState(false);
  const [swapReason, setSwapReason] = useState<string | null>(null);
  const [swapNotes, setSwapNotes] = useState("");
  const swapMutation = useMutation({
    mutationFn: async () => {
      const reasonText = swapReason ?? "the user just doesn't want to do it today";
      const content = `Swap "${item.exerciseName}" in Week ${item.weekNumber}, "${dayTitle}" (today's session) for a suitable alternative. Reason: ${reasonText}${swapNotes.trim() ? ` -- ${swapNotes.trim()}` : ""}. Only change this one exercise in this specific day; leave every other week and day exactly as they are.`;
      const res = await apiRequest("POST", `/api/admin/programs/${programId}/chat`, { content });
      return res.json() as Promise<{ assistantMessage: { content: string } }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/day`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/programs/${programId}/chat`] });
      toast.success(result.assistantMessage.content);
      setSwapOpen(false);
      setSwapReason(null);
      setSwapNotes("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not ask the AI to swap that"),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <ExerciseVideoThumb url={item.videoUrl} name={item.exerciseName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                  isCorrective ? "bg-cyan-500 text-white" : colorForLabel(badgeLabel),
                )}
              >
                {badgeLabel}
              </span>
              <p className="truncate font-semibold">{item.exerciseName}</p>
              {linked && <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant="outline">{item.muscleGroup}</Badge>
              {videoCheckMode === "ai" && (
                <button
                  type="button"
                  aria-label={`Ask AI to swap ${item.exerciseName}`}
                  title="Ask AI to swap this exercise"
                  onClick={() => setSwapOpen(true)}
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Prescribed: {item.prescribedSets} × {item.prescribedReps}
            {item.prescribedWeight ? ` @ ${item.prescribedWeight}` : ""}
            {suggestedFromOneRm != null ? ` (≈ ${suggestedFromOneRm} ${unit})` : ""}
            {suggestedFromOneRm == null && suggestedFromProgression != null
              ? ` (≈ ${suggestedFromProgression} ${unit})`
              : ""}
            {item.restSeconds ? ` · Rest ${item.restSeconds}s` : ""}
          </p>
          {item.lastPerformance && (
            <p className="text-xs font-semibold text-muted-foreground">
              <span className="text-primary">LAST</span> {formatLastPerformance(item.lastPerformance)}
            </p>
          )}
          {suggestedFromOneRm != null && item.weightMode === "numeric" && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
              <Calculator className="h-3 w-3 shrink-0 text-blue-500" />
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {percentOfOneRm}% of your {estimatedOneRm} {unit} 1RM ≈ {suggestedFromOneRm} {unit}
                {progression && ` (Week ${item.weekNumber}, +${progressionIncrementLabel}/week)`}
              </span>
              <button
                type="button"
                onClick={() => {
                  const value = String(suggestedFromOneRm);
                  for (const set of item.sets) onUpdateSet(set.setNumber, { weight: value });
                }}
                className="font-semibold text-primary hover:underline"
              >
                Use
              </button>
            </div>
          )}
          {suggestedFromProgression != null && item.weightMode === "numeric" && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
              <CalendarRange className="h-3 w-3 shrink-0 text-blue-500" />
              <span className="font-medium text-blue-600 dark:text-blue-400">
                Week {item.weekNumber} progression (+{progressionIncrementLabel}/week) ≈{" "}
                {suggestedFromProgression} {unit}
              </span>
              <button
                type="button"
                onClick={() => {
                  const value = String(suggestedFromProgression);
                  for (const set of item.sets) onUpdateSet(set.setNumber, { weight: value });
                }}
                className="font-semibold text-primary hover:underline"
              >
                Use
              </button>
            </div>
          )}
          {item.lastPerformance?.suggestion && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
              <TrendingUp className="h-3 w-3 shrink-0 text-amber-500" />
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {item.lastPerformance.suggestion.text}
              </span>
              {item.lastPerformance.suggestion.suggestedWeight != null &&
                item.weightMode === "numeric" && (
                  <button
                    type="button"
                    onClick={() => {
                      const value = String(item.lastPerformance!.suggestion!.suggestedWeight);
                      for (const set of item.sets) onUpdateSet(set.setNumber, { weight: value });
                    }}
                    className="font-semibold text-primary hover:underline"
                  >
                    Use
                  </button>
                )}
            </div>
          )}
        </div>
      </div>

      {item.coachNotes && (
        <p className="rounded-md bg-surface-elevated p-2 text-xs text-muted-foreground">
          Coach note: {item.coachNotes}
        </p>
      )}
      {item.instructions && (
        <p className="text-xs text-muted-foreground">{item.instructions}</p>
      )}

      {item.videoCheckEnabled && videoCheckMode !== "off" && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
            {videoCheckMode === "ai" && <Sparkles className="h-3.5 w-3.5 shrink-0" />}
            {videoCheckMode === "ai"
              ? "Get an AI form check on this exercise"
              : "Your coach wants a form check video for this exercise"}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setFormVideoOpen(true)}
            disabled={aiFormCheckMutation.isPending}
          >
            <Video className="h-3.5 w-3.5" />
            {aiFormCheckMutation.isPending ? "Analyzing…" : "Record / Upload"}
          </Button>
        </div>
      )}

      <div>
        <div
          className="grid items-center gap-2 px-0.5 pb-1"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Set</span>
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Reps</span>
          {isBodyweightOnly ? (
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Bodyweight
            </span>
          ) : (
            valueColumns.map((col) => (
              <div key={col.type} className="flex items-center gap-1">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {col.label}
                </span>
                {col.type === "weight" && (
                  <button
                    type="button"
                    onClick={() => setPlateCalcOpen(true)}
                    aria-label="Plate and warm-up calculator"
                    title="Plate and warm-up calculator"
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Layers className="h-3 w-3" />
                  </button>
                )}
                {col.type === "box" && (
                  <div className="flex overflow-hidden rounded border border-border text-[9px] font-semibold">
                    {(["in", "m"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          for (const s of item.sets) onUpdateSet(s.setNumber, { boxHeightUnit: u });
                        }}
                        className={cn(
                          "px-1 py-0.5 transition-colors",
                          currentBoxUnit === u
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          <span />
        </div>
        <div className="space-y-1.5">
          {item.sets.map((set) => {
            const complete = isSetComplete(item, set);
            const tracked = set.peakVelocityMps != null || set.barPathDeviationCm != null;
            const historyMatch = findHistoryForReps(item.setHistory, set.reps);
            const isPR = complete && isRepCountPR(item.setHistory, set.reps, item.weightMode, set.weight);
            return (
              <div key={set.setNumber}>
                <div
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <span className="text-sm font-semibold text-muted-foreground">{set.setNumber}</span>
                  <Input
                    placeholder="Reps"
                    value={set.reps}
                    onChange={(e) => onUpdateSet(set.setNumber, { reps: e.target.value })}
                    className="h-9 text-sm"
                  />
                  {isBodyweightOnly ? (
                    <div className="flex h-9 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                      Bodyweight
                    </div>
                  ) : (
                    valueColumns.map((col) =>
                      col.type === "weight" ? (
                        <Input
                          key="weight"
                          type="number"
                          inputMode="decimal"
                          placeholder="0"
                          value={set.weight}
                          onChange={(e) => onUpdateSet(set.setNumber, { weight: e.target.value })}
                          className="h-9 text-sm"
                        />
                      ) : col.type === "band" ? (
                        <Input
                          key="band"
                          placeholder="e.g. Green"
                          value={set.bandColor}
                          onChange={(e) => onUpdateSet(set.setNumber, { bandColor: e.target.value })}
                          className="h-9 text-sm"
                        />
                      ) : (
                        <Input
                          key="box"
                          type="number"
                          inputMode="decimal"
                          placeholder="Height"
                          value={set.boxHeight}
                          onChange={(e) => onUpdateSet(set.setNumber, { boxHeight: e.target.value })}
                          className="h-9 text-sm"
                        />
                      ),
                    )
                  )}
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border",
                      isPR
                        ? "border-amber-400 bg-amber-400 text-black"
                        : complete
                          ? "border-success bg-success text-success-foreground"
                          : "border-dashed border-muted-foreground/30 bg-secondary",
                    )}
                    title={isPR ? "New PR!" : undefined}
                  >
                    {isPR ? (
                      <Crown className="h-4 w-4" />
                    ) : (
                      complete && <Check className="h-4 w-4" />
                    )}
                  </div>
                </div>
                {historyMatch && !isPR && (
                  <p className="mt-0.5 pl-9 text-[10px] text-muted-foreground">
                    Last @ {set.reps} reps: {formatLoad(historyMatch)}
                  </p>
                )}
                {item.trackingLevel !== "none" && (
                  <button
                    type="button"
                    onClick={() => setTrackingSet(set.setNumber)}
                    className={cn(
                      "mt-1 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      tracked
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-primary/40 text-primary hover:bg-primary/10",
                    )}
                  >
                    <Camera className="h-3 w-3" />
                    {tracked
                      ? item.trackingLevel === "full" && set.peakVelocityMps != null
                        ? `${set.peakVelocityMps} m/s peak — retake`
                        : `Path ${set.barPathDeviationCm} cm — retake`
                      : "Track this set"}
                  </button>
                )}
                {set.formFaults && set.formFaults.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-9">
                    {set.formFaults.map((f) => (
                      <Badge key={f.code} variant="secondary" className="text-[9px] font-normal">
                        {f.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {item.trackingLevel !== "none" && (
        <BarTrackerDialog
          open={trackingSet !== null}
          onOpenChange={(open) => !open && setTrackingSet(null)}
          mode={item.trackingLevel}
          exerciseName={item.exerciseName}
          targetReps={parseTargetReps(item.prescribedReps)}
          onCapture={(metrics: RepMetrics) => {
            if (trackingSet == null) return;
            onUpdateSet(trackingSet, {
              peakVelocityMps: metrics.peakVelocityMps,
              meanVelocityMps: metrics.meanVelocityMps,
              concentricSeconds: metrics.concentricSeconds,
              eccentricSeconds: metrics.eccentricSeconds,
              barPathDeviationCm: metrics.barPathDeviationCm,
              barPathTrace: metrics.barPathTrace,
              formFaults: metrics.formFaults,
            });
          }}
        />
      )}

      {item.videoCheckEnabled && videoCheckMode !== "off" && (
        <FormVideoRecorderDialog
          open={formVideoOpen}
          onOpenChange={setFormVideoOpen}
          onSaved={(url) =>
            videoCheckMode === "ai"
              ? aiFormCheckMutation.mutate(url)
              : postFormVideoMutation.mutate(url)
          }
        />
      )}

      <Dialog open={aiFeedback !== null} onOpenChange={(open) => !open && setAiFeedback(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Form Check: {item.exerciseName}
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{aiFeedback}</p>
          <p className="text-xs text-muted-foreground">
            Saved to your AI Program Builder chat for this program too.
          </p>
          <DialogFooter>
            <Button onClick={() => setAiFeedback(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Swap {item.exerciseName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {["No equipment today", "Aggravates an injury", "Too easy", "Too hard"].map(
                (reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSwapReason(reason)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                      swapReason === reason
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
                    )}
                  >
                    {reason}
                  </button>
                ),
              )}
            </div>
            <Input
              value={swapNotes}
              onChange={(e) => setSwapNotes(e.target.value)}
              placeholder="Add any details (optional)"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSwapOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => swapMutation.mutate()} disabled={swapMutation.isPending}>
              {swapMutation.isPending ? "Asking AI…" : "Ask AI to Swap"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {item.weightMode === "numeric" && (
        <PlateCalculatorDialog
          open={plateCalcOpen}
          onOpenChange={setPlateCalcOpen}
          exerciseName={item.exerciseName}
          initialWeight={topSetWeight}
          unit={unit}
        />
      )}

      <div className="flex items-center justify-center gap-4 pt-1">
        <button
          type="button"
          onClick={onRemoveSet}
          disabled={item.sets.length <= 1}
          aria-label="Remove set"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold text-muted-foreground">Set</span>
        <button
          type="button"
          onClick={onAddSet}
          aria-label="Add set"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-primary text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={item.rpe}
          type="number"
          onChange={(e) => onUpdateItem({ rpe: e.target.value })}
          placeholder="RPE"
          className="w-20 shrink-0 text-center"
        />
        <Input
          value={item.athleteNotes}
          onChange={(e) => onUpdateItem({ athleteNotes: e.target.value })}
          placeholder="Add exercise note"
          className="flex-1"
        />
      </div>
    </div>
  );
}
