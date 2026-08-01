import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { computeExerciseLabels, deriveLinkedToNext, groupConsecutiveBySupersetGroup } from "@/lib/supersets";
import { ExerciseVideo } from "@/components/exercise-video";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, MoonStar, Stethoscope, Link2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { PublicUser } from "@shared/schema";

type ExerciseInfo = {
  id: number;
  name: string;
  muscleGroup: string;
  instructions: string | null;
  videoUrl: string | null;
};

type PrescribedExercise = {
  id: number;
  sets: number;
  reps: string;
  weight: string | null;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
  exercise: ExerciseInfo;
};

type PrescribedCorrective = {
  id: number;
  sets: number;
  reps: string;
  weight: string | null;
  restSeconds: number | null;
  notes: string | null;
  exercise: ExerciseInfo;
};

type LogEntry = {
  programExerciseId: number | null;
  correctiveId: number | null;
  weightMode: "numeric" | "bodyweight" | "band";
  rpe: number | null;
  notes: string | null;
  sets: { setNumber: number; reps: string | null; weight: string | null }[];
};

type DayDetail = {
  programName: string;
  correctivesEnabled: boolean;
  day: { id: number; title: string; isRestDay: boolean; exercises: PrescribedExercise[] };
  correctives: PrescribedCorrective[];
  log: { completed: boolean; entries: LogEntry[] } | null;
};

type SetRow = { setNumber: number; reps: string; weight: string };

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
    weightMode: existing?.weightMode ?? "numeric",
    athleteNotes: existing?.notes ?? "",
    rpe: existing?.rpe != null ? String(existing.rpe) : "",
    sets,
  };
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

  const { data, isLoading } = useQuery<DayDetail>({
    queryKey: ["/api/athlete/day", assignmentId, programDayId, date],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/athlete/day?assignmentId=${assignmentId}&programDayId=${programDayId}&date=${date}`,
      );
      return res.json();
    },
  });

  const [items, setItems] = useState<ItemState[]>([]);
  const [hydrated, setHydrated] = useState(false);

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
          })),
        })),
      };
      const res = await apiRequest("POST", "/api/athlete/log", payload);
      return res.json();
    },
    onSuccess: (_res, completed) => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/day"] });
      toast.success(completed ? "Workout marked complete" : "Progress saved");
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

  if (isLoading || !data) {
    return (
      <AppShell title="Loading Workout…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  const correctiveItems = items.filter((it) => it.kind === "corrective");
  const exerciseItems = items.filter((it) => it.kind === "exercise");
  const exerciseBlocks = groupConsecutiveBySupersetGroup(exerciseItems);
  const labels = computeExerciseLabels(deriveLinkedToNext(exerciseItems));
  const unit = user?.preferredWeightUnit ?? "lbs";

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
        <div className="space-y-4">
          {correctiveItems.length > 0 && (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-400">
                <Stethoscope className="h-3.5 w-3.5" />
                Correctives
              </p>
              {correctiveItems.map((item) => (
                <Card key={item.key} className="border-cyan-900/40 bg-cyan-950/10">
                  <CardContent className="p-4">
                    <ExerciseLogContent
                      item={item}
                      badge={
                        <Badge variant="secondary" className="gap-1">
                          <Stethoscope className="h-3 w-3" />
                          Corrective
                        </Badge>
                      }
                      unit={unit}
                      onUpdateItem={(patch) => updateItem(item.key, patch)}
                      onUpdateSet={(setNumber, patch) => updateSet(item.key, setNumber, patch)}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {exerciseBlocks.map((block) => (
            <Card
              key={block[0].key}
              className={block.length > 1 ? "border-primary/40" : undefined}
            >
              <CardContent className="divide-y divide-border p-4">
                {block.length > 1 && (
                  <div className="mb-3 flex items-center gap-1.5 pb-0 text-xs font-semibold uppercase tracking-wide text-primary">
                    <Link2 className="h-3.5 w-3.5" />
                    Superset
                  </div>
                )}
                {block.map((item, i) => (
                  <div key={item.key} className={i > 0 ? "pt-4" : ""}>
                    <ExerciseLogContent
                      item={item}
                      badge={
                        <Badge variant="outline" className="font-mono">
                          {labels[item.key]}
                        </Badge>
                      }
                      unit={unit}
                      onUpdateItem={(patch) => updateItem(item.key, patch)}
                      onUpdateSet={(setNumber, patch) => updateSet(item.key, setNumber, patch)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

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
    </AppShell>
  );
}

function ExerciseLogContent({
  item,
  badge,
  unit,
  onUpdateItem,
  onUpdateSet,
}: {
  item: ItemState;
  badge: React.ReactNode;
  unit: "lbs" | "kg";
  onUpdateItem: (patch: Partial<ItemState>) => void;
  onUpdateSet: (setNumber: number, patch: Partial<SetRow>) => void;
}) {
  return (
    <div className="space-y-3">
      <ExerciseVideo url={item.videoUrl} name={item.exerciseName} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {badge}
          <div>
            <p className="font-semibold">{item.exerciseName}</p>
            <p className="text-xs text-muted-foreground">
              Prescribed: {item.prescribedSets} × {item.prescribedReps}
              {item.prescribedWeight ? ` @ ${item.prescribedWeight}` : ""}
              {item.restSeconds ? ` · Rest ${item.restSeconds}s` : ""}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          {item.muscleGroup}
        </Badge>
      </div>

      {item.coachNotes && (
        <p className="rounded-md bg-surface-elevated p-2 text-xs text-muted-foreground">
          Coach note: {item.coachNotes}
        </p>
      )}
      {item.instructions && (
        <p className="text-xs text-muted-foreground">{item.instructions}</p>
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
            {m === "numeric" ? "Weight" : m}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {item.sets.map((set) => (
          <div key={set.setNumber} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Set {set.setNumber}</span>
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
                placeholder="e.g. Green band"
                value={set.weight}
                onChange={(e) => onUpdateSet(set.setNumber, { weight: e.target.value })}
                className="h-9 text-sm"
              />
            ) : (
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={set.weight}
                  onChange={(e) => onUpdateSet(set.setNumber, { weight: e.target.value })}
                  className="h-9 pr-10 text-sm"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] uppercase text-muted-foreground">
                  {unit}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">RPE</Label>
          <Input
            type="number"
            value={item.rpe}
            onChange={(e) => onUpdateItem({ rpe: e.target.value })}
          />
        </div>
        <div className="col-span-1 space-y-1 sm:col-span-3">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea
            rows={1}
            value={item.athleteNotes}
            onChange={(e) => onUpdateItem({ athleteNotes: e.target.value })}
            placeholder="How did it feel?"
          />
        </div>
      </div>
    </div>
  );
}
