import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SkillPickerDialog } from "@/components/skill-picker-dialog";
import { AssignSkillProgramDialog } from "@/components/assign-skill-program-dialog";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, Trash2, Save, ArrowLeft, MoonStar, Send, Lock, ChevronUp, ChevronDown } from "lucide-react";
import type { SkillExercise } from "@shared/schema";

type RosterEntry = { id: number; name: string; email: string };

type LocalExercise = {
  key: string;
  skillExerciseId: number;
  skillExerciseName: string;
  sets: number;
  reps: string;
  restSeconds: string;
  notes: string;
};

type LocalDay = {
  key: string;
  title: string;
  isRestDay: boolean;
  exercises: LocalExercise[];
};

function uid() {
  return crypto.randomUUID();
}

function makeDay(): LocalDay {
  return { key: uid(), title: "Skill Session", isRestDay: false, exercises: [] };
}

// Same "flat day list, bucketed into weeks of 7" model as the strength
// program builder -- there's no separate "Add Week" action, just days.
function chunkIntoWeeks(days: LocalDay[]) {
  const chunks: LocalDay[][] = [];
  for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));
  return chunks;
}

function stateFromProgram(program: any) {
  const days: LocalDay[] = [];
  const weekNames: string[] = [];
  for (const w of program.weeks) {
    weekNames.push(w.name ?? `Week ${w.weekNumber}`);
    for (const d of w.days) {
      days.push({
        key: uid(),
        title: d.title,
        isRestDay: d.isRestDay,
        exercises: d.exercises.map((pe: any) => ({
          key: uid(),
          skillExerciseId: pe.skillExercise.id,
          skillExerciseName: pe.skillExercise.name,
          sets: pe.sets,
          reps: pe.reps,
          restSeconds: pe.restSeconds != null ? String(pe.restSeconds) : "",
          notes: pe.notes ?? "",
        })),
      });
    }
  }
  return {
    name: program.name as string,
    description: (program.description as string) ?? "",
    days,
    weekNames,
  };
}

/** Skill Program Builder -- mirrors the strength ProgramBuilderPage's
 * flat-days-chunked-into-weeks editing model, but against skill_programs
 * and deliberately without the strength-specific machinery that doesn't
 * apply to a drill: no training blocks, no supersets, no drag reordering
 * (simple up/down buttons instead -- skill sessions are typically short
 * lists), no AI chat, no tracking-level/video-check toggle. */
