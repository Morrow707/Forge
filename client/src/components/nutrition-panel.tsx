import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioChipGroup } from "@/components/filter-chip-group";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { Sparkles, Apple, Target } from "lucide-react";
import { FoodLogPanel } from "@/components/food-log-panel";
import { NUTRITION_GOALS, NUTRITION_GOAL_LABEL, type NutritionGoal } from "@shared/schema";

type NutritionGoalState = { nutritionGoal: NutritionGoal | null; nutritionGoalNote: string | null };

type NutritionTargets = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  waterOz: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  vitaminDMcg: number | null;
  potassiumMg: number | null;
  magnesiumMg: number | null;
  sodiumMg: number | null;
  vitaminB12Mcg: number | null;
  zincMg: number | null;
  notes: string | null;
} | null;

type FieldDef = { key: keyof NonNullable<NutritionTargets>; label: string; unit: string };

const MACRO_FIELDS: FieldDef[] = [
  { key: "caloriesKcal", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbsG", label: "Carbs", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "waterOz", label: "Water", unit: "oz" },
];

const MICRO_FIELDS: FieldDef[] = [
  { key: "calciumMg", label: "Calcium", unit: "mg" },
  { key: "ironMg", label: "Iron", unit: "mg" },
  { key: "vitaminDMcg", label: "Vitamin D", unit: "mcg" },
  { key: "potassiumMg", label: "Potassium", unit: "mg" },
  { key: "magnesiumMg", label: "Magnesium", unit: "mg" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "vitaminB12Mcg", label: "Vitamin B12", unit: "mcg" },
  { key: "zincMg", label: "Zinc", unit: "mg" },
];

type FormState = Record<string, string> & { notes: string };

function emptyForm(): FormState {
  const state: Record<string, string> = { notes: "" };
  for (const f of [...MACRO_FIELDS, ...MICRO_FIELDS]) state[f.key] = "";
  return state as FormState;
}

function toForm(targets: NutritionTargets): FormState {
  if (!targets) return emptyForm();
  const state: Record<string, string> = { notes: targets.notes ?? "" };
  for (const f of [...MACRO_FIELDS, ...MICRO_FIELDS]) {
    const v = targets[f.key];
    state[f.key] = v == null ? "" : String(v);
  }
  return state as FormState;
}

/** Macro/micro nutrition targets -- deliberately never AI-generated (see
 * answerNutritionQuestion's hard rules on the server): a human always sets
 * the actual numbers, whether that's a coach backed by a real team
 * nutritionist, or a Free Agent managing their own with their own
 * nutritionist outside the app. This panel is embedded directly on the
 * athlete's own progress page (self-service) and wrapped in a dialog for
 * the coach's roster view, same reuse pattern as GoalsPanel. */
export function NutritionPanel({
  nutritionUrl,
  editable,
  askUrl,
  goalUrl,
  foodLogUrl,
  foodLogEditable,
}: {
  nutritionUrl: string;
  editable: boolean;
  askUrl?: string;
  /** Only ever passed alongside askUrl (Free Agent) -- the nutrition AI's
   * one-time goal questionnaire (see setNutritionGoalSchema). Shown instead
   * of the ask box until answered, then remembered; a "Set new goal" button
   * wipes it to re-trigger the questionnaire. */
  goalUrl?: string;
  /** Distinct from `editable` above: `editable` is about the *targets*
   * (a coach or a Free Agent sets those), while food-log editability is
   * about whether the current viewer IS the athlete -- a coach can view a
   * coached athlete's food log (foodLogEditable=false) while that same
   * athlete edits their own targets nowhere (editable=false) but still
   * logs their own food (foodLogEditable=true) on their own page. */
  foodLogUrl?: string;
  foodLogEditable?: boolean;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [goalChoice, setGoalChoice] = useState<string>("");
  const [goalNote, setGoalNote] = useState("");

  const { data, isLoading } = useQuery<NutritionTargets>({
    queryKey: [nutritionUrl],
    queryFn: () => getJson(nutritionUrl),
  });

  const { data: goalData, isLoading: goalLoading } = useQuery<NutritionGoalState>({
    queryKey: [goalUrl],
    queryFn: () => getJson(goalUrl!),
    enabled: !!goalUrl,
  });

  useEffect(() => {
    if (data !== undefined) setForm(toForm(data));
  }, [data]);

  const setGoalMutation = useMutation({
    mutationFn: async () => {
      const nutritionGoal = NUTRITION_GOALS.find((g) => NUTRITION_GOAL_LABEL[g] === goalChoice);
      const res = await apiRequest("POST", goalUrl!, {
        nutritionGoal,
        nutritionGoalNote: goalNote.trim() || null,
      });
      return res.json();
    },
    onSuccess: (result) => {
      qc.setQueryData([goalUrl], result);
      toast.success("Goal saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save your goal"),
  });

  const resetGoalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", goalUrl!);
      return res.json();
    },
    onSuccess: (result) => {
      qc.setQueryData([goalUrl], result);
      setGoalChoice("");
      setGoalNote("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't reset your goal"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, number | string | null> = {
        notes: form.notes.trim() || null,
      };
      for (const f of [...MACRO_FIELDS, ...MICRO_FIELDS]) {
        const raw = form[f.key].trim();
        payload[f.key] = raw ? Number(raw) : null;
      }
      const res = await apiRequest("PATCH", nutritionUrl, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [nutritionUrl] });
      toast.success("Nutrition targets saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save"),
  });

  const askMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", askUrl!, { question });
      return res.json();
    },
    onSuccess: (result) => {
      setAnswer(result.answer);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't get an answer"),
  });

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-md bg-surface" />;
  }

  function renderField(f: FieldDef) {
    if (!editable) {
      const value = data?.[f.key];
      return (
        <div key={f.key} className="rounded-md border border-border p-2.5">
          <p className="text-xs text-muted-foreground">{f.label}</p>
          <p className="font-semibold">{value != null ? `${value} ${f.unit}` : "Not set"}</p>
        </div>
      );
    }
    return (
      <div key={f.key} className="space-y-1.5">
        <Label htmlFor={`nutrition-${f.key}`}>
          {f.label} ({f.unit})
        </Label>
        <Input
          id={`nutrition-${f.key}`}
          type="number"
          inputMode="decimal"
          min={0}
          value={form[f.key]}
          onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
        />
      </div>
    );
  }

  const hasAnyTarget =
    !!data && [...MACRO_FIELDS, ...MICRO_FIELDS].some((f) => data[f.key] != null);

  return (
    <div className="space-y-5">
      {!editable && !hasAnyTarget && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No nutrition targets set yet -- your coach hasn't added a plan here.
        </p>
      )}

      {(editable || hasAnyTarget) && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Macros
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{MACRO_FIELDS.map(renderField)}</div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Micros
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">{MICRO_FIELDS.map(renderField)}</div>
          </div>
        </>
      )}

      {editable ? (
        <div className="space-y-1.5">
          <Label htmlFor="nutrition-notes">Notes</Label>
          <Textarea
            id="nutrition-notes"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="e.g. per team RD's plan, reviewed 3/1"
            rows={2}
          />
        </div>
      ) : (
        data?.notes && (
          <div className="rounded-md border border-border p-2.5 text-sm">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p>{data.notes}</p>
          </div>
        )
      )}

      {editable && (
        <Button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          Save Targets
        </Button>
      )}

      {askUrl && (
        <div className="space-y-3 border-t border-border pt-4">
          {goalUrl && !goalLoading && !goalData?.nutritionGoal && (
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-primary" />
                What's your main nutrition goal right now?
              </Label>
              <p className="text-xs text-muted-foreground">
                One-time -- the nutrition AI remembers this so it doesn't ask again. You can
                change it anytime with "Set new goal."
              </p>
              <RadioChipGroup
                label="Goal"
                options={NUTRITION_GOALS.map((g) => NUTRITION_GOAL_LABEL[g])}
                value={goalChoice}
                onChange={setGoalChoice}
              />
              <Textarea
                value={goalNote}
                onChange={(e) => setGoalNote(e.target.value)}
                placeholder="Anything else? (optional)"
                rows={2}
                maxLength={300}
              />
              <Button
                type="button"
                size="sm"
                disabled={!goalChoice || setGoalMutation.isPending}
                onClick={() => setGoalMutation.mutate()}
              >
                Save Goal
              </Button>
            </div>
          )}

          {goalUrl && goalData?.nutritionGoal && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-primary" />
                Nutrition goal:{" "}
                <span className="font-semibold">
                  {NUTRITION_GOAL_LABEL[goalData.nutritionGoal]}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={resetGoalMutation.isPending}
                onClick={() => resetGoalMutation.mutate()}
              >
                Set new goal
              </Button>
            </div>
          )}

          {(!goalUrl || !!goalData?.nutritionGoal) && (
            <div className="space-y-2">
              <Label htmlFor="nutrition-ask" className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Ask about nutrition
              </Label>
              <p className="text-xs text-muted-foreground">
                General sports-nutrition education -- not a personal plan. For an individualized
                number, talk to a coach or a registered dietitian.
              </p>
              <div className="flex gap-2">
                <Input
                  id="nutrition-ask"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. How much protein do athletes usually need?"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && question.trim() && !askMutation.isPending) {
                      setAnswer(null);
                      askMutation.mutate();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!question.trim() || askMutation.isPending}
                  onClick={() => {
                    setAnswer(null);
                    askMutation.mutate();
                  }}
                >
                  {askMutation.isPending ? "Thinking..." : "Ask"}
                </Button>
              </div>
              {answer && (
                <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <Apple className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p>{answer}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {foodLogUrl && (
        <FoodLogPanel
          fetchUrl={foodLogUrl}
          editable={!!foodLogEditable}
          targets={
            data
              ? {
                  caloriesKcal: data.caloriesKcal,
                  proteinG: data.proteinG,
                  carbsG: data.carbsG,
                  fatG: data.fatG,
                  calciumMg: data.calciumMg,
                  ironMg: data.ironMg,
                  vitaminDMcg: data.vitaminDMcg,
                  potassiumMg: data.potassiumMg,
                  magnesiumMg: data.magnesiumMg,
                  sodiumMg: data.sodiumMg,
                  vitaminB12Mcg: data.vitaminB12Mcg,
                  zincMg: data.zincMg,
                }
              : null
          }
        />
      )}
    </div>
  );
}
