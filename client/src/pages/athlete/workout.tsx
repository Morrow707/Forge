import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { groupConsecutiveBySupersetGroup } from "@/lib/supersets";
import { ExerciseVideoThumb } from "@/components/exercise-video";
import { RestTimerControl } from "@/components/rest-timer";
import { WorkoutCommentThread } from "@/components/workout-comment-thread";
import { BarTrackerDialog } from "@/components/bar-tracker-dialog";
import { FormVideoRecorderDialog } from "@/components/form-video-recorder-dialog";
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
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { PublicUser } from "@shared/schema";

type ExerciseInfo = {
  id: number;
  name: string;
  muscleGroup: string;
  instructions: string | null;
  videoUrl: string | null;
};

type WeightUnit = "lbs" | "kg";

type LastPerformance = {
  date: string;
  sets: number;
  reps: string | null;
  weight: string | null;
  weightMode: "numeric" | "bodyweight" | "band";
  weightUnit: WeightUnit | null;
  rpe: number | null;
  suggestion: { text: string; suggestedWeight: number | null } | null;
} | null;

type SetHistoryPoint = {
  date: string;
  reps: string;
  weight: string | null;
  weightMode: "numeric" | "bodyweight" | "band";
  weightUnit: WeightUnit | null;
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

type SetMetrics = {
  peakVelocityMps: number | null;
  meanVelocityMps: number | null;
  concentricSeconds: number | null;
  eccentricSeconds: number | null;
  barPathDeviationCm: number | null;
  barPathTrace: { t: number; x: number; y: number }[] | null;
};

type LogEntry = {
  programExerciseId: number | null;
  correctiveId: number | null;
  weightMode: "numeric" | "bodyweight" | "band";
  rpe: number | null;
  notes: string | null;
  sets: ({ setNumber: number; reps: string | null; weight: string | null } & Partial<SetMetrics>)[];
};

type DayDetail = {
  programName: string;
  correctivesEnabled: boolean;
  day: { id: number; title: string; isRestDay: boolean; exercises: PrescribedExercise[] };
  correctives: PrescribedCorrective[];
  log: { completed: boolean; entries: LogEntry[] } | null;
};

type SetRow = { setNumber: number; reps: string; weight: string } & SetMetrics;

type ItemState = {
  key: string;
  kind: "exercise" | "corrective";
  refId: number;
  exerciseName: string;
  muscleGroup: string;
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
  weightMode: "numeric" | "bodyweight" | "band";
  athleteNotes: string;
  rpe: string;
  sets: SetRow[];
};

function buildItem(
  kind: "exercise" | "corrective",
  prescribed: PrescribedExercise | PrescribedCorrective,
  existing: LogEntry | undefined,
): ItemState {
  const sets: SetRow[] = Array.from({ length: prescribed.sets }, (_, i) => {
    const setNumber = i + 1;
    const existingSet = existing?.sets.find((s) => s.setNumber === setNumber);
    return {
      setNumber,
      reps: existingSet?.reps ?? prescribed.reps,
      weight: existingSet?.weight ?? "",
      peakVelocityMps: existingSet?.peakVelocityMps ?? null,
      meanVelocityMps: existingSet?.meanVelocityMps ?? null,
      concentricSeconds: existingSet?.concentricSeconds ?? null,
      eccentricSeconds: existingSet?.eccentricSeconds ?? null,
      barPathDeviationCm: existingSet?.barPathDeviationCm ?? null,
      barPathTrace: existingSet?.barPathTrace ?? null,
    };
  });
  return {
    key: `${kind}-${prescribed.id}`,
    kind,
    refId: prescribed.id,
    exerciseName: prescribed.exercise.name,
    muscleGroup: prescribed.exercise.muscleGroup,
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
    weightMode: existing?.weightMode ?? "numeric",
    athleteNotes: existing?.notes ?? "",
    rpe: existing?.rpe != null ? String(existing.rpe) : "",
    sets,
  };
}

function isSetComplete(item: ItemState, set: SetRow) {
  if (item.weightMode === "bodyweight") return set.reps.trim() !== "";
  return set.reps.trim() !== "" && set.weight.trim() !== "";
}

function formatLastPerformance(lp: NonNullable<LastPerformance>) {
  let s = `${lp.sets} × ${lp.reps ?? "-"}`;
  if (lp.weight) s += ` @ ${lp.weight}${lp.weightUnit ? ` ${lp.weightUnit}` : ""}`;
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
  weightMode: "numeric" | "bodyweight" | "band",
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

export default function AthleteWorkout() {
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
    queryKey: ["/api/athlete/day", assignmentId, programDayId, date],
    queryFn: async () => {
      try {
        const res = await apiRequest(
          "GET",
          `/api/athlete/day?assignmentId=${assignmentId}&programDayId=${programDayId}&date=${date}`,
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

  useEffect(() => {
    if (data && !hydrated) {
      const correctiveItems = data.correctives.map((c) =>
        buildItem(
          "corrective",
          c,
          data.log?.entries.find((e) => e.correctiveId === c.id),
        ),
      );
      const exerciseItems = data.day.exercises.map((pe) =>
        buildItem(
          "exercise",
          pe,
          data.log?.entries.find((e) => e.programExerciseId === pe.id),
        ),
      );
      setItems([...correctiveItems, ...exerciseItems]);
      setHydrated(true);
      setPageIndex(0);
    }
  }, [data, hydrated]);

  const unitMutation = useMutation({
    mutationFn: async (unit: "lbs" | "kg") => {
      const res = await apiRequest("PATCH", "/api/athlete/preferences", {
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
            peakVelocityMps: s.peakVelocityMps,
            meanVelocityMps: s.meanVelocityMps,
            concentricSeconds: s.concentricSeconds,
            eccentricSeconds: s.eccentricSeconds,
            barPathDeviationCm: s.barPathDeviationCm,
            barPathTrace: s.barPathTrace,
          })),
        })),
      };
      try {
        const res = await apiRequest("POST", "/api/athlete/log", payload);
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
      qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/day"] });
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
    setItems((prev) =>
      prev.map((it) =>
        it.key === key
          ? {
              ...it,
              sets: it.sets.map((s) => (s.setNumber === setNumber ? { ...s, ...patch } : s)),
            }
          : it,
      ),
    );
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
              peakVelocityMps: null,
              meanVelocityMps: null,
              concentricSeconds: null,
              eccentricSeconds: null,
              barPathDeviationCm: null,
              barPathTrace: null,
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

  return (
    <AppShell
      title={format(parseISO(date), "EEEE, MMM d")}
      actions={
        <>
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
          <Button variant="outline" onClick={() => navigate("/athlete")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </Button>
        </>
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
        <div className="space-y-4 pb-24">
          {pages.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-1">
              {pages.map((page, i) => {
                const complete = isPageComplete(page);
                const isCurrent = i === pageIndex;
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to exercise group ${i + 1} of ${pages.length}`}
                    onClick={() => setPageIndex(i)}
                    className={cn(
                      "rounded-full transition-all",
                      isCurrent
                        ? "h-3 w-3 bg-success"
                        : complete
                          ? "h-2 w-2 bg-success"
                          : "h-2 w-2 border border-border",
                    )}
                  />
                );
              })}
            </div>
          )}

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

          {currentPage ? (
            <div className="space-y-2">
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
                        onUpdateItem={(patch) => updateItem(item.key, patch)}
                        onUpdateSet={(setNumber, patch) => updateSet(item.key, setNumber, patch)}
                        onAddSet={() => addSet(item.key)}
                        onRemoveSet={() => removeSet(item.key)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing prescribed for this day yet.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => submitMutation.mutate(false)}
              disabled={submitMutation.isPending}
            >
              Save Progress
            </Button>
            <Button
              className="flex-1"
              onClick={() => submitMutation.mutate(true)}
              disabled={submitMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark Complete
            </Button>
          </div>
        </div>
      )}

      <div className={cn("mt-4", !data.day.isRestDay && pages.length > 0 && "pb-16")}>
        <WorkoutCommentThread
          role="athlete"
          assignmentId={Number(assignmentId)}
          programDayId={Number(programDayId)}
        />
      </div>

      {!data.day.isRestDay && pages.length > 0 && (
        <div className="fixed inset-x-0 bottom-14 z-20 border-t border-border bg-surface md:bottom-0 md:left-64">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-8">
            <button
              type="button"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageIndex === 0}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <RestTimerControl defaultSeconds={currentPage?.items[0]?.restSeconds} />
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
  onUpdateItem: (patch: Partial<ItemState>) => void;
  onUpdateSet: (setNumber: number, patch: Partial<SetRow>) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
}) {
  const isCorrective = item.kind === "corrective";
  const [trackingSet, setTrackingSet] = useState<number | null>(null);
  const [formVideoOpen, setFormVideoOpen] = useState(false);
  const qc = useQueryClient();
  const commentsPath = `/api/athlete/assignments/${assignmentId}/days/${programDayId}/comments`;
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
                  isCorrective ? "bg-cyan-500 text-white" : "bg-primary text-primary-foreground",
                )}
              >
                {badgeLabel}
              </span>
              <p className="truncate font-semibold">{item.exerciseName}</p>
              {linked && <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </div>
            <Badge variant="outline" className="shrink-0">
              {item.muscleGroup}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Prescribed: {item.prescribedSets} × {item.prescribedReps}
            {item.prescribedWeight ? ` @ ${item.prescribedWeight}` : ""}
            {item.restSeconds ? ` · Rest ${item.restSeconds}s` : ""}
          </p>
          {item.lastPerformance && (
            <p className="text-xs font-semibold text-muted-foreground">
              <span className="text-primary">LAST</span> {formatLastPerformance(item.lastPerformance)}
            </p>
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

      {item.videoCheckEnabled && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
          <span className="text-xs font-semibold text-amber-500">
            Your coach wants a form check video for this exercise
          </span>
          <Button size="sm" variant="secondary" onClick={() => setFormVideoOpen(true)}>
            <Video className="h-3.5 w-3.5" />
            Record
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase text-muted-foreground">Log as:</span>
        {(["numeric", "bodyweight", "band"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onUpdateItem({ weightMode: m })}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize transition-colors",
              item.weightMode === m
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
            )}
          >
            {m === "numeric" ? `Weight (${unit})` : m}
          </button>
        ))}
      </div>

      <div>
        <div className="grid grid-cols-[2.25rem_1fr_1fr_2rem] items-center gap-2 px-0.5 pb-1">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Set</span>
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Reps</span>
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            {item.weightMode === "numeric" ? unit : item.weightMode === "band" ? "Band" : ""}
          </span>
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
                <div className="grid grid-cols-[2.25rem_1fr_1fr_2rem] items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">{set.setNumber}</span>
                  <Input
                    placeholder="Reps"
                    value={set.reps}
                    onChange={(e) => onUpdateSet(set.setNumber, { reps: e.target.value })}
                    className="h-9 text-sm"
                  />
                  {item.weightMode === "bodyweight" ? (
                    <div className="flex h-9 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                      Bodyweight
                    </div>
                  ) : item.weightMode === "band" ? (
                    <Input
                      placeholder="e.g. Green"
                      value={set.weight}
                      onChange={(e) => onUpdateSet(set.setNumber, { weight: e.target.value })}
                      className="h-9 text-sm"
                    />
                  ) : (
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={set.weight}
                      onChange={(e) => onUpdateSet(set.setNumber, { weight: e.target.value })}
                      className="h-9 text-sm"
                    />
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
                    Last @ {set.reps} reps:{" "}
                    {historyMatch.weightMode === "numeric"
                      ? `${historyMatch.weight} ${historyMatch.weightUnit ?? ""}`.trim()
                      : historyMatch.weightMode === "band"
                        ? historyMatch.weight
                        : "Bodyweight"}
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
          onCapture={(metrics: RepMetrics) => {
            if (trackingSet == null) return;
            onUpdateSet(trackingSet, {
              peakVelocityMps: metrics.peakVelocityMps,
              meanVelocityMps: metrics.meanVelocityMps,
              concentricSeconds: metrics.concentricSeconds,
              eccentricSeconds: metrics.eccentricSeconds,
              barPathDeviationCm: metrics.barPathDeviationCm,
              barPathTrace: metrics.barPathTrace,
            });
          }}
        />
      )}

      {item.videoCheckEnabled && (
        <FormVideoRecorderDialog
          open={formVideoOpen}
          onOpenChange={setFormVideoOpen}
          onSaved={(url) => postFormVideoMutation.mutate(url)}
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
