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
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO, addDays, formatISO } from "date-fns";
import { Target, Dumbbell, Trophy, X, Plus, Sparkles, Timer, History } from "lucide-react";
import { TESTING_METRICS, type TestingMetricKey } from "@shared/testing-metrics";
import { ReadFailed } from "@/components/read-failed";
import { useT } from "@/i18n";
import { TranslatableText } from "@/components/translatable-text";

type ExerciseOption = { id: number; name: string };

type Goal = {
  id: number;
  type: "exercise" | "testing" | "skill";
  exerciseId: number | null;
  exerciseName: string | null;
  testingMetric: TestingMetricKey | null;
  skillExerciseId: number | null;
  skillExerciseName: string | null;
  targetValue: number;
  targetUnit: string;
  targetDate: string | null;
  achievedAt: string | null;
  archivedAt: string | null;
  currentValue: number | null;
  achieved: boolean;
};

/** Embedded directly in the athlete's own progress page (self-service, no
 * dialog needed) and wrapped in a Dialog for the coach's roster view.
 * "Achieved" is never stored -- it's recomputed by the server every fetch
 * from the athlete's actual lift history / current testing numbers /
 * best sprint time. skillExercisesUrl is optional -- goals against a skill
 * drill only make sense once Skills is in the picture at all, so a caller
 * that never passes it just doesn't offer that goal type (no broken empty
 * option), keeping a coach/athlete with no skill history from seeing a
 * dead-end choice. */
