import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, ChevronLeft, ChevronRight, ChevronDown, X } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { todayIso } from "@/lib/local-date";
import { FOOD_LOG_MEALS, FOOD_LOG_MEAL_LABEL, type FoodLogMeal } from "@shared/schema";
import { NutrientRings } from "@/components/nutrient-rings";

const MICRO_FIELDS = [
  ["calciumMg", "Calcium", "mg"],
  ["ironMg", "Iron", "mg"],
  ["vitaminDMcg", "Vitamin D", "mcg"],
  ["potassiumMg", "Potassium", "mg"],
  ["magnesiumMg", "Magnesium", "mg"],
  ["vitaminB12Mcg", "Vitamin B12", "mcg"],
  ["zincMg", "Zinc", "mg"],
] as const;

// Barcode scanning (@zxing/browser) and the photo-analysis path it drags in
// alongside it are only ever needed once someone actually opens the Log Food
// dialog -- a static import here would bundle that weight into every
// nutrition-panel load, including a coach's read-only view of a roster
// athlete that never renders this dialog at all. Splitting it into its own
// chunk means a plain "check my macros" visit never fetches it.
const FoodScannerDialog = lazy(() =>
  import("@/components/food-scanner-dialog").then((m) => ({ default: m.FoodScannerDialog })),
);

type FoodLogEntry = {
  id: number;
  description: string;
  brand: string | null;
  servingDescription: string | null;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  vitaminDMcg: number | null;
  potassiumMg: number | null;
  magnesiumMg: number | null;
  vitaminB12Mcg: number | null;
  zincMg: number | null;
  source: "barcode" | "search" | "manual";
  meal: FoodLogMeal | null;
};

type WaterEntry = { id: number; amountOz: number; loggedAt: string };

type FoodLogResponse = {
  entries: FoodLogEntry[];
  totals: {
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sodiumMg: number;
    calciumMg: number;
    ironMg: number;
    vitaminDMcg: number;
    potassiumMg: number;
    magnesiumMg: number;
    vitaminB12Mcg: number;
    zincMg: number;
  };
  water: WaterEntry[];
  waterOz: number;
};

type Targets = {
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
} | null;

// Ordered as a day is eaten, with the bucket for entries that have no meal last -- see
// foodLogMealEnum in shared/schema.ts for why that bucket has to exist at all.
const MEAL_SECTIONS: { key: FoodLogMeal | null; label: string }[] = [
  ...FOOD_LOG_MEALS.map((key) => ({ key: key as FoodLogMeal | null, label: FOOD_LOG_MEAL_LABEL[key] })),
  { key: null, label: "Not sorted" },
];

const MICRO_TARGET_FIELDS = [
  ["calciumMg", "Calcium", "mg"],
  ["ironMg", "Iron", "mg"],
  ["vitaminDMcg", "Vitamin D", "mcg"],
  ["potassiumMg", "Potassium", "mg"],
  ["magnesiumMg", "Magnesium", "mg"],
  ["sodiumMg", "Sodium", "mg"],
  ["vitaminB12Mcg", "Vitamin B12", "mcg"],
  ["zincMg", "Zinc", "mg"],
] as const;

