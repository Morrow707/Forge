import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkillPickerDialog } from "@/components/skill-picker-dialog";
import { EnrollInClassDialog } from "@/components/enroll-in-class-dialog";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Timer,
  Lock,
  UserPlus,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillExercise } from "@shared/schema";

type RosterEntry = { id: number; name: string; email: string };
type SkillTrackingLevel = "none" | "sprint" | "mechanics";
type UnlockRule = "immediate" | "time_elapsed" | "sessions_logged" | "reps_logged" | "manual";

type LocalExercise = {
  key: string;
  skillExerciseId: number;
  skillExerciseName: string;
  sets: number;
  reps: string;
  restSeconds: string;
  notes: string;
  trackingLevel: SkillTrackingLevel;
};

type LocalLesson = {
  key: string;
  id?: number;
  title: string;
  description: string;
  unlockRule: UnlockRule;
  unlockThreshold: string;
  priceDollars: string;
  exercises: LocalExercise[];
};

function uid() {
  return crypto.randomUUID();
}

function makeLesson(n: number): LocalLesson {
  return {
    key: uid(),
    title: `Lesson ${n}`,
    description: "",
    unlockRule: "immediate",
    unlockThreshold: "3",
    priceDollars: "",
    exercises: [],
  };
}

function stateFromClass(cls: any) {
  return {
    name: cls.name as string,
    description: (cls.description as string) ?? "",
    lessons: cls.lessons.map((l: any) => ({
      key: uid(),
      id: l.id,
      title: l.title,
      description: l.description ?? "",
      unlockRule: (l.unlockRule ?? "immediate") as UnlockRule,
      unlockThreshold: l.unlockThreshold != null ? String(l.unlockThreshold) : "3",
      priceDollars: l.priceCents != null ? (l.priceCents / 100).toFixed(2) : "",
      exercises: l.exercises.map((pe: any) => ({
        key: uid(),
        skillExerciseId: pe.skillExercise.id,
        skillExerciseName: pe.skillExercise.name,
        sets: pe.sets,
        reps: pe.reps,
        restSeconds: pe.restSeconds != null ? String(pe.restSeconds) : "",
        notes: pe.notes ?? "",
        trackingLevel: (pe.trackingLevel ?? "none") as SkillTrackingLevel,
      })),
    })),
  };
}

const UNLOCK_RULE_OPTIONS: { value: UnlockRule; label: string; unit: string | null }[] = [
  { value: "immediate", label: "Immediately", unit: null },
  { value: "time_elapsed", label: "Days since previous lesson started", unit: "days" },
  { value: "sessions_logged", label: "Camera-tracked sessions logged", unit: "sessions" },
  { value: "reps_logged", label: "Camera-tracked reps logged", unit: "reps" },
  { value: "manual", label: "Coach unlocks manually", unit: null },
];

/** Class builder -- an ordered list of Lessons, each a single hidden
 * skill-program day (see classLessons.skillProgramId in shared/schema.ts),
 * gated by the unlock rule shown on it (evaluated against the PREVIOUS
 * lesson's activity) and, for a Forge Class, an optional per-lesson price.
 * Lesson 1 always unlocks immediately -- its rule controls are hidden. */
