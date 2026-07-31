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
import { ExercisePickerDialog } from "@/components/exercise-picker-dialog";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, Trash2, MoonStar } from "lucide-react";
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
};

type DayDetail = {
  id: number;
  title: string;
  isRestDay: boolean;
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
    exercise: Exercise;
  }[];
};

export function CoachDayEditDialog({
  programDayId,
  open,
  onOpenChange,
}: {
  programDayId: number | null;
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

  const [title, setTitle] = useState("");
  const [isRestDay, setIsRestDay] = useState(false);
  const [exercises, setExercises] = useState<LocalExercise[]>([]);
  const [hydratedFor, setHydratedFor] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (data && hydratedFor !== data.id) {
      setTitle(data.title);
      setIsRestDay(data.isRestDay);
      setExercises(
        data.exercises.map((pe) => ({
          key: crypto.randomUUID(),
          exerciseId: pe.exercise.id,
          exerciseName: pe.exercise.name,
          sets: String(pe.sets),
          reps: pe.reps,
          weight: pe.weight ?? "",
          restSeconds: pe.restSeconds != null ? String(pe.restSeconds) : "",
          notes: pe.notes ?? "",
        })),
      );
      setHydratedFor(data.id);
    }
    if (!open) setHydratedFor(null);
  }, [data, hydratedFor, open]);

  function invalidateCalendars() {
    qc.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
    qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
    qc.invalidateQueries({ queryKey: ["/api/coach/program-days"] });
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: { title: string; isRestDay: boolean; exercises: LocalExercise[] }) => {
      const res = await apiRequest("PUT", `/api/coach/program-days/${programDayId}`, {
        title: payload.title,
        isRestDay: payload.isRestDay,
        exercises: payload.exercises.map((ex, i) => ({
          exerciseId: ex.exerciseId,
          orderIndex: i,
          sets: Number(ex.sets) || 1,
          reps: ex.reps || "10",
          weight: ex.weight || null,
          restSeconds: ex.restSeconds ? Number(ex.restSeconds) : null,
          notes: ex.notes || null,
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
                <div className="space-y-2">
                  {exercises.map((ex) => (
                    <div
                      key={ex.key}
                      className="rounded-md border border-border bg-surface-elevated p-2.5"
                    >
                      <div className="mb-2 flex items-center gap-2">
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
