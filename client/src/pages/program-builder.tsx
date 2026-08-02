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
import { ExercisePickerDialog } from "@/components/exercise-picker-dialog";
import { AssignProgramDialog } from "@/components/assign-program-dialog";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  computeExerciseLabels,
  assignSupersetGroups,
  deriveLinkedToNext,
  colorForLabel,
} from "@/lib/supersets";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  GripVertical,
  Trash2,
  Copy,
  Save,
  ArrowLeft,
  MoonStar,
  Link2,
  Send,
  Lock,
} from "lucide-react";
import type { Exercise } from "@shared/schema";

type RosterEntry = { id: number; name: string; email: string };

type TrackingLevel = "none" | "bar_path" | "full";

type LocalExercise = {
  key: string;
  exerciseId: number;
  exerciseName: string;
  sets: number;
  reps: string;
  weight: string;
  restSeconds: string;
  notes: string;
  // Locally we track "is this linked to the exercise right after it" rather
  // than a shared group id -- much simpler to toggle and to keep correct
  // when exercises are added/removed/reordered. Converted to/from the
  // persisted `supersetGroup` token only at load/save time.
  linkedToNext: boolean;
  trackingLevel: TrackingLevel;
  videoCheckEnabled: boolean;
};

type LocalDay = {
  key: string;
  dayNumber: number;
  title: string;
  isRestDay: boolean;
  exercises: LocalExercise[];
};

type LocalWeek = {
  key: string;
  weekNumber: number;
  name: string;
  days: LocalDay[];
};

function uid() {
  return crypto.randomUUID();
}

function makeWeek(weekNumber: number, template?: LocalDay[]): LocalWeek {
  return {
    key: uid(),
    weekNumber,
    name: `Week ${weekNumber}`,
    days:
      template?.map((d) => ({
        ...d,
        key: uid(),
        exercises: d.exercises.map((ex) => ({ ...ex, key: uid() })),
      })) ??
      Array.from({ length: 7 }, (_, i) => ({
        key: uid(),
        dayNumber: i + 1,
        title: i === 0 ? "Training Day" : "Rest Day",
        isRestDay: i !== 0,
        exercises: [],
      })),
  };
}