export function ClassBuilderPage({
  apiBase,
  routeBase,
  showPricing = false,
  showEnroll = true,
}: {
  apiBase: string;
  routeBase: string;
  /** Only a Forge-official Class is ever sold to a Free Agent -- a coach's
   * own Class has no purchase concept, so the price field is hidden there. */
  showPricing?: boolean;
  showEnroll?: boolean;
}) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const classId = Number(id);

  const { data: cls, isLoading } = useQuery<any>({
    queryKey: [`${apiBase}/classes`, classId],
    queryFn: () => getJson(`${apiBase}/classes/${classId}`),
  });
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
    enabled: showEnroll,
  });
  const editable = cls?.editable !== false;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lessons, setLessons] = useState<LocalLesson[]>([]);
  const [pickerForLesson, setPickerForLesson] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  useEffect(() => {
    if (cls && !hydrated) {
      const state = stateFromClass(cls);
      setName(state.name);
      setDescription(state.description);
      setLessons(state.lessons);
      setHydrated(true);
    }
  }, [cls, hydrated]);

  function updateLesson(lessonKey: string, updater: (lesson: LocalLesson) => LocalLesson) {
    setLessons((prev) => prev.map((l) => (l.key === lessonKey ? updater(l) : l)));
  }

  function addLesson() {
    setLessons((prev) => [...prev, makeLesson(prev.length + 1)]);
  }

  function removeLesson(lessonKey: string) {
    setLessons((prev) => prev.filter((l) => l.key !== lessonKey));
  }

  function moveLesson(index: number, direction: -1 | 1) {
    setLessons((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description,
        lessons: lessons.map((l, i) => ({
          id: l.id,
          lessonNumber: i + 1,
          title: l.title,
          description: l.description || null,
          unlockRule: l.unlockRule,
          unlockThreshold:
            l.unlockRule === "immediate" || l.unlockRule === "manual"
              ? null
              : Number(l.unlockThreshold) || 1,
          priceCents:
            showPricing && l.priceDollars.trim()
              ? Math.round(parseFloat(l.priceDollars) * 100)
              : null,
          exercises: l.exercises.map((ex, i2) => ({
            skillExerciseId: ex.skillExerciseId,
            orderIndex: i2,
            sets: Number(ex.sets) || 1,
            reps: ex.reps || "10",
            restSeconds: ex.restSeconds ? Number(ex.restSeconds) : null,
            notes: ex.notes || null,
            trackingLevel: ex.trackingLevel,
          })),
        })),
      };
      const res = await apiRequest("PUT", `${apiBase}/classes/${classId}`, payload);
      return res.json();
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/classes`] });
      const state = stateFromClass(updated);
      setName(state.name);
      setDescription(state.description);
      setLessons(state.lessons);
      toast.success("Class saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save class"),
  });

  if (isLoading || !hydrated) {
    return (
      <AppShell title="Loading Class…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Class Builder"
      actions={
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(routeBase)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {showEnroll && (
              <Button variant="secondary" onClick={() => setEnrollOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Enroll Athletes
              </Button>
            )}
          </div>
          {editable && (
            <Button
              className="w-full sm:w-auto"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving…" : "Save Class"}
            </Button>
          )}
        </div>
      }
    >
      {cls?.ownerLabel && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ExerciseOwnershipBadge isForgeOfficial={!!cls.isForgeOfficial} ownerLabel={cls.ownerLabel} />
          {!editable && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Forge official — read-only
            </span>
          )}
        </div>
      )}

      <fieldset disabled={!editable} className="contents">
        <Card className="mb-6">
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Class name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={1} />
            </div>
          </CardContent>
        </Card>

        {lessons.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
            <GraduationCap className="h-8 w-8" />
            <p>No lessons yet. Add lesson 1 to start the curriculum.</p>
            <Button onClick={addLesson}>
              <Plus className="h-4 w-4" />
              Add Lesson
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {lessons.map((lesson, i) => (
              <LessonCard
                key={lesson.key}
                lesson={lesson}
                lessonNumber={i + 1}
                isFirst={i === 0}
                showPricing={showPricing}
                onChange={(updater) => updateLesson(lesson.key, updater)}
                onAddDrill={() => setPickerForLesson(lesson.key)}
                onRemove={() => removeLesson(lesson.key)}
                onMoveUp={() => moveLesson(i, -1)}
                onMoveDown={() => moveLesson(i, 1)}
                canMoveUp={i > 0}
                canMoveDown={i < lessons.length - 1}
              />
            ))}
          </div>
        )}

        {lessons.length > 0 && (
          <Button variant="outline" className="mt-4" onClick={addLesson}>
            <Plus className="h-4 w-4" />
            Add Lesson
          </Button>
        )}
      </fieldset>

      <SkillPickerDialog
        apiBase={apiBase}
        open={pickerForLesson !== null}
        onOpenChange={(open) => !open && setPickerForLesson(null)}
        onSelect={(skill: SkillExercise) => {
          if (!pickerForLesson) return;
          updateLesson(pickerForLesson, (l) => ({
            ...l,
            exercises: [
              ...l.exercises,
              {
                key: uid(),
                skillExerciseId: skill.id,
                skillExerciseName: skill.name,
                sets: 3,
                reps: "10",
                restSeconds: "",
                notes: "",
                trackingLevel: "none",
              },
            ],
          }));
        }}
      />

      {showEnroll && (
        <EnrollInClassDialog
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          roster={roster}
          classId={classId}
          apiBase={apiBase}
        />
      )}
    </AppShell>
  );
}

function LessonCard({
  lesson,
  lessonNumber,
  isFirst,
  showPricing,
  onChange,
  onAddDrill,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  lesson: LocalLesson;
  lessonNumber: number;
  isFirst: boolean;
  showPricing: boolean;
  onChange: (updater: (lesson: LocalLesson) => LocalLesson) => void;
  onAddDrill: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const ruleMeta = UNLOCK_RULE_OPTIONS.find((r) => r.value === lesson.unlockRule);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Lesson {lessonNumber}</Badge>
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="Move lesson up"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move lesson down"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label={`Remove Lesson ${lessonNumber}`}
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <Input
          value={lesson.title}
          onChange={(e) => {
            const val = e.target.value;
            onChange((l) => ({ ...l, title: val }));
          }}
          className="font-semibold"
          placeholder="Lesson title"
        />
        <Textarea
          value={lesson.description}
          onChange={(e) => {
            const val = e.target.value;
            onChange((l) => ({ ...l, description: val }));
          }}
          rows={2}
          placeholder="Shown to the athlete even before this lesson unlocks."
        />

        {!isFirst && (
          <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Unlocks when previous lesson's...</Label>
              <Select
                value={lesson.unlockRule}
                onValueChange={(v) => onChange((l) => ({ ...l, unlockRule: v as UnlockRule }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNLOCK_RULE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ruleMeta?.unit && (
              <div className="space-y-1.5">
                <Label className="text-xs">Threshold ({ruleMeta.unit})</Label>
                <Input
                  type="number"
                  min={1}
                  value={lesson.unlockThreshold}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChange((l) => ({ ...l, unlockThreshold: val }));
                  }}
                  className="h-9"
                />
              </div>
            )}
          </div>
        )}

        {showPricing && (
          <div className="space-y-1.5">
            <Label className="text-xs">Price to unlock ($, blank = free)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={lesson.priceDollars}
              onChange={(e) => {
                const val = e.target.value;
                onChange((l) => ({ ...l, priceDollars: val }));
              }}
              className="h-9 max-w-[140px]"
              placeholder="0.00"
            />
          </div>
        )}

        <div className="space-y-1.5 pt-1">
          {lesson.exercises.map((ex) => (
            <div key={ex.key} className="rounded-md border border-teal-900/40 bg-teal-950/10 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex-1 truncate text-sm font-semibold">{ex.skillExerciseName}</span>
                <button
                  type="button"
                  aria-label={`Remove ${ex.skillExerciseName}`}
                  onClick={() =>
                    onChange((l) => ({
                      ...l,
                      exercises: l.exercises.filter((e) => e.key !== ex.key),
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
                    onChange((l) => ({
                      ...l,
                      exercises: l.exercises.map((e) =>
                        e.key === ex.key ? { ...e, sets: Number(v) || 0 } : e,
                      ),
                    }))
                  }
                />
                <FieldInput
                  label="Reps"
                  value={ex.reps}
                  onChange={(v) =>
                    onChange((l) => ({
                      ...l,
                      exercises: l.exercises.map((e) => (e.key === ex.key ? { ...e, reps: v } : e)),
                    }))
                  }
                />
                <FieldInput
                  label="Rest (sec)"
                  value={ex.restSeconds}
                  type="number"
                  onChange={(v) =>
                    onChange((l) => ({
                      ...l,
                      exercises: l.exercises.map((e) =>
                        e.key === ex.key ? { ...e, restSeconds: v } : e,
                      ),
                    }))
                  }
                />
              </div>
              <TrackingToggle
                trackingLevel={ex.trackingLevel}
                onChange={(trackingLevel) =>
                  onChange((l) => ({
                    ...l,
                    exercises: l.exercises.map((e) =>
                      e.key === ex.key ? { ...e, trackingLevel } : e,
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
        {lesson.exercises.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">No drills yet</p>
        )}
        <Button variant="secondary" size="sm" className="w-full" onClick={onAddDrill}>
          <Plus className="h-3.5 w-3.5" />
          Add Drill
        </Button>
      </CardContent>
    </Card>
  );
}

const TRACKING_OPTIONS: { value: SkillTrackingLevel; label: string }[] = [
  { value: "none", label: "No Tracking" },
  { value: "sprint", label: "Sprint Timing" },
  { value: "mechanics", label: "Mechanics" },
];

function TrackingToggle({
  trackingLevel,
  onChange,
}: {
  trackingLevel: SkillTrackingLevel;
  onChange: (trackingLevel: SkillTrackingLevel) => void;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <Timer className="h-3.5 w-3.5 text-muted-foreground" />
      {TRACKING_OPTIONS.map((opt) => {
        const isActive = trackingLevel === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              isActive
                ? opt.value === "none"
                  ? "bg-muted text-foreground"
                  : "bg-teal-900/60 text-teal-100"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
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
