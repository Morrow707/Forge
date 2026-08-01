import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ExercisePickerDialog } from "@/components/exercise-picker-dialog";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { computeExerciseLabels, assignSupersetGroups, deriveLinkedToNext } from "@/lib/supersets";
import { toast } from "sonner";
import { Plus, Trash2, MoonStar, Link2, Stethoscope, Copy, Clock } from "lucide-react";
import type { Exercise } from "@shared/schema";

type LocalExercise = {
  key: string;
  exerciseId: number;
  exerciseName: string;
  sets: string;
  reps: string;
  weight: string;
  restSeconds: string;
  notes: string;
  linkedToNext: boolean;
};

type LocalCorrective = {
  key: string;
  exerciseId: number;
  exerciseName: string;
  sets: string;
  reps: string;
  weight: string;
};

type DayDetail = {
  id: number;
  title: string;
  isRestDay: boolean;
  programId: number;
  programName: string;
  weekNumber: number;
  dayNumber: number;
  exercises: {
    id: number;
    sets: number;
    reps: string;
    weight: string | null;
    restSeconds: number | null;
    notes: string | null;
    supersetGroup: string | null;
    exercise: Exercise;
  }[];
};

type CorrectivesResponse = {
  correctivesEnabled: boolean;
  correctives: {
    id: number;
    sets: number;
    reps: string;
    weight: string | null;
    exercise: Exercise;
  }[];
};

type ProgramDayOption = {
  id: number;
  label: string;
};