export function SkillProgramBuilderPage({
  apiBase,
  routeBase,
}: {
  apiBase: string;
  routeBase: string;
}) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const programId = Number(id);

  const { data: program, isLoading } = useQuery<any>({
    queryKey: [`${apiBase}/skill-programs`, programId],
    queryFn: () => getJson(`${apiBase}/skill-programs/${programId}`),
  });
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });
  const editable = program?.editable !== false;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState<LocalDay[]>([]);
  const [weekNames, setWeekNames] = useState<string[]>([]);
  const [pickerForDay, setPickerForDay] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  useEffect(() => {
    if (program && !hydrated) {
      const state = stateFromProgram(program);
      setName(state.name);
      setDescription(state.description);
      setDays(state.days);
      setWeekNames(state.weekNames);
      setHydrated(true);
    }
  }, [program, hydrated]);

  function updateDay(dayKey: string, updater: (day: LocalDay) => LocalDay) {
    setDays((prev) => prev.map((d) => (d.key === dayKey ? updater(d) : d)));
  }

  function addDay() {
    setDays((prev) => [...prev, makeDay()]);
  }

  function removeDay(dayKey: string) {
    setDays((prev) => prev.filter((d) => d.key !== dayKey));
  }

  function renameWeek(weekIndex: number, value: string) {
    setWeekNames((prev) => {
      const next = [...prev];
      next[weekIndex] = value;
      return next;
    });
  }

  const weekChunks = chunkIntoWeeks(days);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description,
        weeks: weekChunks.map((chunk, wi) => ({
          weekNumber: wi + 1,
          name: weekNames[wi] || `Week ${wi + 1}`,
          days: chunk.map((d, di) => ({
            dayNumber: di + 1,
            title: d.title,
            isRestDay: d.isRestDay,
            exercises: d.exercises.map((ex, i) => ({
              skillExerciseId: ex.skillExerciseId,
              orderIndex: i,
              sets: Number(ex.sets) || 1,
              reps: ex.reps || "10",
              restSeconds: ex.restSeconds ? Number(ex.restSeconds) : null,
              notes: ex.notes || null,
            })),
          })),
        })),
      };
      const res = await apiRequest("PUT", `${apiBase}/skill-programs/${programId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/skill-programs`] });
      toast.success("Skill program saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save skill program"),
  });

  if (isLoading || !hydrated) {
    return (
      <AppShell title="Loading Skill Program…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Skill Program Builder"
      actions={
        <>
          <Button variant="outline" onClick={() => navigate(routeBase)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button variant="secondary" onClick={() => setAssignOpen(true)}>
            <Send className="h-4 w-4" />
            Assign Program
          </Button>
          {editable && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving…" : "Save Program"}
            </Button>
          )}
        </>
      }
    >
      {program?.ownerLabel && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ExerciseOwnershipBadge
            isForgeOfficial={!!program.isForgeOfficial}
            ownerLabel={program.ownerLabel}
          />
          {!editable && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Forge official — read-only
            </span>
          )}
        </div>
      )}

      <fieldset disabled={!editable} className="contents">
        <div className="min-w-0">
          <Card className="mb-6">
            <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Skill program name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={1}
                />
              </div>
            </CardContent>
          </Card>

          {days.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
              <p>No days yet. Add skill sessions one at a time.</p>
              <Button onClick={addDay}>
                <Plus className="h-4 w-4" />
                Add Day
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {weekChunks.map((chunk, wi) => (
                <div key={wi}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Input
                      value={weekNames[wi] || `Week ${wi + 1}`}
                      onChange={(e) => renameWeek(wi, e.target.value)}
                      className="h-8 max-w-xs border-none bg-transparent px-0 text-xs font-bold uppercase tracking-wide text-muted-foreground focus-visible:ring-0"
                    />
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {chunk.map((day, di) => (
                      <DayCard
                        key={day.key}
                        dayNumber={wi * 7 + di + 1}
                        day={day}
                        onChange={(updater) => updateDay(day.key, updater)}
                        onAddExercise={() => setPickerForDay(day.key)}
                        onRemove={() => removeDay(day.key)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {days.length > 0 && (
            <Button variant="outline" className="mt-4" onClick={addDay}>
              <Plus className="h-4 w-4" />
              Add Day
            </Button>
          )}
        </div>
      </fieldset>

      <SkillPickerDialog
        apiBase={apiBase}
        open={pickerForDay !== null}
        onOpenChange={(open) => !open && setPickerForDay(null)}
        onSelect={(skill: SkillExercise) => {
          if (!pickerForDay) return;
          updateDay(pickerForDay, (d) => ({
            ...d,
            exercises: [
              ...d.exercises,
              {
                key: uid(),
                skillExerciseId: skill.id,
                skillExerciseName: skill.name,
                sets: 3,
                reps: "10",
                restSeconds: "",
                notes: "",
              },
            ],
          }));
        }}
      />

      <AssignSkillProgramDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        roster={roster}
        programs={[{ id: programId, name }]}
        programId={programId}
      />
    </AppShell>
  );
}

function DayCard({
  day,
  dayNumber,
  onChange,
  onAddExercise,
  onRemove,
}: {
  day: LocalDay;
  dayNumber: number;
  onChange: (updater: (day: LocalDay) => LocalDay) => void;
  onAddExercise: () => void;
  onRemove: () => void;
}) {
  function moveExercise(index: number, direction: -1 | 1) {
    onChange((d) => {
      const next = [...d.exercises];
      const target = index + direction;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, exercises: next };
    });
  }

  return (
    <Card className={day.isRestDay ? "opacity-70" : ""}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline">Day {dayNumber}</Badge>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={day.isRestDay}
                onCheckedChange={(checked) =>
                  onChange((d) => ({ ...d, isRestDay: checked === true }))
                }
              />
              Rest day
            </label>
            <button
              type="button"
              aria-label={`Remove Day ${dayNumber}`}
              onClick={onRemove}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Input
          value={day.title}
          onChange={(e) => {
            const val = e.target.value;
            onChange((d) => ({ ...d, title: val }));
          }}
          className="font-semibold"
        />

        {day.isRestDay ? (
          <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-6 text-sm text-muted-foreground">
            <MoonStar className="h-4 w-4" />
            Recovery day
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {day.exercises.map((ex, i) => (
                <div
                  key={ex.key}
                  className="rounded-md border border-teal-900/40 bg-teal-950/10 p-2.5"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={`Move ${ex.skillExerciseName} up`}
                        disabled={i === 0}
                        onClick={() => moveExercise(i, -1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${ex.skillExerciseName} down`}
                        disabled={i === day.exercises.length - 1}
                        onClick={() => moveExercise(i, 1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="flex-1 truncate text-sm font-semibold">
                      {ex.skillExerciseName}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${ex.skillExerciseName}`}
                      onClick={() =>
                        onChange((d) => ({
                          ...d,
                          exercises: d.exercises.filter((e) => e.key !== ex.key),
                        }))
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <FieldInput
                      label="Sets"
                      value={String(ex.sets)}
                      type="number"
                      onChange={(v) =>
                        onChange((d) => ({
                          ...d,
                          exercises: d.exercises.map((e) =>
                            e.key === ex.key ? { ...e, sets: Number(v) || 0 } : e,
                          ),
                        }))
                      }
                    />
                    <FieldInput
                      label="Reps"
                      value={ex.reps}
                      onChange={(v) =>
                        onChange((d) => ({
                          ...d,
                          exercises: d.exercises.map((e) =>
                            e.key === ex.key ? { ...e, reps: v } : e,
                          ),
                        }))
                      }
                    />
                    <FieldInput
                      label="Rest (sec)"
                      value={ex.restSeconds}
                      type="number"
                      onChange={(v) =>
                        onChange((d) => ({
                          ...d,
                          exercises: d.exercises.map((e) =>
                            e.key === ex.key ? { ...e, restSeconds: v } : e,
                          ),
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            {day.exercises.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">No drills yet</p>
            )}
            <Button variant="secondary" size="sm" className="w-full" onClick={onAddExercise}>
              <Plus className="h-3.5 w-3.5" />
              Add Skill Drill
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FieldInput({
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
