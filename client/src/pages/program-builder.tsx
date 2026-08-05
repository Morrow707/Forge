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
import { ProgramAiChatPanel } from "@/components/program-ai-chat-panel";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { ProgressionButton } from "@/components/progression-button";
import { VideoTrackingToggle } from "@/components/video-tracking-toggle";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
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
  Save,
  ArrowLeft,
  MoonStar,
  Link2,
  Send,
  Lock,
} from "lucide-react";
import type { Exercise } from "@shared/schema";

type RosterEntry = { id: number; name: string; email: string };

type TrackingLevel = "none" | "bar_path" | "full" | "jump";

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
  // Drives which camera pipeline "Video" turns on for this exercise (see
  // VideoTrackingToggle) -- jump-style tracking for a plyometric exercise,
  // full bar tracking for everything else.
  category: string | null;
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
  return { key: uid(), title: "Training Day", isRestDay: false, exercises: [] };
}

// Weeks aren't something a coach manages directly anymore -- there's no
// "Add Week" action. A program is just a flat, growable list of days;
// every run of 7 is bucketed into a week purely so the storage shape (and
// the default every-7-days scheduling offset) still lines up, with a
// label the coach can still customize per group for readability.
function chunkIntoWeeks(days: LocalDay[]) {
  const chunks: LocalDay[][] = [];
  for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));
  return chunks;
}

// Shared by the initial load and by the AI chat panel's onApplied callback
// -- the latter needs to rebuild local state from the fresh program the AI
// just wrote, immediately and without waiting on a query refetch.
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
            category: pe.exercise.category ?? null,
          })),
        ) as LocalExercise[],
      });
    }
  }
  return { name: program.name as string, description: (program.description as string) ?? "", days, weekNames };
}

export function ProgramBuilderPage({
  apiBase,
  routeBase,
  showAssign = true,
  showAiChat = false,
}: {
  apiBase: string;
  routeBase: string;
  showAssign?: boolean;
  showAiChat?: boolean;
}) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const programId = Number(id);

  const { data: program, isLoading } = useQuery<any>({
    queryKey: [`${apiBase}/programs`, programId],
    queryFn: () => getJson(`${apiBase}/programs/${programId}`),
  });
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
    enabled: showAssign,
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

  // Called by the AI chat panel after each turn with the fresh program it
  // just wrote -- updates the builder's fields immediately, no refetch
  // round-trip needed since the chat response already contains the result.
  function handleChatApplied(updatedProgram: any) {
    const state = stateFromProgram(updatedProgram);
    setName(state.name);
    setDescription(state.description);
    setDays(state.days);
    setWeekNames(state.weekNames);
  }

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

  if (isLoading || !hydrated) {
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

      <div className={cn(showAiChat && "grid items-start gap-6 lg:grid-cols-[1fr_380px]")}>
        <fieldset disabled={!editable} className="contents">
          <div className="min-w-0">
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

            {days.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
                <p>No days yet. Add training days one at a time -- no need to plan whole weeks.</p>
                <Button onClick={addDay}>
                  <Plus className="h-4 w-4" />
                  Add Day
                </Button>
              </div>
            ) : (
              <div className="space-y-8">
                {weekChunks.map((chunk, wi) => (
                  <div key={wi}>
                    <Input
                      value={weekNames[wi] || `Week ${wi + 1}`}
                      onChange={(e) => renameWeek(wi, e.target.value)}
                      className="mb-3 h-8 max-w-xs border-none bg-transparent px-0 text-xs font-bold uppercase tracking-wide text-muted-foreground focus-visible:ring-0"
                    />
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

        {showAiChat && (
          // flex/flex-col/overflow-hidden here (not just a fixed height) is
          // load-bearing: ProgramAiChatPanel's Card sizes itself with
          // flex-1/min-h-0 expecting a flex parent to stretch into -- without
          // that, the card just grows to fit every message instead of
          // scrolling internally, and the whole page has to scroll to read
          // the conversation instead of this box scrolling on its own.
          <div className="flex h-[75vh] max-h-[720px] flex-col overflow-hidden lg:sticky lg:top-24">
            <ProgramAiChatPanel apiBase={apiBase} programId={programId} onApplied={handleChatApplied} />
          </div>
        )}
      </div>

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
                category: exercise.category ?? null,
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
        <div>
          <label className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Weight
          </label>
          <div className="flex items-center gap-1">
            <Input
              value={exercise.weight}
              onChange={(e) => onUpdate({ weight: e.target.value })}
              className="h-8 px-2 text-xs"
            />
            <ProgressionButton
              value={exercise.weight}
              onChange={(next) => onUpdate({ weight: next })}
            />
          </div>
        </div>
      </div>
      <div className="mt-1.5">
        <VideoTrackingToggle
          trackingLevel={exercise.trackingLevel}
          category={exercise.category}
          onChange={(patch) => onUpdate(patch)}
        />
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
