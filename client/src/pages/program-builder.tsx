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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExercisePickerDialog } from "@/components/exercise-picker-dialog";
import { AssignProgramDialog } from "@/components/assign-program-dialog";
import { RadioChipGroup } from "@/components/filter-chip-group";
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
  Layers,
} from "lucide-react";
import type { Exercise } from "@shared/schema";
import {
  PERIODIZATION_PHASES,
  PERIODIZATION_PHASE_LABEL,
  type PeriodizationPhase,
} from "@shared/schema";

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
  // Only meaningful for 2+ exercises chained via linkedToNext -- false
  // (default) rests after every exercise's set same as a solo exercise,
  // true rests only after the last exercise in the chain's set. Kept in
  // sync across every exercise in a chain (see the group-rest control in
  // DayCard), even though only the chain's last exercise's value is
  // actually read at runtime -- so a value doesn't go stale if the coach
  // later removes what's currently the last exercise.
  restAfterGroupOnly: boolean;
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

type LocalBlock = {
  key: string;
  name: string;
  phase: PeriodizationPhase | null;
  notes: string;
};

const PHASE_CLASSNAME: Record<PeriodizationPhase, string> = {
  accumulation: "bg-emerald-400/15 text-emerald-400",
  intensification: "bg-amber-400/15 text-amber-400",
  realization: "bg-primary/15 text-primary",
  deload: "bg-sky-400/15 text-sky-400",
  taper: "bg-violet-400/15 text-violet-400",
};

function uid() {
  return crypto.randomUUID();
}

// This builder only ever writes to the server on an explicit "Save
// Program" tap -- unlike the workout logger, there's no autosave POST on
// every edit, since a full PUT here replaces the whole program and firing
// that on every keystroke would be both wasteful and risky against a
// concurrent AI-chat edit. That leaves a real gap: any interruption before
// that tap -- a forced logout, a crashed tab, just navigating away mid-edit
// -- loses everything typed since the last save, with no way back. This is
// a local-only safety net for exactly that: every edit gets mirrored to
// localStorage (not the server), and the builder offers to restore it the
// next time this same program is opened, so a lost session costs a click
// to recover from instead of the whole draft.
type ProgramDraft = {
  name: string;
  description: string;
  days: LocalDay[];
  weekNames: string[];
  blocks: LocalBlock[];
  weekBlockKeys: (string | null)[];
  savedAt: number;
};

function draftStorageKey(apiBase: string, programId: number) {
  return `forge:program-draft:${apiBase}:${programId}`;
}

function loadProgramDraft(apiBase: string, programId: number): ProgramDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(apiBase, programId));
    return raw ? (JSON.parse(raw) as ProgramDraft) : null;
  } catch {
    return null;
  }
}

