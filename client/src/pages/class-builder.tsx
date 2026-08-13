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
  BookOpen,
  HelpCircle,
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

type LocalContentPage = { key: string; title: string; body: string };
type LocalQuizAnswer = {
  key: string;
  id?: number;
  answerText: string;
  isCorrect: boolean;
  explanation: string;
};
type LocalQuizQuestion = { key: string; id?: number; questionText: string; answers: LocalQuizAnswer[] };

type LocalLesson = {
  key: string;
  id?: number;
  title: string;
  description: string;
  unlockRule: UnlockRule;
  unlockThreshold: string;
  priceDollars: string;
  exercises: LocalExercise[];
  content: LocalContentPage[];
  quizQuestions: LocalQuizQuestion[];
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
    content: [],
    quizQuestions: [],
  };
}

function makeQuizQuestion(): LocalQuizQuestion {
  return {
    key: uid(),
    questionText: "",
    answers: [0, 1, 2, 3].map((i) => ({ key: uid(), answerText: "", isCorrect: i === 0, explanation: "" })),
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
      content: ((l.content ?? []) as { title?: string; body: string }[]).map((p) => ({
        key: uid(),
        title: p.title ?? "",
        body: p.body,
      })),
      quizQuestions: ((l.quizQuestions ?? []) as any[]).map((q) => ({
        key: uid(),
        id: q.id,
        questionText: q.questionText,
        answers: q.answers.map((a: any) => ({
          key: uid(),
          id: a.id,
          answerText: a.answerText,
          isCorrect: a.isCorrect,
          explanation: a.explanation,
        })),
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

  // Every quiz question submitted needs a real, unambiguous answer key --
  // caught here before the round trip rather than surfaced as a 400 from
  // the server's own zod validation.
  function findQuizValidationError(): string | null {
    for (const l of lessons) {
      for (const q of l.quizQuestions) {
        if (!q.questionText.trim()) continue;
        const answers = q.answers.filter((a) => a.answerText.trim());
        if (answers.length < 2) return `"${l.title}": every quiz question needs at least 2 answers.`;
        if (answers.filter((a) => a.isCorrect).length !== 1) {
          return `"${l.title}": every quiz question needs exactly one correct answer marked.`;
        }
        if (answers.some((a) => !a.explanation.trim())) {
          return `"${l.title}": every answer needs an explanation.`;
        }
      }
    }
    return null;
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
          content: l.content
            .filter((p) => p.body.trim())
            .map((p) => ({ title: p.title.trim() || undefined, body: p.body })),
          quizQuestions: l.quizQuestions
            .filter((q) => q.questionText.trim())
            .map((q, qi) => ({
              id: q.id,
              orderIndex: qi,
              questionText: q.questionText,
              answers: q.answers
                .filter((a) => a.answerText.trim())
                .map((a, ai) => ({
                  id: a.id,
                  orderIndex: ai,
                  answerText: a.answerText,
                  isCorrect: a.isCorrect,
                  explanation: a.explanation,
                })),
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
              onClick={() => {
                const error = findQuizValidationError();
                if (error) {
                  toast.error(error);
                  return;
                }
                saveMutation.mutate();
              }}
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

      {/* Pacing is a coach-owned setting, never content -- available even on
          a Forge-official class the coach can't otherwise edit (see
          getClassIfUsableByCoach vs. assertCoachOwnsClass in routes.ts), so
          it lives outside the `editable`-gated fieldset below. */}
      {showEnroll && <CoachPacingSettings apiBase={apiBase} classId={classId} />}

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

// A coach's own drip-pacing override for a class -- "effort drip" (real
// logged reps) and/or "time drip" (minimum wait), replacing whatever
// default the class's author set for every lesson-to-lesson transition on
// this coach's roster. See classCoachSettings in shared/schema.ts.
function CoachPacingSettings({ apiBase, classId }: { apiBase: string; classId: number }) {
  const qc = useQueryClient();
  const settingsKey = [`${apiBase}/classes`, classId, "coach-settings"];
  const { data } = useQuery<{ minSessionsRequired: number | null; minDaysElapsed: number | null }>({
    queryKey: settingsKey,
    queryFn: () => getJson(`${apiBase}/classes/${classId}/coach-settings`),
  });

  const [sessionsEnabled, setSessionsEnabled] = useState(false);
  const [sessions, setSessions] = useState("3");
  const [daysEnabled, setDaysEnabled] = useState(false);
  const [days, setDays] = useState("7");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (data && !hydrated) {
      setSessionsEnabled(data.minSessionsRequired != null);
      setSessions(data.minSessionsRequired != null ? String(data.minSessionsRequired) : "3");
      setDaysEnabled(data.minDaysElapsed != null);
      setDays(data.minDaysElapsed != null ? String(data.minDaysElapsed) : "7");
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        minSessionsRequired: sessionsEnabled ? Number(sessions) || 1 : null,
        minDaysElapsed: daysEnabled ? Number(days) || 1 : null,
      };
      const res = await apiRequest("PUT", `${apiBase}/classes/${classId}/coach-settings`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKey });
      toast.success("Pacing saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save pacing"),
  });

  if (!hydrated) {
    return <Card className="mb-6"><CardContent className="h-16 animate-pulse p-5" /></Card>;
  }

  return (
    <Card className="mb-6">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-1.5">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Your pacing for this class</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Overrides the class's own default unlock rule for your roster only -- combine a real
          "effort drip" (logged reps) with a "time drip" (minimum wait), or leave both off to use
          the class's own defaults.
        </p>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sessionsEnabled}
            onChange={(e) => setSessionsEnabled(e.target.checked)}
          />
          Require at least
          <Input
            type="number"
            min={1}
            value={sessions}
            onChange={(e) => setSessions(e.target.value)}
            disabled={!sessionsEnabled}
            className="h-8 w-20"
          />
          logged sessions of a lesson's drills before the next lesson unlocks
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={daysEnabled}
            onChange={(e) => setDaysEnabled(e.target.checked)}
          />
          Require at least
          <Input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={!daysEnabled}
            className="h-8 w-20"
          />
          days between lessons
        </label>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="h-3.5 w-3.5" />
          {saveMutation.isPending ? "Saving…" : "Save Pacing"}
        </Button>
      </CardContent>
    </Card>
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

        <LessonContentAndQuiz lesson={lesson} onChange={onChange} />
      </CardContent>
    </Card>
  );
}

// The click/tap-through reading pages an athlete works through before this
// lesson's end-of-chapter quiz -- collapsed by default since most lessons
// (any that aren't a Forge-authored curriculum chapter) never use this.
function LessonContentAndQuiz({
  lesson,
  onChange,
}: {
  lesson: LocalLesson;
  onChange: (updater: (lesson: LocalLesson) => LocalLesson) => void;
}) {
  const [open, setOpen] = useState(
    () => lesson.content.length > 0 || lesson.quizQuestions.length > 0,
  );

  return (
    <div className="rounded-md border border-border pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Lesson Content & Quiz
          {(lesson.content.length > 0 || lesson.quizQuestions.length > 0) && (
            <Badge variant="outline" className="ml-1 text-[10px]">
              {lesson.content.length} page{lesson.content.length === 1 ? "" : "s"} ·{" "}
              {lesson.quizQuestions.length} question{lesson.quizQuestions.length === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-3">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Reading pages (click/tap through, in order)
            </Label>
            <ContentPagesEditor
              pages={lesson.content}
              onChange={(updater) => onChange((l) => ({ ...l, content: updater(l.content) }))}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <HelpCircle className="h-3.5 w-3.5" />
              End-of-chapter quiz
            </Label>
            <QuizEditor
              questions={lesson.quizQuestions}
              onChange={(updater) => onChange((l) => ({ ...l, quizQuestions: updater(l.quizQuestions) }))}
            />
          </div>
          {lesson.quizQuestions.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              A lesson with a quiz doesn't auto-activate -- the athlete must read every page, pass the
              quiz, then tap "Add to Calendar" themselves.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ContentPagesEditor({
  pages,
  onChange,
}: {
  pages: LocalContentPage[];
  onChange: (updater: (pages: LocalContentPage[]) => LocalContentPage[]) => void;
}) {
  return (
    <div className="space-y-2">
      {pages.map((page, i) => (
        <div key={page.key} className="space-y-1.5 rounded-md border border-border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Page {i + 1}
            </span>
            <button
              type="button"
              aria-label={`Remove page ${i + 1}`}
              onClick={() => onChange((prev) => prev.filter((p) => p.key !== page.key))}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Input
            value={page.title}
            onChange={(e) => {
              const val = e.target.value;
              onChange((prev) => prev.map((p) => (p.key === page.key ? { ...p, title: val } : p)));
            }}
            placeholder="Page title (optional)"
            className="h-8 text-sm"
          />
          <Textarea
            value={page.body}
            onChange={(e) => {
              const val = e.target.value;
              onChange((prev) => prev.map((p) => (p.key === page.key ? { ...p, body: val } : p)));
            }}
            rows={4}
            placeholder="What the athlete reads on this page…"
            className="text-sm"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={() => onChange((prev) => [...prev, { key: uid(), title: "", body: "" }])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Page
      </Button>
    </div>
  );
}

function QuizEditor({
  questions,
  onChange,
}: {
  questions: LocalQuizQuestion[];
  onChange: (updater: (questions: LocalQuizQuestion[]) => LocalQuizQuestion[]) => void;
}) {
  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={q.key} className="space-y-2 rounded-md border border-border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Question {qi + 1}
            </span>
            <button
              type="button"
              aria-label={`Remove question ${qi + 1}`}
              onClick={() => onChange((prev) => prev.filter((x) => x.key !== q.key))}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Textarea
            value={q.questionText}
            onChange={(e) => {
              const val = e.target.value;
              onChange((prev) => prev.map((x) => (x.key === q.key ? { ...x, questionText: val } : x)));
            }}
            rows={2}
            placeholder="Question text"
            className="text-sm"
          />
          <div className="space-y-1.5">
            {q.answers.map((a) => (
              <div key={a.key} className="flex items-start gap-2 rounded border border-border/60 p-1.5">
                <button
                  type="button"
                  aria-label="Mark this the correct answer"
                  aria-pressed={a.isCorrect}
                  onClick={() =>
                    onChange((prev) =>
                      prev.map((x) =>
                        x.key === q.key
                          ? { ...x, answers: x.answers.map((y) => ({ ...y, isCorrect: y.key === a.key })) }
                          : x,
                      ),
                    )
                  }
                  className={cn(
                    "mt-2 h-3.5 w-3.5 shrink-0 rounded-full border-2",
                    a.isCorrect ? "border-teal-500 bg-teal-500" : "border-muted-foreground",
                  )}
                />
                <div className="flex-1 space-y-1">
                  <Input
                    value={a.answerText}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange((prev) =>
                        prev.map((x) =>
                          x.key === q.key
                            ? {
                                ...x,
                                answers: x.answers.map((y) =>
                                  y.key === a.key ? { ...y, answerText: val } : y,
                                ),
                              }
                            : x,
                        ),
                      );
                    }}
                    placeholder="Answer choice"
                    className="h-8 text-sm"
                  />
                  <Input
                    value={a.explanation}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange((prev) =>
                        prev.map((x) =>
                          x.key === q.key
                            ? {
                                ...x,
                                answers: x.answers.map((y) =>
                                  y.key === a.key ? { ...y, explanation: val } : y,
                                ),
                              }
                            : x,
                        ),
                      );
                    }}
                    placeholder="Explanation shown after the athlete answers"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={() => onChange((prev) => [...prev, makeQuizQuestion()])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Question
      </Button>
    </div>
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
