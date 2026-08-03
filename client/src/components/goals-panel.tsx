import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Target, Dumbbell, Trophy, X, Plus } from "lucide-react";
import { TESTING_METRICS, type TestingMetricKey } from "@shared/testing-metrics";

type ExerciseOption = { id: number; name: string };

type Goal = {
  id: number;
  type: "exercise" | "testing";
  exerciseId: number | null;
  exerciseName: string | null;
  testingMetric: TestingMetricKey | null;
  targetValue: number;
  targetUnit: string;
  targetDate: string | null;
  currentValue: number | null;
  achieved: boolean;
};

/** Embedded directly in the athlete's own progress page (self-service, no
 * dialog needed) and wrapped in a Dialog for the coach's roster view.
 * "Achieved" is never stored -- it's recomputed by the server every fetch
 * from the athlete's actual lift history / current testing numbers. */
export function GoalsPanel({
  goalsUrl,
  exercisesUrl,
  canCreate = true,
}: {
  goalsUrl: string;
  exercisesUrl: string;
  canCreate?: boolean;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"exercise" | "testing">("exercise");
  const [exerciseId, setExerciseId] = useState("");
  const [testingMetric, setTestingMetric] = useState<TestingMetricKey | "">("");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("lbs");
  const [targetDate, setTargetDate] = useState("");

  const { data: goals = [], isLoading } = useQuery<Goal[]>({
    queryKey: [goalsUrl],
    queryFn: async () => {
      const res = await apiRequest("GET", goalsUrl);
      return res.json();
    },
  });

  const { data: exercises = [] } = useQuery<ExerciseOption[]>({
    queryKey: [exercisesUrl],
    queryFn: async () => {
      const res = await apiRequest("GET", exercisesUrl);
      return res.json();
    },
    enabled: showForm && type === "exercise",
  });

  function resetForm() {
    setExerciseId("");
    setTestingMetric("");
    setTargetValue("");
    setTargetDate("");
    setShowForm(false);
  }

  const createGoal = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", goalsUrl, {
        type,
        exerciseId: type === "exercise" ? Number(exerciseId) : undefined,
        testingMetric: type === "testing" ? testingMetric : undefined,
        targetValue: Number(targetValue),
        targetUnit: type === "testing" ? TESTING_METRICS.find((m) => m.key === testingMetric)?.unit ?? "" : targetUnit,
        targetDate: targetDate || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [goalsUrl] });
      resetForm();
      toast.success("Goal set");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't set that goal"),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${goalsUrl}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [goalsUrl] }),
  });

  return (
    <div className="space-y-4">
      {canCreate && (
        <div>
          {!showForm ? (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Set a Goal
            </Button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!targetValue) return;
                if (type === "exercise" && !exerciseId) return;
                if (type === "testing" && !testingMetric) return;
                createGoal.mutate();
              }}
              className="space-y-3 rounded-md border border-border p-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Goal type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as "exercise" | "testing")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exercise">A lift</SelectItem>
                      <SelectItem value="testing">A testing metric</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {type === "exercise" ? (
                  <div className="space-y-1.5">
                    <Label>Exercise</Label>
                    <Select value={exerciseId} onValueChange={setExerciseId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a lift" />
                      </SelectTrigger>
                      <SelectContent>
                        {exercises.map((e) => (
                          <SelectItem key={e.id} value={String(e.id)}>
                            {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Metric</Label>
                    <Select
                      value={testingMetric}
                      onValueChange={(v) => setTestingMetric(v as TestingMetricKey)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a metric" />
                      </SelectTrigger>
                      <SelectContent>
                        {TESTING_METRICS.map((m) => (
                          <SelectItem key={m.key} value={m.key}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Target</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      placeholder="300"
                    />
                    {type === "exercise" ? (
                      <Select value={targetUnit} onValueChange={setTargetUnit}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lbs">lbs</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex w-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                        {TESTING_METRICS.find((m) => m.key === testingMetric)?.unit ?? "unit"}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Target date (optional)</Label>
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={createGoal.isPending}>
                  Save Goal
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-md bg-surface" />
      ) : goals.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No goals set yet.
        </p>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => {
            const label = g.type === "exercise" ? g.exerciseName ?? "Deleted exercise" : TESTING_METRICS.find((m) => m.key === g.testingMetric)?.label ?? g.testingMetric;
            const lowerIsBetter = g.type === "testing" && TESTING_METRICS.find((m) => m.key === g.testingMetric)?.lowerIsBetter;
            const pct =
              g.currentValue == null
                ? 0
                : lowerIsBetter
                  ? Math.min(100, (g.targetValue / g.currentValue) * 100)
                  : Math.min(100, (g.currentValue / g.targetValue) * 100);

            return (
              <div key={g.id} className="rounded-md border border-border p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {g.type === "exercise" ? (
                      <Dumbbell className="h-4 w-4 text-primary" />
                    ) : (
                      <Target className="h-4 w-4 text-primary" />
                    )}
                    {label}
                    {g.achieved && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-500">
                        <Trophy className="h-3 w-3" />
                        Achieved
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete goal: ${label}`}
                    onClick={() => deleteGoal.mutate(g.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Target: {g.targetValue} {g.targetUnit}
                  {g.targetDate ? ` by ${format(parseISO(g.targetDate), "MMM d, yyyy")}` : ""}
                  {g.currentValue != null ? ` — currently ${g.currentValue} ${g.targetUnit}` : " — no data yet"}
                </p>
                {g.currentValue != null && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full transition-all",
                        g.achieved ? "bg-amber-400" : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