export function CoachDayEditDialog({
  programDayId,
  assignmentId,
  athleteId,
  athleteName,
  open,
  onOpenChange,
}: {
  programDayId: number | null;
  assignmentId?: number | null;
  athleteId?: number | null;
  athleteName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<DayDetail>({
    queryKey: ["/api/coach/program-days", programDayId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/coach/program-days/${programDayId}`);
      return res.json();
    },
    enabled: open && programDayId != null,
  });

  const { data: correctivesData } = useQuery<CorrectivesResponse>({
    queryKey: ["/api/coach/assignments", assignmentId, "days", programDayId, "correctives"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/assignments/${assignmentId}/days/${programDayId}/correctives`,
      );
      return res.json();
    },
    enabled: open && assignmentId != null && programDayId != null,
  });

  const { data: recentCorrectives = [] } = useQuery<Exercise[]>({
    queryKey: ["/api/coach/athletes", athleteId, "recent-correctives"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/coach/athletes/${athleteId}/recent-correctives`);
      return res.json();
    },
    enabled: open && athleteId != null,
  });

  const { data: program } = useQuery<any>({
    queryKey: ["/api/coach/programs", data?.programId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/coach/programs/${data!.programId}`);
      return res.json();
    },
    enabled: open && data != null,
  });

  const [title, setTitle] = useState("");
  const [isRestDay, setIsRestDay] = useState(false);
  const [exercises, setExercises] = useState<LocalExercise[]>([]);
  const [correctives, setCorrectives] = useState<LocalCorrective[]>([]);
  const [hydratedFor, setHydratedFor] = useState<number | null>(null);
  const [correctivesHydratedFor, setCorrectivesHydratedFor] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [correctivePickerOpen, setCorrectivePickerOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set());
  const [copyOpen, setCopyOpen] = useState(false);

  useEffect(() => {
    if (data && hydratedFor !== data.id) {
      setTitle(data.title);
      setIsRestDay(data.isRestDay);
      setExercises(
        deriveLinkedToNext(
          data.exercises.map((pe) => ({
            key: crypto.randomUUID(),
            exerciseId: pe.exercise.id,
            exerciseName: pe.exercise.name,
            sets: String(pe.sets),
            reps: pe.reps,
            weight: pe.weight ?? "",
            restSeconds: pe.restSeconds != null ? String(pe.restSeconds) : "",
            notes: pe.notes ?? "",
            supersetGroup: pe.supersetGroup,
          })),
        ),
      );
      setHydratedFor(data.id);
    }
    if (!open) setHydratedFor(null);
  }, [data, hydratedFor, open]);

  useEffect(() => {
    if (correctivesData && programDayId != null && correctivesHydratedFor !== programDayId) {
      setCorrectives(
        correctivesData.correctives.map((c) => ({
          key: crypto.randomUUID(),
          exerciseId: c.exercise.id,
          exerciseName: c.exercise.name,
          sets: String(c.sets),
          reps: c.reps,
          weight: c.weight ?? "",
        })),
      );
      setCorrectivesHydratedFor(programDayId);
    }
    if (!open) setCorrectivesHydratedFor(null);
  }, [correctivesData, correctivesHydratedFor, programDayId, open]);

  const labels = computeExerciseLabels(exercises);

  const otherDayOptions: ProgramDayOption[] = program
    ? program.weeks.flatMap((w: any) =>
        w.days
          .filter((d: any) => d.id !== programDayId)
          .map((d: any) => ({
            id: d.id,
            label: `Week ${w.weekNumber} · Day ${d.dayNumber} — ${d.title}`,
          })),
      )
    : [];

  function invalidateCalendars() {
    qc.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
    qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
    qc.invalidateQueries({ queryKey: ["/api/coach/program-days"] });
    qc.invalidateQueries({ queryKey: ["/api/coach/assignments"] });
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: { title: string; isRestDay: boolean; exercises: LocalExercise[] }) => {
      const res = await apiRequest("PUT", `/api/coach/program-days/${programDayId}`, {
        title: payload.title,
        isRestDay: payload.isRestDay,
        exercises: assignSupersetGroups(payload.exercises).map((ex, i) => ({
          exerciseId: ex.exerciseId,
          orderIndex: i,
          sets: Number(ex.sets) || 1,
          reps: ex.reps || "10",
          weight: ex.weight || null,
          restSeconds: ex.restSeconds ? Number(ex.restSeconds) : null,
          notes: ex.notes || null,
          supersetGroup: ex.supersetGroup,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateCalendars();
      toast.success("Workout updated — synced to the athlete's calendar");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save changes"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/coach/program-days/${programDayId}`, {
        title: "Rest Day",
        isRestDay: true,
        exercises: [],
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateCalendars();
      toast.success("Workout deleted — day cleared to rest");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete workout"),
  });

  const enableCorrectivesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/coach/assignments/${assignmentId}`, {
        correctivesEnabled: true,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/coach/assignments", assignmentId, "days", programDayId, "correctives"],
      });
      invalidateCalendars();
      toast.success(`Correctives turned on for ${athleteName ?? "this athlete"}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not enable correctives"),
  });

  const saveCorrectivesMutation = useMutation({
    mutationFn: async (list: LocalCorrective[]) => {
      const res = await apiRequest(
        "PUT",
        `/api/coach/assignments/${assignmentId}/days/${programDayId}/correctives`,
        {
          correctives: list.map((c, i) => ({
            exerciseId: c.exerciseId,
            orderIndex: i,
            sets: Number(c.sets) || 1,
            reps: c.reps || "10",
            weight: c.weight || null,
          })),
        },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/athletes", athleteId, "recent-correctives"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/day"] });
      toast.success(`Correctives saved for ${athleteName ?? "athlete"}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save correctives"),
  });

  const copyCorrectivesMutation = useMutation({
    mutationFn: async (targetProgramDayIds: number[]) => {
      await apiRequest(
        "POST",
        `/api/coach/assignments/${assignmentId}/days/${programDayId}/correctives/copy`,
        { targetProgramDayIds },
      );
    },
    onSuccess: () => {
      toast.success("Correctives copied to selected days");
      setCopyOpen(false);
      setCopyTargets(new Set());
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not copy correctives"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Workout</DialogTitle>
            {data && (
              <DialogDescription>
                {data.programName} · Week {data.weekNumber}, Day {data.dayNumber} — changes apply
                to every athlete assigned to this program.
              </DialogDescription>
            )}
          </DialogHeader>

          {isLoading || !data ? (
            <div className="h-40 animate-pulse rounded-md bg-surface" />
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={isRestDay}
                  onCheckedChange={(checked) => setIsRestDay(checked === true)}
                />
                Rest day
              </label>

              {isRestDay ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-8 text-sm text-muted-foreground">
                  <MoonStar className="h-4 w-4" />
                  Recovery day — no exercises
                </div>
              ) : (
                <div className="space-y-1">
                  {exercises.map((ex, i) => (
                      <div key={ex.key}>
                        <div className="rounded-md border border-border bg-surface-elevated p-2.5">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
                              {labels[ex.key]}
                            </span>
                            <span className="flex-1 truncate text-sm font-semibold">
                              {ex.exerciseName}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExercises((prev) => prev.filter((e) => e.key !== ex.key))
                              }
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <MiniField
                              label="Sets"
                              value={ex.sets}
                              type="number"
                              onChange={(v) =>
                                setExercises((prev) =>
                                  prev.map((e) => (e.key === ex.key ? { ...e, sets: v } : e)),
                                )
                              }
                            />
                            <MiniField
                              label="Reps"
                              value={ex.reps}
                              onChange={(v) =>
                                setExercises((prev) =>
                                  prev.map((e) => (e.key === ex.key ? { ...e, reps: v } : e)),
                                )
                              }
                            />
                            <MiniField
                              label="Weight"
                              value={ex.weight}
                              onChange={(v) =>
                                setExercises((prev) =>
                                  prev.map((e) => (e.key === ex.key ? { ...e, weight: v } : e)),
                                )
                              }
                            />
                          </div>
                        </div>
                        {i < exercises.length - 1 && (
                          <div className="flex items-center gap-2 py-0.5 pl-3">
                            <div
                              className={cn(
                                "h-3 w-px",
                                ex.linkedToNext ? "bg-blue-500" : "bg-transparent",
                              )}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setExercises((prev) =>
                                  prev.map((e) =>
                                    e.key === ex.key
                                      ? { ...e, linkedToNext: !e.linkedToNext }
                                      : e,
                                  ),
                                )
                              }
                              title={ex.linkedToNext ? "Unlink superset" : "Link into a superset"}
                              className={cn(
                                "flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[11px] font-bold transition-colors",
                                ex.linkedToNext
                                  ? "border-blue-500 bg-blue-500 text-white"
                                  : "border-blue-500 text-blue-500 hover:bg-blue-500/10",
                              )}
                            >
                              <Link2 className="h-3 w-3" />
                              {ex.linkedToNext ? "Linked" : "Link"}
                            </button>
                          </div>
                        )}
                      </div>
                  ))}
                  {exercises.length === 0 && (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      No exercises yet
                    </p>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => setPickerOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Exercise
                  </Button>
                </div>
              )}

              {assignmentId != null && correctivesData && !correctivesData.correctivesEnabled && (
                <div className="space-y-2 rounded-md border border-cyan-900/40 bg-cyan-950/10 p-3">
                  <div className="flex items-center gap-1.5">
                    <Stethoscope className="h-4 w-4 text-cyan-400" />
                    <p className="text-sm font-semibold">
                      Correctives are off for {athleteName ?? "this athlete"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Turn them on to add corrective exercises for this athlete on this day.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={enableCorrectivesMutation.isPending}
                    onClick={() => enableCorrectivesMutation.mutate()}
                  >
                    {enableCorrectivesMutation.isPending ? "Enabling…" : "Turn on Correctives"}
                  </Button>
                </div>
              )}

              {assignmentId != null && correctivesData?.correctivesEnabled && (
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Stethoscope className="h-4 w-4 text-cyan-400" />
                      <p className="text-sm font-semibold">
                        Correctives for {athleteName ?? "this athlete"}
                      </p>
                    </div>
                    {otherDayOptions.length > 0 && correctives.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setCopyOpen((v) => !v)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy to…
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Specific to {athleteName ?? "this athlete"} on this day — not shared with
                    other athletes on this program.
                  </p>

                  {copyOpen && (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Copy this athlete's correctives to:
                      </p>
                      <div className="max-h-32 space-y-1 overflow-y-auto">
                        {otherDayOptions.map((opt) => (
                          <label key={opt.id} className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={copyTargets.has(opt.id)}
                              onCheckedChange={(c) =>
                                setCopyTargets((prev) => {
                                  const next = new Set(prev);
                                  if (c === true) next.add(opt.id);
                                  else next.delete(opt.id);
                                  return next;
                                })
                              }
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        disabled={copyTargets.size === 0 || copyCorrectivesMutation.isPending}
                        onClick={() => copyCorrectivesMutation.mutate(Array.from(copyTargets))}
                      >
                        Copy to {copyTargets.size || ""} day{copyTargets.size === 1 ? "" : "s"}
                      </Button>
                    </div>
                  )}

                  {recentCorrectives.length > 0 && (
                    <div className="space-y-1">
                      <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Recently used
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {recentCorrectives.map((ex) => (
                          <button
                            key={ex.id}
                            type="button"
                            onClick={() =>
                              setCorrectives((prev) => [
                                ...prev,
                                {
                                  key: crypto.randomUUID(),
                                  exerciseId: ex.id,
                                  exerciseName: ex.name,
                                  sets: "3",
                                  reps: "10",
                                  weight: "",
                                },
                              ])
                            }
                            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                          >
                            + {ex.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {correctives.map((c) => (
                      <div
                        key={c.key}
                        className="rounded-md border border-cyan-900/40 bg-cyan-950/10 p-2.5"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex-1 truncate text-sm font-semibold">
                            {c.exerciseName}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCorrectives((prev) => prev.filter((e) => e.key !== c.key))
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <MiniField
                            label="Sets"
                            value={c.sets}
                            type="number"
                            onChange={(v) =>
                              setCorrectives((prev) =>
                                prev.map((e) => (e.key === c.key ? { ...e, sets: v } : e)),
                              )
                            }
                          />
                          <MiniField
                            label="Reps"
                            value={c.reps}
                            onChange={(v) =>
                              setCorrectives((prev) =>
                                prev.map((e) => (e.key === c.key ? { ...e, reps: v } : e)),
                              )
                            }
                          />
                          <MiniField
                            label="Weight"
                            value={c.weight}
                            onChange={(v) =>
                              setCorrectives((prev) =>
                                prev.map((e) => (e.key === c.key ? { ...e, weight: v } : e)),
                              )
                            }
                          />
                        </div>
                      </div>
                    ))}
                    {correctives.length === 0 && (
                      <p className="py-1 text-center text-xs text-muted-foreground">
                        No correctives assigned for this day
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setCorrectivePickerOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Corrective
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      disabled={saveCorrectivesMutation.isPending}
                      onClick={() => saveCorrectivesMutation.mutate(correctives)}
                    >
                      {saveCorrectivesMutation.isPending ? "Saving…" : "Save Correctives"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Delete this workout? It will be cleared to a rest day for every athlete on this program.")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={!data || deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Delete Workout
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate({ title, isRestDay, exercises })}
                disabled={!data || saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(exercise) => {
          setExercises((prev) => [
            ...prev,
            {
              key: crypto.randomUUID(),
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              sets: "3",
              reps: "10",
              weight: "",
              restSeconds: "",
              notes: "",
              linkedToNext: false,
            },
          ]);
        }}
      />

      <ExercisePickerDialog
        open={correctivePickerOpen}
        onOpenChange={setCorrectivePickerOpen}
        correctivesOnly
        title="Add Corrective"
        onSelect={(exercise) => {
          setCorrectives((prev) => [
            ...prev,
            {
              key: crypto.randomUUID(),
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              sets: "3",
              reps: "10",
              weight: "",
            },
          ]);
        }}
      />
    </>
  );
}

function MiniField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] uppercase text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 text-xs"
      />
    </div>
  );
}