export function GoalsPanel({
  goalsUrl,
  exercisesUrl,
  skillExercisesUrl,
  canCreate = true,
  canSuggest = true,
}: {
  goalsUrl: string;
  exercisesUrl: string;
  skillExercisesUrl?: string;
  canCreate?: boolean;
  /** Whether to offer the AI "Suggest a target" button. Defaults true,
   * which is right for every coach-side use of this panel. The athlete's
   * own progress page passes false once they have a coach: the server
   * refuses that call for a coached athlete (setting a target is coaching),
   * so showing the button would only produce a 403. */
  canSuggest?: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [type, setType] = useState<"exercise" | "testing" | "skill">("exercise");
  const [exerciseId, setExerciseId] = useState("");
  const [testingMetric, setTestingMetric] = useState<TestingMetricKey | "">("");
  const [skillExerciseId, setSkillExerciseId] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("lbs");
  const [targetDate, setTargetDate] = useState("");
  const [suggestion, setSuggestion] = useState<{
    targetValue: number;
    timeframeWeeks: number;
    rationale: string;
  } | null>(null);

  const { data: goals = [], isLoading, isError, refetch } = useQuery<Goal[]>({
    queryKey: [goalsUrl],
    queryFn: () => getJson(goalsUrl),
  });

  const {
    data: history = [],
    isLoading: historyLoading,
    isError: historyFailed,
    refetch: refetchHistory,
  } = useQuery<Goal[]>({
    queryKey: [goalsUrl, "history"],
    queryFn: () => getJson(`${goalsUrl}?history=true`),
    enabled: showHistory,
  });
  // getGoalsForAthlete(..., true) returns every goal, active ones included --
  // History is specifically the ones no longer on the active list above.
  const archivedGoals = history.filter((g) => g.archivedAt);

  const { data: exercises = [] } = useQuery<ExerciseOption[]>({
    queryKey: [exercisesUrl],
    queryFn: () => getJson(exercisesUrl),
    enabled: showForm && type === "exercise",
  });

  const { data: skillExercises = [] } = useQuery<ExerciseOption[]>({
    queryKey: [skillExercisesUrl],
    queryFn: () => getJson(skillExercisesUrl!),
    enabled: showForm && type === "skill" && !!skillExercisesUrl,
  });

  function resetForm() {
    setExerciseId("");
    setTestingMetric("");
    setSkillExerciseId("");
    setTargetValue("");
    setTargetDate("");
    setSuggestion(null);
    setShowForm(false);
  }

  const suggestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${goalsUrl}/suggest`, {
        type,
        exerciseId: type === "exercise" ? Number(exerciseId) : undefined,
        testingMetric: type === "testing" ? testingMetric : undefined,
        // The unit this dialog will save the target in -- the server reasons
        // over a pounds-normalized history and converts its answer back.
        targetUnit,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (!data) {
        toast.info(t("Not enough history yet to suggest a target for this."));
        return;
      }
      setSuggestion(data);
    },
    onError: () => toast.error(t("Couldn't get a suggestion right now")),
  });

  const createGoal = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", goalsUrl, {
        type,
        exerciseId: type === "exercise" ? Number(exerciseId) : undefined,
        testingMetric: type === "testing" ? testingMetric : undefined,
        skillExerciseId: type === "skill" ? Number(skillExerciseId) : undefined,
        targetValue: Number(targetValue),
        targetUnit:
          type === "testing"
            ? TESTING_METRICS.find((m) => m.key === testingMetric)?.unit ?? ""
            : type === "skill"
              ? "sec"
              : targetUnit,
        targetDate: targetDate || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [goalsUrl] });
      resetForm();
      toast.success(t("Goal set"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't set that goal")),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${goalsUrl}/${id}`);
    },
    // Archiving (not a hard delete server-side now) moves a goal from the
    // active list into History, so both queries need to refresh.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [goalsUrl] });
      qc.invalidateQueries({ queryKey: [goalsUrl, "history"] });
    },
    // Without this the X button simply did nothing on a failure -- the goal
    // stayed on screen with no explanation, which reads as a dead button.
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't remove that goal")),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canCreate && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            {t("Set a Goal")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
          <History className="h-4 w-4" />
          {showHistory ? t("Hide History") : t("View History")}
        </Button>
      </div>

      {showHistory && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Past Goals")}
          </p>
          {historyLoading ? (
            <div className="h-10 animate-pulse rounded-md bg-surface" />
          ) : historyFailed ? (
            <ReadFailed what={t("past goals")} onRetry={() => void refetchHistory()} />
          ) : archivedGoals.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              {t("Nothing here yet, goals you remove from the active list stay here.")}
            </p>
          ) : (
            archivedGoals.map((g) => {
              const label =
                g.type === "exercise"
                  ? g.exerciseName ? t.exercise(g.exerciseName) : t("Deleted exercise")
                  : g.type === "skill"
                    ? g.skillExerciseName ? t.exercise(g.skillExerciseName) : t("Deleted drill")
                    : t(TESTING_METRICS.find((m) => m.key === g.testingMetric)?.label ?? g.testingMetric ?? "");
              return (
                <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {g.type === "exercise" ? (
                      <Dumbbell className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : g.type === "skill" ? (
                      <Timer className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate font-medium">{label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t("target {value} {unit}", { value: g.targetValue, unit: g.targetUnit })}
                    </span>
                  </div>
                  {g.achievedAt ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-500">
                      <Trophy className="h-3 w-3" />
                      {t("Hit {date}", { date: t.date(parseISO(g.achievedAt), { month: "short", day: "numeric", year: "numeric" }) })}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">{t("Not achieved")}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {canCreate && (
        <div>
          {!showForm ? null : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!targetValue) return;
                if (type === "exercise" && !exerciseId) return;
                if (type === "testing" && !testingMetric) return;
                if (type === "skill" && !skillExerciseId) return;
                createGoal.mutate();
              }}
              className="space-y-3 rounded-md border border-border p-3"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("Goal type")}</Label>
                  <Select
                    value={type}
                    onValueChange={(v) => {
                      setType(v as "exercise" | "testing" | "skill");
                      setSuggestion(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exercise">{t("A lift")}</SelectItem>
                      <SelectItem value="testing">{t("A testing metric")}</SelectItem>
                      {skillExercisesUrl && <SelectItem value="skill">{t("A sprint time")}</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>

                {type === "exercise" ? (
                  <div className="space-y-1.5">
                    <Label>{t("Exercise")}</Label>
                    <Select
                      value={exerciseId}
                      onValueChange={(v) => {
                        setExerciseId(v);
                        setSuggestion(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("Pick a lift")} />
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
                ) : type === "skill" ? (
                  <div className="space-y-1.5">
                    <Label>{t("Skill drill")}</Label>
                    <Select value={skillExerciseId} onValueChange={setSkillExerciseId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("Pick a drill")} />
                      </SelectTrigger>
                      <SelectContent>
                        {skillExercises.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            {t("No timed sprints recorded yet")}
                          </div>
                        ) : (
                          skillExercises.map((e) => (
                            <SelectItem key={e.id} value={String(e.id)}>
                              {e.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>{t("Metric")}</Label>
                    <Select
                      value={testingMetric}
                      onValueChange={(v) => {
                        setTestingMetric(v as TestingMetricKey);
                        setSuggestion(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("Pick a metric")} />
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
                  <Label>{t("Target")}</Label>
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
                          <SelectItem value="lbs">{t("lbs")}</SelectItem>
                          <SelectItem value="kg">{t("kg")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex w-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                        {type === "skill"
                          ? t("sec")
                          : TESTING_METRICS.find((m) => m.key === testingMetric)?.unit ?? t("unit")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("Target date (optional)")}</Label>
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                </div>
              </div>

              {canSuggest && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    suggestMutation.isPending ||
                    (type === "exercise" ? !exerciseId : !testingMetric)
                  }
                  onClick={() => {
                    setSuggestion(null);
                    suggestMutation.mutate();
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {suggestMutation.isPending ? t("Thinking...") : t("Suggest a target")}
                </Button>
              )}

              {suggestion && (
                <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-sm">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-semibold">
                        {t.plural(suggestion.timeframeWeeks, "{value} in {count} week", "{value} in {count} weeks", {
                          value: suggestion.targetValue,
                        })}
                      </span>{" "}
                      — <TranslatableText text={suggestion.rationale} />
                    </p>
                    <button
                      type="button"
                      className="mt-1 font-semibold text-primary hover:underline"
                      onClick={() => {
                        setTargetValue(String(suggestion.targetValue));
                        setTargetDate(
                          formatISO(addDays(new Date(), suggestion.timeframeWeeks * 7), {
                            representation: "date",
                          }),
                        );
                        setSuggestion(null);
                      }}
                    >
                      {t("Use this")}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={createGoal.isPending}>
                  {t("Save Goal")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                  {t("Cancel")}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-md bg-surface" />
      ) : isError ? (
        <ReadFailed what={t("these goals")} onRetry={() => void refetch()} />
      ) : goals.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("No goals set yet.")}
        </p>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => {
            const label =
              g.type === "exercise"
                ? g.exerciseName ? t.exercise(g.exerciseName) : t("Deleted exercise")
                : g.type === "skill"
                  ? g.skillExerciseName ? t.exercise(g.skillExerciseName) : t("Deleted drill")
                  : t(TESTING_METRICS.find((m) => m.key === g.testingMetric)?.label ?? g.testingMetric ?? "");
            const lowerIsBetter =
              g.type === "skill" ||
              (g.type === "testing" && TESTING_METRICS.find((m) => m.key === g.testingMetric)?.lowerIsBetter);
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
                    ) : g.type === "skill" ? (
                      <Timer className="h-4 w-4 text-primary" />
                    ) : (
                      <Target className="h-4 w-4 text-primary" />
                    )}
                    {label}
                    {g.achieved && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-500">
                        <Trophy className="h-3 w-3" />
                        {t("Achieved")}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={t("Delete goal: {label}", { label })}
                    onClick={() => deleteGoal.mutate(g.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {t("Target: {value} {unit}", { value: g.targetValue, unit: g.targetUnit })}
                  {g.targetDate
                    ? ` ${t("by {date}", { date: t.date(parseISO(g.targetDate), { month: "short", day: "numeric", year: "numeric" }) })}`
                    : ""}
                  {g.currentValue != null
                    ? ` — ${t("currently {value} {unit}", { value: g.currentValue, unit: g.targetUnit })}`
                    : ` — ${t("no data yet")}`}
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