export function ProgramBuilderPage({
  apiBase,
  routeBase,
  showAssign = true,
}: {
  apiBase: string;
  routeBase: string;
  showAssign?: boolean;
}) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const programId = Number(id);

  const { data: program, isLoading } = useQuery<any>({
    queryKey: [`${apiBase}/programs`, programId],
    queryFn: async () => {
      const res = await apiRequest("GET", `${apiBase}/programs/${programId}`);
      return res.json();
    },
  });
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
    enabled: showAssign,
  });
  const editable = program?.editable !== false;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [weeks, setWeeks] = useState<LocalWeek[]>([]);
  const [activeWeekKey, setActiveWeekKey] = useState<string | null>(null);
  const [pickerForDay, setPickerForDay] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  useEffect(() => {
    if (program && !hydrated) {
      setName(program.name);
      setDescription(program.description ?? "");
      const loadedWeeks: LocalWeek[] = program.weeks.map((w: any) => ({
        key: uid(),
        weekNumber: w.weekNumber,
        name: w.name ?? `Week ${w.weekNumber}`,
        days: w.days.map((d: any) => ({
          key: uid(),
          dayNumber: d.dayNumber,
          title: d.title,
          isRestDay: d.isRestDay,
          exercises: deriveLinkedToNext(
            d.exercises.map((pe: any) => ({
              key: uid(),
              exerciseId: pe.exercise.id,
              exerciseName: pe.exercise.name,
              sets: pe.sets,
              reps: pe.reps,
              weight: pe.weight ?? "",
              restSeconds: pe.restSeconds != null ? String(pe.restSeconds) : "",
              notes: pe.notes ?? "",
              supersetGroup: pe.supersetGroup ?? null,
              trackingLevel: pe.trackingLevel ?? "none",
              videoCheckEnabled: pe.videoCheckEnabled ?? false,
            })),
          ),
        })),
      }));
      setWeeks(loadedWeeks);
      setActiveWeekKey(loadedWeeks[0]?.key ?? null);
      setHydrated(true);
    }
  }, [program, hydrated]);

  const activeWeek = weeks.find((w) => w.key === activeWeekKey) ?? weeks[0];

  function updateDay(dayKey: string, updater: (day: LocalDay) => LocalDay) {
    setWeeks((prev) =>
      prev.map((w) => ({
        ...w,
        days: w.days.map((d) => (d.key === dayKey ? updater(d) : d)),
      })),
    );
  }

  function addWeek() {
    const nextNumber = weeks.length + 1;
    const w = makeWeek(nextNumber);
    setWeeks((prev) => [...prev, w]);
    setActiveWeekKey(w.key);
  }

  function duplicateWeek(weekKey: string) {
    const source = weeks.find((w) => w.key === weekKey);
    if (!source) return;
    const nextNumber = weeks.length + 1;
    const w = makeWeek(nextNumber, source.days);
    w.name = `${source.name} (copy)`;
    setWeeks((prev) => [...prev, w]);
    setActiveWeekKey(w.key);
  }

  function removeWeek(weekKey: string) {
    if (weeks.length <= 1) {
      toast.error("A program needs at least one week");
      return;
    }
    setWeeks((prev) => {
      const next = prev
        .filter((w) => w.key !== weekKey)
        .map((w, i) => ({ ...w, weekNumber: i + 1 }));
      if (activeWeekKey === weekKey) setActiveWeekKey(next[0]?.key ?? null);
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description,
        weeks: weeks.map((w) => ({
          weekNumber: w.weekNumber,
          name: w.name,
          days: w.days.map((d) => ({
            dayNumber: d.dayNumber,
            title: d.title,
            isRestDay: d.isRestDay,
            exercises: assignSupersetGroups(d.exercises).map((ex, i) => ({
              exerciseId: ex.exerciseId,
              orderIndex: i,
              sets: Number(ex.sets) || 1,
              reps: ex.reps || "10",
              weight: ex.weight || null,
              restSeconds: ex.restSeconds ? Number(ex.restSeconds) : null,
              notes: ex.notes || null,
              supersetGroup: ex.supersetGroup,
              trackingLevel: ex.trackingLevel,
              videoCheckEnabled: ex.videoCheckEnabled,
            })),
          })),
        })),
      };
      const res = await apiRequest("PUT", `${apiBase}/programs/${programId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/programs`] });
      toast.success("Program saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save program"),
  });

  if (isLoading || !hydrated || !activeWeek) {
    return (
      <AppShell title="Loading Program…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Program Builder"
      actions={
        <>
          <Button variant="outline" onClick={() => navigate(routeBase)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          {showAssign && (
            <Button variant="secondary" onClick={() => setAssignOpen(true)}>
              <Send className="h-4 w-4" />
              Assign Program
            </Button>
          )}
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
        <Card className="mb-6">
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Program name</Label>
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

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {weeks.map((w) => (
            <button
              key={w.key}
              onClick={() => setActiveWeekKey(w.key)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                w.key === activeWeek.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-surface-elevated"
              }`}
            >
              {w.name}
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={addWeek}>
            <Plus className="h-4 w-4" />
            Add Week
          </Button>
          <Button size="sm" variant="ghost" onClick={() => duplicateWeek(activeWeek.key)}>
            <Copy className="h-4 w-4" />
            Duplicate Week
          </Button>
          {weeks.length > 1 && (
            <Button size="sm" variant="ghost" onClick={() => removeWeek(activeWeek.key)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>

        <div className="mb-3 space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Week label</Label>
          <Input
            value={activeWeek.name}
            onChange={(e) => {
              const val = e.target.value;
              setWeeks((prev) =>
                prev.map((w) => (w.key === activeWeek.key ? { ...w, name: val } : w)),
              );
            }}
            className="max-w-xs"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {activeWeek.days.map((day) => (
            <DayCard
              key={day.key}
              day={day}
              onChange={(updater) => updateDay(day.key, updater)}
              onAddExercise={() => setPickerForDay(day.key)}
            />
          ))}
        </div>
      </fieldset>

      <ExercisePickerDialog
        apiBase={apiBase}
        open={pickerForDay !== null}
        onOpenChange={(open) => !open && setPickerForDay(null)}
        onSelect={(exercise: Exercise) => {
          if (!pickerForDay) return;
          updateDay(pickerForDay, (d) => ({
            ...d,
            exercises: [
              ...d.exercises,
              {
                key: uid(),
                exerciseId: exercise.id,
                exerciseName: exercise.name,
                sets: 3,
                reps: "10",
                weight: "",
                restSeconds: "",
                notes: "",
                linkedToNext: false,
                trackingLevel: "none",
                videoCheckEnabled: false,
              },
            ],
          }));
        }}
      />

      {showAssign && (
        <AssignProgramDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          roster={roster}
          programs={[{ id: programId, name }]}
          programId={programId}
        />
      )}
    </AppShell>
  );
}

function DayCard({
  day,
  onChange,
  onAddExercise,
}: {
  day: LocalDay;
  onChange: (updater: (day: LocalDay) => LocalDay) => void;
  onAddExercise: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const exerciseLabels = computeExerciseLabels(day.exercises);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onChange((d) => {
      const oldIndex = d.exercises.findIndex((e) => e.key === active.id);
      const newIndex = d.exercises.findIndex((e) => e.key === over.id);
      return { ...d, exercises: arrayMove(d.exercises, oldIndex, newIndex) };
    });
  }

  return (
    <Card className={day.isRestDay ? "opacity-70" : ""}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline">Day {day.dayNumber}</Badge>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={day.isRestDay}
              onCheckedChange={(checked) =>
                onChange((d) => ({ ...d, isRestDay: checked === true }))
              }
            />
            Rest day
          </label>
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={day.exercises.map((e) => e.key)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {day.exercises.map((ex, i) => (
                    <div key={ex.key}>
                      <SortableExerciseRow
                        exercise={ex}
                        label={exerciseLabels[ex.key]}
                        onUpdate={(patch) =>
                          onChange((d) => ({
                            ...d,
                            exercises: d.exercises.map((e) =>
                              e.key === ex.key ? { ...e, ...patch } : e,
                            ),
                          }))
                        }
                        onRemove={() =>
                          onChange((d) => ({
                            ...d,
                            exercises: d.exercises.filter((e) => e.key !== ex.key),
                          }))
                        }
                      />
                      {i < day.exercises.length - 1 && (
                        <SupersetConnector
                          linked={ex.linkedToNext}
                          onToggle={() =>
                            onChange((d) => ({
                              ...d,
                              exercises: d.exercises.map((e) =>
                                e.key === ex.key
                                  ? { ...e, linkedToNext: !e.linkedToNext }
                                  : e,
                              ),
                            }))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {day.exercises.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No exercises yet
              </p>
            )}
            <Button variant="secondary" size="sm" className="w-full" onClick={onAddExercise}>
              <Plus className="h-3.5 w-3.5" />
              Add Exercise
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SupersetConnector({
  linked,
  onToggle,
}: {
  linked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5 pl-3">
      <div className={cn("h-3 w-px", linked ? "bg-blue-500" : "bg-transparent")} />
      <button
        type="button"
        onClick={onToggle}
        title={linked ? "Unlink superset" : "Link into a superset"}
        className={cn(
          "flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[11px] font-bold transition-colors",
          linked
            ? "border-blue-500 bg-blue-500 text-white"
            : "border-blue-500 text-blue-500 hover:bg-blue-500/10",
        )}
      >
        <Link2 className="h-3 w-3" />
        {linked ? "Linked" : "Link"}
      </button>
    </div>
  );
}

function SortableExerciseRow({
  exercise,
  label,
  onUpdate,
  onRemove,
}: {
  exercise: LocalExercise;
  label: string;
  onUpdate: (patch: Partial<LocalExercise>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: exercise.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-border bg-surface-elevated p-2.5"
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Reorder ${exercise.exerciseName}`}
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
            colorForLabel(label),
          )}
        >
          {label}
        </span>
        <span className="flex-1 truncate text-sm font-semibold">
          {exercise.exerciseName}
        </span>
        <button
          type="button"
          aria-label={`Remove ${exercise.exerciseName}`}
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <FieldInput
          label="Sets"
          value={String(exercise.sets)}
          onChange={(v) => onUpdate({ sets: Number(v) || 0 })}
          type="number"
        />
        <FieldInput label="Reps" value={exercise.reps} onChange={(v) => onUpdate({ reps: v })} />
        <FieldInput
          label="Weight"
          value={exercise.weight}
          onChange={(v) => onUpdate({ weight: v })}
        />
      </div>
      <div className="mt-1.5 flex items-end gap-3">
        <TrackingLevelControl
          value={exercise.trackingLevel}
          onChange={(trackingLevel) => onUpdate({ trackingLevel })}
        />
        <label className="mb-[3px] flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox
            checked={exercise.videoCheckEnabled}
            onCheckedChange={(checked) => onUpdate({ videoCheckEnabled: checked === true })}
          />
          Require form-check video
        </label>
      </div>
    </div>
  );
}

function TrackingLevelControl({
  value,
  onChange,
}: {
  value: TrackingLevel;
  onChange: (v: TrackingLevel) => void;
}) {
  const options: { value: TrackingLevel; label: string; title: string }[] = [
    { value: "none", label: "Off", title: "No camera tracking for this exercise" },
    { value: "bar_path", label: "Path", title: "Track bar path only (no speed emphasis)" },
    { value: "full", label: "Full", title: "Track bar speed, tempo, and bar path" },
  ];
  return (
    <div>
      <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Tracking</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded border px-2 py-1 text-[10px] font-semibold transition-colors",
              value === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
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
      <label className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
        {label}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 text-xs"
      />
    </div>
  );
}