export function ProgressBar({ label, value, target, unit }: { label: string; value: number; target: number | null; unit: string }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {Math.round(value)}
          {target ? ` / ${target}` : ""} {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct ?? Math.min(100, value > 0 ? 10 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/** Logged food vs. the athlete's nutritionTargets, for a given day --
 * embedded alongside NutritionPanel wherever that lives. `fetchUrl` points
 * at either the athlete's own endpoint (self-service, editable) or the
 * coach's read-only roster sub-resource (view-only, no add/delete) -- same
 * parametrized-panel pattern as NutritionPanel/GoalsPanel. Logging is never
 * an AI capability (see foodLogEntries' schema comment), so the editable
 * case is always free regardless of coach/paywall status. */
export function FoodLogPanel({
  fetchUrl,
  editable,
  targets,
}: {
  fetchUrl: string;
  editable: boolean;
  targets: Targets;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => todayIso());
  const [scannerOpen, setScannerOpen] = useState(false);
  // Sticky once true -- mounts the lazy dialog (and fetches its chunk) the
  // first time it's actually opened, then leaves it mounted so closing and
  // reopening doesn't re-fetch or lose in-progress state.
  const [scannerEverOpened, setScannerEverOpened] = useState(false);
  const [expandedMicros, setExpandedMicros] = useState<Set<number>>(new Set());
  const [editingEntry, setEditingEntry] = useState<FoodLogEntry | null>(null);
  const [dayMicrosOpen, setDayMicrosOpen] = useState(false);

  const queryKey = [fetchUrl, date];
  const { data, isLoading } = useQuery<FoodLogResponse>({
    queryKey,
    queryFn: () => getJson(`${fetchUrl}?date=${date}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/athlete/food-log/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => toast.error("Couldn't remove that entry"),
  });

  function handleEntrySaved() {
    qc.invalidateQueries({ queryKey });
    setEditingEntry(null);
  }

  const totals = data?.totals ?? {
    caloriesKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sodiumMg: 0,
    calciumMg: 0,
    ironMg: 0,
    vitaminDMcg: 0,
    potassiumMg: 0,
    magnesiumMg: 0,
    vitaminB12Mcg: 0,
    zincMg: 0,
  };
  const waterOz = data?.waterOz ?? 0;
  const isToday = date === todayIso();
  // Secondary to the macros above -- only worth a row (and only shown
  // collapsed) when there's actually something to compare: a target set for
  // it, or some of it logged today.
  const relevantDayMicros = MICRO_TARGET_FIELDS.filter(
    ([key]) => (targets?.[key] ?? null) != null || totals[key] > 0,
  );

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Food Log</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setDate((d) => format(addDays(parseISO(d), -1), "yyyy-MM-dd"))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-24 text-center text-xs text-muted-foreground">
            {isToday ? "Today" : format(parseISO(date), "MMM d")}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={isToday}
            onClick={() => setDate((d) => format(addDays(parseISO(d), 1), "yyyy-MM-dd"))}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-20 animate-pulse rounded-md bg-surface" />
      ) : (
        <>
          <NutrientRings
            calories={{ value: totals.caloriesKcal, target: targets?.caloriesKcal ?? null }}
            protein={{ value: totals.proteinG, target: targets?.proteinG ?? null }}
            carbs={{ value: totals.carbsG, target: targets?.carbsG ?? null }}
            fat={{ value: totals.fatG, target: targets?.fatG ?? null }}
            fiber={{ value: totals.fiberG, target: targets?.fiberG ?? null }}
            water={{ value: waterOz, target: targets?.waterOz ?? null }}
          />

          <WaterSection
            totalOz={waterOz}
            targetOz={targets?.waterOz ?? null}
            entries={data?.water ?? []}
            editable={editable}
            date={date}
            onChanged={() => qc.invalidateQueries({ queryKey })}
          />

          {relevantDayMicros.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setDayMicrosOpen((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${dayMicrosOpen ? "rotate-180" : ""}`} />
                Micros
              </button>
              {dayMicrosOpen && (
                <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
                  {relevantDayMicros.map(([key, label, unit]) => {
                    const target = targets?.[key] ?? null;
                    return (
                      <div key={key} className="flex justify-between">
                        <span>{label}</span>
                        <span>
                          {Math.round(totals[key])}
                          {target ? `/${target}` : ""} {unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* GROUPED BY MEAL, WITH AN HONEST BUCKET FOR WHAT HAS NONE.
              Entries logged before meal grouping existed have no meal, and deriving one from
              their timestamp after the fact would be inventing a fact about somebody's day.
              They sit under "Not sorted" until the athlete moves them, which the edit dialog
              now lets them do. An empty meal renders nothing rather than an empty heading. */}
          <div className="space-y-3">
            {!data?.entries.length && (
              <p className="py-3 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
            )}
            {MEAL_SECTIONS.map(({ key, label }) => {
              const inMeal = (data?.entries ?? []).filter((e) => (e.meal ?? null) === key);
              if (inMeal.length === 0) return null;
              const mealCalories = inMeal.reduce((sum, e) => sum + (e.caloriesKcal ?? 0), 0);
              return (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <span className="text-xs text-muted-foreground">{Math.round(mealCalories)} kcal</span>
                  </div>
                  {inMeal.map((e) => {
                const presentMicros = MICRO_FIELDS.filter(([key]) => e[key] != null);
                const microsOpen = expandedMicros.has(e.id);
                return (
                  <div key={e.id} className="rounded-md border border-border p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.servingDescription ? `${e.servingDescription} -- ` : ""}
                          {e.caloriesKcal ?? "?"} kcal
                          {e.proteinG != null ? `, ${e.proteinG}g protein` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {presentMicros.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={microsOpen ? "Hide micros" : "Show micros"}
                            onClick={() =>
                              setExpandedMicros((prev) => {
                                const next = new Set(prev);
                                if (next.has(e.id)) next.delete(e.id);
                                else next.add(e.id);
                                return next;
                              })
                            }
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${microsOpen ? "rotate-180" : ""}`}
                            />
                          </Button>
                        )}
                        {editable && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Edit entry"
                              onClick={() => setEditingEntry(e)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Remove entry"
                              onClick={() => deleteMutation.mutate(e.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {microsOpen && presentMicros.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground sm:grid-cols-3">
                        {presentMicros.map(([key, label, unit]) => (
                          <div key={key} className="flex justify-between">
                            <span>{label}</span>
                            <span className="font-medium text-foreground">
                              {e[key]}
                              {unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}

      {editable && isToday && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setScannerEverOpened(true);
            setScannerOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Log Food
        </Button>
      )}

      {scannerEverOpened && (
        <Suspense fallback={null}>
          <FoodScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} date={date} />
        </Suspense>
      )}

      <EditFoodEntryDialog
        entry={editingEntry}
        onOpenChange={(open) => !open && setEditingEntry(null)}
        onSaved={handleEntrySaved}
      />
    </div>
  );
}

/** Quick-add sizes, in ounces. A standard glass, a big glass, a small and a large bottle, and a
 *  jug -- the containers an athlete actually drinks out of, rather than a number pad. Anything
 *  that is not one of these is two taps of something close, which is what a rough log deserves;
 *  water intake is not a measurement anyone gets to the ounce. */
const WATER_QUICK_ADD_OZ = [8, 12, 16, 24, 32];

function WaterSection({
  totalOz,
  targetOz,
  entries,
  editable,
  date,
  onChanged,
}: {
  totalOz: number;
  targetOz: number | null;
  entries: WaterEntry[];
  editable: boolean;
  date: string;
  onChanged: () => void;
}) {
  const addMutation = useMutation({
    mutationFn: (amountOz: number) =>
      apiRequest("POST", "/api/athlete/water-log", { date, amountOz }),
    onSuccess: onChanged,
    onError: () => toast.error("Couldn't log that"),
  });
  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/athlete/water-log/${id}`),
    onSuccess: onChanged,
    onError: () => toast.error("Couldn't remove that"),
  });

  // Nothing logged and no target set means this athlete is not tracking water at all, and a
  // coach viewing a read-only day should not get an empty widget for it either.
  if (!editable && totalOz === 0 && targetOz == null) return null;

  return (
    <div className="space-y-2">
      {editable && (
        <div className="flex flex-wrap gap-1.5">
          {WATER_QUICK_ADD_OZ.map((oz) => (
            <Button
              key={oz}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={addMutation.isPending}
              onClick={() => addMutation.mutate(oz)}
            >
              +{oz} oz
            </Button>
          ))}
        </div>
      )}
      {/* Each pour is its own row with its own delete -- a running total that only ever went up
          couldn't be corrected without inventing a subtract that could take it negative, and
          "undo last" only ever reversed the single most recent tap. This removes exactly the
          entry that was wrong, whichever one that is. */}
      {entries.length > 0 && (
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
            >
              <span>
                {format(parseISO(entry.loggedAt), "h:mm a")} &middot; {entry.amountOz} oz
              </span>
              {editable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Remove ${entry.amountOz} oz entry`}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(entry.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MACRO_FIELDS = [
  ["caloriesKcal", "Calories", ""],
  ["proteinG", "Protein", "g"],
  ["carbsG", "Carbs", "g"],
  ["fatG", "Fat", "g"],
  ["fiberG", "Fiber", "g"],
  ["sodiumMg", "Sodium", "mg"],
] as const;

type EditableField = (typeof MACRO_FIELDS)[number][0] | (typeof MICRO_FIELDS)[number][0];

/** Lets an athlete correct/fill in any macro or micro on an already-logged
 * entry -- previously the only edit action was delete-and-relog from
 * scratch. Every field is optional (missing stays missing, not coerced to
 * 0), same convention as logging it the first time. */
function EditFoodEntryDialog({
  entry,
  onOpenChange,
  onSaved,
}: {
  entry: FoodLogEntry | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState("");
  const [values, setValues] = useState<Partial<Record<EditableField, string>>>({});
  const [micrasOpen, setMicrosOpen] = useState(false);
  const [hydratedFor, setHydratedFor] = useState<number | null>(null);
  // Null is a real, keepable value here, not an empty form field -- an entry logged before meal
  // grouping existed has no meal, and the athlete may not want to invent one for a thing they
  // ate three weeks ago either. Moving it into a meal is a choice they make, not one this
  // dialog makes for them by defaulting the picker.
  const [meal, setMeal] = useState<FoodLogMeal | null>(null);

  useEffect(() => {
    if (entry && hydratedFor !== entry.id) {
      setDescription(entry.description);
      setValues(
        Object.fromEntries(
          [...MACRO_FIELDS, ...MICRO_FIELDS].map(([key]) => [
            key,
            entry[key] != null ? String(entry[key]) : "",
          ]),
        ),
      );
      setMeal(entry.meal ?? null);
      setHydratedFor(entry.id);
    }
    if (!entry) setHydratedFor(null);
  }, [entry, hydratedFor]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { description: description.trim() };
      for (const [key] of [...MACRO_FIELDS, ...MICRO_FIELDS]) {
        const raw = values[key];
        payload[key] = raw && raw.trim() !== "" ? Number(raw) : null;
      }
      payload.meal = meal;
      await apiRequest("PATCH", `/api/athlete/food-log/${entry!.id}`, payload);
    },
    onSuccess: () => {
      toast.success("Entry updated");
      onSaved();
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save changes"),
  });

  return (
    <Dialog open={entry != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-food-desc">Food</Label>
            <Input
              id="edit-food-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <p className="label-xs">Meal</p>
            <div className="flex flex-wrap gap-1">
              {MEAL_SECTIONS.map(({ key, label }) => (
                <Button
                  key={label}
                  type="button"
                  variant={meal === key ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setMeal(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MACRO_FIELDS.map(([key, label, unit]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`edit-${key}`} className="text-xs">
                  {label}
                  {unit ? ` (${unit})` : ""}
                </Label>
                <Input
                  id={`edit-${key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setMicrosOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${micrasOpen ? "rotate-180" : ""}`} />
            Micros (optional)
          </button>
          {micrasOpen && (
            <div className="grid grid-cols-3 gap-2">
              {MICRO_FIELDS.map(([key, label, unit]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`edit-${key}`} className="text-xs">
                    {label} ({unit})
                  </Label>
                  <Input
                    id={`edit-${key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={values[key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!description.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