function saveProgramDraft(apiBase: string, programId: number, draft: Omit<ProgramDraft, "savedAt">) {
  try {
    localStorage.setItem(
      draftStorageKey(apiBase, programId),
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // Storage full/unavailable (private browsing, etc) -- the draft is a
    // nice-to-have safety net, not something worth surfacing an error for.
  }
}

function clearProgramDraft(apiBase: string, programId: number) {
  try {
    localStorage.removeItem(draftStorageKey(apiBase, programId));
  } catch {
    // best-effort
  }
}

function makeBlock(): LocalBlock {
  return { key: uid(), name: "New Block", phase: null, notes: "" };
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
  const blocks: LocalBlock[] = (program.blocks ?? []).map((b: any) => ({
    key: uid(),
    name: b.name,
    phase: b.phase ?? null,
    notes: b.notes ?? "",
  }));
  const blockKeyByServerId = new Map<number, string>(
    (program.blocks ?? []).map((b: any, i: number) => [b.id, blocks[i].key]),
  );

  const days: LocalDay[] = [];
  const weekNames: string[] = [];
  const weekBlockKeys: (string | null)[] = [];
  for (const w of program.weeks) {
    weekNames.push(w.name ?? `Week ${w.weekNumber}`);
    weekBlockKeys.push(w.blockId != null ? (blockKeyByServerId.get(w.blockId) ?? null) : null);
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
            restAfterGroupOnly: pe.restAfterGroupOnly ?? false,
            trackingLevel: pe.trackingLevel ?? "none",
            videoCheckEnabled: pe.videoCheckEnabled ?? false,
            category: pe.exercise.category ?? null,
          })),
        ) as LocalExercise[],
      });
    }
  }
  return {
    name: program.name as string,
    description: (program.description as string) ?? "",
    days,
    weekNames,
    blocks,
    weekBlockKeys,
  };
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

  // Handed off by the "New Program" questionnaire (see program-list.tsx) --
  // read once and cleared immediately so a page refresh never re-sends it.
  const [initialAiPrompt] = useState(() => {
    const key = `forge:pendingAiPrompt:${programId}`;
    const stored = sessionStorage.getItem(key);
    if (stored) sessionStorage.removeItem(key);
    return stored ?? undefined;
  });

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
  const [blocks, setBlocks] = useState<LocalBlock[]>([]);
  const [weekBlockKeys, setWeekBlockKeys] = useState<(string | null)[]>([]);
  const [pickerForDay, setPickerForDay] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  useEffect(() => {
    if (program && !hydrated) {
      const draft = loadProgramDraft(apiBase, programId);
      const state = draft ?? stateFromProgram(program);
      setName(state.name);
      setDescription(state.description);
      setDays(state.days);
      setWeekNames(state.weekNames);
      setBlocks(state.blocks);
      setWeekBlockKeys(state.weekBlockKeys);
      setHydrated(true);
      if (draft) {
        toast.info("Restored unsaved changes from your last session here", {
          description: "Save Program to keep them, or Discard to go back to the last saved version.",
          duration: 10000,
          action: {
            label: "Discard",
            onClick: () => {
              clearProgramDraft(apiBase, programId);
              const fresh = stateFromProgram(program);
              setName(fresh.name);
              setDescription(fresh.description);
              setDays(fresh.days);
              setWeekNames(fresh.weekNames);
              setBlocks(fresh.blocks);
              setWeekBlockKeys(fresh.weekBlockKeys);
            },
          },
        });
      }
    }
  }, [program, hydrated, apiBase, programId]);

  // Mirrors every edit to localStorage so an interruption before the next
  // explicit save -- see the ProgramDraft comment up top -- costs at most a
  // restore prompt, not the whole draft. Skipped until hydrated so the
  // initial, empty pre-load state can never overwrite a real draft.
  // Deliberately keyed only to the actual content fields, not to
  // saveMutation's state -- a successful save clears the draft directly
  // (see onSuccess below) rather than being gated here, since gating on
  // e.g. isSuccess would leave every edit made *after* a save permanently
  // unprotected until the next save (mutation state doesn't reset itself
  // back on its own between saves).
  useEffect(() => {
    if (!hydrated) return;
    saveProgramDraft(apiBase, programId, { name, description, days, weekNames, blocks, weekBlockKeys });
  }, [hydrated, apiBase, programId, name, description, days, weekNames, blocks, weekBlockKeys]);

  // Called by the AI chat panel after each turn with the fresh program it
  // just wrote -- updates the builder's fields immediately, no refetch
  // round-trip needed since the chat response already contains the result.
  function handleChatApplied(updatedProgram: any) {
    const state = stateFromProgram(updatedProgram);
    setName(state.name);
    setDescription(state.description);
    setDays(state.days);
    setWeekNames(state.weekNames);
    setBlocks(state.blocks);
    setWeekBlockKeys(state.weekBlockKeys);
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

  function addBlock() {
    setBlocks((prev) => [...prev, makeBlock()]);
  }

  function updateBlock(blockKey: string, updater: (block: LocalBlock) => LocalBlock) {
    setBlocks((prev) => prev.map((b) => (b.key === blockKey ? updater(b) : b)));
  }

  function removeBlock(blockKey: string) {
    setBlocks((prev) => prev.filter((b) => b.key !== blockKey));
    setWeekBlockKeys((prev) => prev.map((k) => (k === blockKey ? null : k)));
  }

  function setWeekBlock(weekIndex: number, blockKey: string | null) {
    setWeekBlockKeys((prev) => {
      const next = [...prev];
      next[weekIndex] = blockKey;
      return next;
    });
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
        blocks: blocks.map((b) => ({
          name: b.name,
          phase: b.phase,
          notes: b.notes || null,
        })),
        weeks: weekChunks.map((chunk, wi) => ({
          weekNumber: wi + 1,
          name: weekNames[wi] || `Week ${wi + 1}`,
          blockIndex:
            weekBlockKeys[wi] != null
              ? blocks.findIndex((b) => b.key === weekBlockKeys[wi])
              : null,
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
              restAfterGroupOnly: ex.restAfterGroupOnly,
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
      clearProgramDraft(apiBase, programId);
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
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(routeBase)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {showAssign && (
              <Button
                variant="secondary"
                disabled={saveMutation.isPending}
                onClick={async () => {
                  // AssignProgramDialog's submit only sends programId to the
                  // server, which assigns whatever the program currently
                  // looks like IN THE DATABASE -- not whatever's on screen.
                  // Without saving first, assigning right after editing
                  // (a totally natural order, since the two buttons sit side
                  // by side) would silently hand the athlete a stale or even
                  // empty program while the coach's screen shows the days
                  // they just built.
                  if (editable) {
                    try {
                      await saveMutation.mutateAsync();
                    } catch {
                      return;
                    }
                  }
                  setAssignOpen(true);
                }}
              >
                <Send className="h-4 w-4" />
                Assign Program
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
              {saveMutation.isPending ? "Saving…" : "Save Program"}
            </Button>
          )}
        </div>
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

            <Card className="mb-6">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    Training Blocks
                  </Label>
                  <Button size="sm" variant="outline" onClick={addBlock}>
                    <Plus className="h-4 w-4" />
                    Add Block
                  </Button>
                </div>
                {blocks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Optional -- group weeks into named phases (Hypertrophy, Peaking, Deload...) to
                    plan periodization. Assign a block to each week below once you've added one.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {blocks.map((block) => (
                      <div
                        key={block.key}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
                      >
                        <Input
                          value={block.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateBlock(block.key, (b) => ({ ...b, name: val }));
                          }}
                          className="h-8 max-w-[220px]"
                        />
                        <Select
                          value={block.phase ?? "none"}
                          onValueChange={(val) =>
                            updateBlock(block.key, (b) => ({
                              ...b,
                              phase: val === "none" ? null : (val as PeriodizationPhase),
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No phase</SelectItem>
                            {PERIODIZATION_PHASES.map((p) => (
                              <SelectItem key={p} value={p}>
                                {PERIODIZATION_PHASE_LABEL[p]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {block.phase && (
                          <Badge className={cn("border-none", PHASE_CLASSNAME[block.phase])}>
                            {PERIODIZATION_PHASE_LABEL[block.phase]}
                          </Badge>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${block.name} block`}
                          onClick={() => removeBlock(block.key)}
                          className="ml-auto text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                {weekChunks.map((chunk, wi) => {
                  const weekBlock = blocks.find((b) => b.key === weekBlockKeys[wi]);
                  return (
                  <div key={wi}>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Input
                        value={weekNames[wi] || `Week ${wi + 1}`}
                        onChange={(e) => renameWeek(wi, e.target.value)}
                        className="h-8 max-w-xs border-none bg-transparent px-0 text-xs font-bold uppercase tracking-wide text-muted-foreground focus-visible:ring-0"
                      />
                      {blocks.length > 0 && (
                        <Select
                          value={weekBlockKeys[wi] ?? "none"}
                          onValueChange={(val) => setWeekBlock(wi, val === "none" ? null : val)}
                        >
                          <SelectTrigger className="h-7 w-[160px] text-xs">
                            <SelectValue placeholder="No block" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No block</SelectItem>
                            {blocks.map((b) => (
                              <SelectItem key={b.key} value={b.key}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {weekBlock?.phase && (
                        <Badge className={cn("border-none", PHASE_CLASSNAME[weekBlock.phase])}>
                          {PERIODIZATION_PHASE_LABEL[weekBlock.phase]}
                        </Badge>
                      )}
                    </div>
                    <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
                  );
                })}
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
          // ProgramAiChatPanel sizes and collapses itself (see its `open`
          // state) -- this wrapper only needs to keep it pinned while the
          // main column scrolls past it.
          <div className="lg:sticky lg:top-24">
            <ProgramAiChatPanel
              apiBase={apiBase}
              programId={programId}
              onApplied={handleChatApplied}
              initialPrompt={initialAiPrompt}
            />
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
                restAfterGroupOnly: false,
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

// A run of 2+ consecutive exercises chained by linkedToNext is one "group"
// for rest-scope purposes -- these two helpers find where the group this
// index belongs to starts/ends, so the group-rest control (shown once,
// after the group's last exercise) can update every exercise in the chain
// together and stay internally consistent.
function isEndOfLinkedGroup(exercises: LocalExercise[], i: number): boolean {
  if (exercises[i].linkedToNext) return false;
  return i > 0 && exercises[i - 1].linkedToNext;
}

function startOfLinkedGroup(exercises: LocalExercise[], endIndex: number): number {
  let start = endIndex;
  while (start > 0 && exercises[start - 1].linkedToNext) start--;
  return start;
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
          <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-3 text-sm text-muted-foreground">
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
                      {isEndOfLinkedGroup(day.exercises, i) && (
                        <div className="py-1 pl-3">
                          <RadioChipGroup
                            label="Rest"
                            options={["Between each", "After the group"]}
                            value={ex.restAfterGroupOnly ? "After the group" : "Between each"}
                            onChange={(v) => {
                              const groupStart = startOfLinkedGroup(day.exercises, i);
                              const restAfterGroupOnly = v === "After the group";
                              onChange((d) => ({
                                ...d,
                                exercises: d.exercises.map((e, idx) =>
                                  idx >= groupStart && idx <= i ? { ...e, restAfterGroupOnly } : e,
                                ),
                              }));
                            }}
                          />
                        </div>
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
    <div className="flex items-center gap-1.5 py-0 pl-3">
      <div className={cn("h-2 w-px", linked ? "bg-blue-500" : "bg-transparent")} />
      <button
        type="button"
        onClick={onToggle}
        title={linked ? "Unlink superset" : "Link into a superset"}
        className={cn(
          "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors",
          linked
            ? "border-blue-500 bg-blue-500 text-white"
            : "border-border text-muted-foreground hover:border-blue-500 hover:text-blue-500",
        )}
      >
        <Link2 className="h-2.5 w-2.5" />
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
      <div className="grid grid-cols-4 gap-1.5">
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
        <FieldInput
          label="Rest (sec)"
          value={exercise.restSeconds}
          onChange={(v) => onUpdate({ restSeconds: v })}
          type="number"
        />
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
