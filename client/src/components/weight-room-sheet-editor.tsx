/* WEIGHT-ROOM SHEET EDITOR (2026-11-21). The edit screen is the sheet itself: a live preview that
 * looks like the printout (weight-room-sheet-preview.tsx), edited in place, with a toolbar above it.
 *
 * Everything on the sheet is optional: every element has a toggle in the toolbar, and the coach
 * can strip it back to a bare grid. Branding is the one thing not here: it is the program's look
 * from the Branding page, shown on the sheet and not editable from it.
 *
 * What is saved as the team default (Save as team default): the toggles, view, page, unit,
 * grouping and sorting, bar and plates, lift order, hidden lifts, set count and % per lift,
 * athlete order, custom columns and text blocks. What applies to today's sheet only: the note
 * line, who is left off, and any cell typed over (one athlete's target, a lift's goal, rest or
 * effort). "Undo my changes" goes back to the saved default and the computed values.
 *
 * The read is never hydrated into state by an effect (CLAUDE.md, "Hydrate-in-an-effect"): the
 * draft is null until the coach changes something, and the editor does not open until the read
 * has landed, so a failed read can never save an empty layout over the team's default. */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Plus, Printer, Save, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, getJson, queryClient } from "@/lib/queryClient";
import { shareOrDownloadBlob } from "@/lib/share-file";
import { WeightRoomSheetPreview, type SheetBrand, type SheetCellEdit } from "@/components/weight-room-sheet-preview";
import {
  EMPTY_DAY_EDITS,
  GROUP_BY,
  RPE_MODES,
  SHEET_TOGGLES,
  SHEET_TOGGLE_KEYS,
  SHEET_VIEWS,
  SHEET_VIEW_LABEL,
  SORT_BY,
  buildSheet,
  defaultLiftOrder,
  type SheetDayEdits,
  type SheetLayout,
  type SheetSource,
  type SheetSourceLift,
} from "@shared/weight-room-sheet";

type DayChoice = { programDayId: number; title: string; programName: string; athletes: number };
type SheetDayData = { source: SheetSource | null; days: DayChoice[]; layout: SheetLayout; brand: SheetBrand };

const GROUP_LABEL: Record<(typeof GROUP_BY)[number], string> = { none: "No grouping", rosterGroup: "Roster group", position: "Position" };
const SORT_LABEL: Record<(typeof SORT_BY)[number], string> = { last: "Last name", first: "First name", custom: "Your order" };
const RPE_LABEL: Record<(typeof RPE_MODES)[number], string> = { lift: "RPE: one per lift", set: "RPE: one per set", off: "RPE: off" };
const MAX_SETS = 12;
const MIN_SETS = 1;
const ISO_DATE_LENGTH = 10;
/** The program builder's drag feel: a 4px move starts a drag, a 150ms press on touch. */
const DRAG_DISTANCE_PX = 4;
const TOUCH_DELAY_MS = 150;
const TOUCH_TOLERANCE_PX = 6;
const ID_LENGTH = 8;
const newId = () => crypto.randomUUID().slice(0, ID_LENGTH);

const sheetKey = (teamId: number, date: string, day: number | null) => ["/api/coach/weight-room/sheets", teamId, date, day];

function SortableLift({ lift, index, total, onMove }: { lift: SheetSourceLift; index: number; total: number; onMove: (dir: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: lift.exerciseId });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex items-center gap-2 rounded border bg-background px-2 py-1 text-sm">
      <button type="button" className="cursor-grab touch-none text-muted-foreground" aria-label={`Drag ${lift.name}`} {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 truncate">{lift.name}</span>
      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${lift.name} up`}>
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Move ${lift.name} down`}>
        <ChevronDown className="h-4 w-4" />
      </Button>
    </li>
  );
}

function SortableAthlete({ id, name, index, total, onMove, included, onToggle }: { id: number; name: string; index: number; total: number; onMove: (dir: -1 | 1) => void; included: boolean; onToggle: (on: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex items-center gap-2 rounded border bg-background px-2 py-1 text-sm">
      <button type="button" className="cursor-grab touch-none text-muted-foreground" aria-label={`Drag ${name}`} {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox checked={included} onCheckedChange={(v) => onToggle(v === true)} aria-label={`Print ${name}`} />
      <span className="flex-1 truncate">{name}</span>
      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${name} up`}>
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Move ${name} down`}>
        <ChevronDown className="h-4 w-4" />
      </Button>
    </li>
  );
}

export function WeightRoomSheetEditor({ teams }: { teams: { id: number; name: string }[] }) {
  const [teamId, setTeamId] = useState<number | null>(teams[0]?.id ?? null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, ISO_DATE_LENGTH));
  const [programDayId, setProgramDayId] = useState<number | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<SheetLayout | null>(null);
  const [edits, setEdits] = useState<SheetDayEdits>(EMPTY_DAY_EDITS);
  const [orderNoteDismissed, setOrderNoteDismissed] = useState(false);
  const [newColumn, setNewColumn] = useState("");
  const [newBlock, setNewBlock] = useState("");

  const sheet = useQuery<SheetDayData>({
    queryKey: sheetKey(teamId ?? 0, date, programDayId),
    queryFn: () => getJson(`/api/coach/weight-room/sheets/${teamId}?date=${date}${programDayId ? `&programDayId=${programDayId}` : ""}`),
    enabled: teamId != null,
  });
  const layout = layoutDraft ?? sheet.data?.layout ?? null;
  const source = sheet.data?.source ?? null;
  const model = useMemo(() => (source && layout ? buildSheet(source, layout, edits) : null), [source, layout, edits]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const change = (patch: Partial<SheetLayout>) => layout && setLayoutDraft({ ...layout, ...patch });
  const toggle = (key: (typeof SHEET_TOGGLE_KEYS)[number], on: boolean) => layout && change({ toggles: { ...layout.toggles, [key]: on } });

  const liftOrder = useMemo(() => {
    if (!source || !layout) return [];
    const base = layout.liftOrder.length > 0 ? layout.liftOrder : defaultLiftOrder(source.lifts).map((l) => l.exerciseId);
    const known = base.map((id) => source.lifts.find((l) => l.exerciseId === id)).filter((l): l is SheetSourceLift => l != null);
    return [...known, ...source.lifts.filter((l) => !base.includes(l.exerciseId))];
  }, [source, layout]);
  const athleteOrder = useMemo(() => {
    if (!source || !model) return [];
    return model.groups.flatMap((g) => g.rows.map((r) => r.athleteId)).concat(edits.excludedAthletes).filter((id, i, all) => all.indexOf(id) === i);
  }, [source, model, edits.excludedAthletes]);

  const moveLift = (from: number, to: number) => {
    if (to < 0 || to >= liftOrder.length) return;
    setOrderNoteDismissed(false);
    change({ liftOrder: arrayMove(liftOrder.map((l) => l.exerciseId), from, to) });
  };
  const moveAthlete = (from: number, to: number) => {
    if (to < 0 || to >= athleteOrder.length) return;
    change({ athleteOrder: arrayMove(athleteOrder, from, to), sortBy: "custom" });
  };

  const onEdit = (edit: SheetCellEdit) => {
    if (!layout) return;
    const key = "exerciseId" in edit ? String(edit.exerciseId) : "";
    if (edit.kind === "sets") {
      const n = Math.round(Number(edit.value));
      if (n >= MIN_SETS && n <= MAX_SETS) change({ setsByLift: { ...layout.setsByLift, [key]: n } });
      return;
    }
    if (edit.kind === "percent") {
      const n = Number(edit.value.replace("%", ""));
      if (Number.isFinite(n) && n >= 0) change({ percentByLift: { ...layout.percentByLift, [key]: n } });
      return;
    }
    if (edit.kind === "note") return setEdits({ ...edits, note: edit.value });
    if (edit.kind === "target") {
      const athlete = String(edit.athleteId);
      return setEdits({ ...edits, targetOverrides: { ...edits.targetOverrides, [athlete]: { ...(edits.targetOverrides[athlete] ?? {}), [key]: edit.value } } });
    }
    const field = { goal: "goalOverrides", rest: "restOverrides", effort: "effortOverrides" } as const;
    const map = field[edit.kind];
    setEdits({ ...edits, [map]: { ...edits[map], [key]: edit.value } });
  };

  const save = useMutation({
    mutationFn: async () => apiRequest("PUT", `/api/coach/weight-room/sheets/${teamId}/layout`, { layout }),
    onSuccess: () => {
      toast.success("Saved as this team's default sheet.");
      void queryClient.invalidateQueries({ queryKey: ["/api/coach/weight-room/sheets", teamId] });
      setLayoutDraft(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const print = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/coach/weight-room/sheets/${teamId}/pdf`, { date, programDayId: source?.programDayId ?? null, layout, edits });
      return res.blob();
    },
    onSuccess: (blob) => void shareOrDownloadBlob(blob, `sheet-${date}.pdf`, "Weight-room sheet"),
    onError: (err: Error) => toast.error(err.message),
  });

  const states: { state: "failed" | "loading" | "empty" | "ready"; when: boolean }[] = [
    { state: "failed", when: sheet.isError },
    { state: "loading", when: sheet.isLoading || !sheet.data || !layout },
    { state: "empty", when: !source || !model },
    { state: "ready", when: true },
  ];
  const state = states.find((s) => s.when)?.state ?? "ready";
  const changedSomething =layoutDraft != null || JSON.stringify(edits) !== JSON.stringify(EMPTY_DAY_EDITS);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Team</Label>
          <Select value={teamId ? String(teamId) : ""} onValueChange={(v) => { setTeamId(Number(v)); setLayoutDraft(null); setEdits(EMPTY_DAY_EDITS); setProgramDayId(null); }}>
            <SelectTrigger data-testid="select-sheet-team"><SelectValue placeholder="Pick a team" /></SelectTrigger>
            <SelectContent>
              {teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sheet-date">Date</Label>
          <Input id="sheet-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setProgramDayId(null); setEdits(EMPTY_DAY_EDITS); }} />
        </div>
        {sheet.data && sheet.data.days.length > 1 && (
          <div className="space-y-1">
            <Label>Workout</Label>
            <Select value={String(source?.programDayId ?? "")} onValueChange={(v) => { setProgramDayId(Number(v)); setEdits(EMPTY_DAY_EDITS); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sheet.data.days.map((d) => (
                  <SelectItem key={d.programDayId} value={String(d.programDayId)}>
                    {d.title} · {d.programName} ({d.athletes})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {state === "failed" && <ReadFailed what="this team's sheet" onRetry={() => sheet.refetch()} error={sheet.error} />}
      {state === "loading" && <p className="text-sm text-muted-foreground">Loading the sheet…</p>}
      {state === "empty" && (
        <p className="text-sm text-muted-foreground">Nobody on this team has a workout from your program on {date}. Assign the team a program, or pick another date.</p>
      )}
      {state === "ready" && model && layout && source && sheet.data && (
        <>
          <div className="space-y-3 rounded-md border p-3" data-testid="sheet-toolbar">
            <div className="flex flex-wrap gap-2">
              <Select value={layout.view} onValueChange={(v) => change({ view: v as SheetLayout["view"] })}>
                <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
                <SelectContent>{SHEET_VIEWS.map((v) => <SelectItem key={v} value={v}>{SHEET_VIEW_LABEL[v]}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={layout.page.size} onValueChange={(v) => change({ page: { ...layout.page, size: v as "letter" | "a4" } })}>
                <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="letter">Letter</SelectItem><SelectItem value="a4">A4</SelectItem></SelectContent>
              </Select>
              <Select value={model.orientation} onValueChange={(v) => change({ page: { ...layout.page, orientation: v as "portrait" | "landscape" } })}>
                <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="portrait">Portrait</SelectItem><SelectItem value="landscape">Landscape</SelectItem></SelectContent>
              </Select>
              <Select value={model.unit} onValueChange={(v) => change({ unit: v as "lbs" | "kg", bar: null, plates: null })}>
                <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="lbs">lb</SelectItem><SelectItem value="kg">kg</SelectItem></SelectContent>
              </Select>
              <Select value={layout.groupBy} onValueChange={(v) => change({ groupBy: v as SheetLayout["groupBy"] })}>
                <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
                <SelectContent>{GROUP_BY.map((g) => <SelectItem key={g} value={g}>{GROUP_LABEL[g]}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={layout.sortBy} onValueChange={(v) => change({ sortBy: v as SheetLayout["sortBy"] })}>
                <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
                <SelectContent>{SORT_BY.map((s) => <SelectItem key={s} value={s}>{SORT_LABEL[s]}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={layout.rpe} onValueChange={(v) => change({ rpe: v as SheetLayout["rpe"] })}>
                <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
                <SelectContent>{RPE_MODES.map((r) => <SelectItem key={r} value={r}>{RPE_LABEL[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {SHEET_TOGGLE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={layout.toggles[key]} onCheckedChange={(v) => toggle(key, v === true)} data-testid={`toggle-${key}`} />
                  {SHEET_TOGGLES[key].label}
                </label>
              ))}
            </div>
            {layout.toggles.plates && (
              <div className="flex flex-wrap items-end gap-2 text-sm">
                <div className="space-y-1">
                  <Label htmlFor="sheet-bar">Bar ({model.unit === "kg" ? "kg" : "lb"})</Label>
                  <Input id="sheet-bar" className="w-20" inputMode="decimal" defaultValue={String(model.bar)} onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) change({ bar: n }); }} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sheet-plates">Plates</Label>
                  <Input id="sheet-plates" className="w-56" defaultValue={model.plates.join(", ")} onBlur={(e) => { const list = e.target.value.split(",").map((p) => Number(p.trim())).filter((p) => p > 0); if (list.length > 0) change({ plates: list }); }} />
                </div>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Lifts (drag, or use the arrows)</p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                  const from = liftOrder.findIndex((l) => l.exerciseId === e.active.id);
                  const to = liftOrder.findIndex((l) => l.exerciseId === e.over?.id);
                  if (from >= 0 && to >= 0 && from !== to) moveLift(from, to);
                }}>
                  <SortableContext items={liftOrder.map((l) => l.exerciseId)} strategy={verticalListSortingStrategy}>
                    <ol className="space-y-1">
                      {liftOrder.map((lift, i) => (
                        <div key={lift.exerciseId} className="flex items-center gap-1">
                          <Checkbox checked={!layout.hiddenLifts.includes(lift.exerciseId)} onCheckedChange={(v) => change({ hiddenLifts: v === true ? layout.hiddenLifts.filter((id) => id !== lift.exerciseId) : [...layout.hiddenLifts, lift.exerciseId] })} aria-label={`Show ${lift.name}`} />
                          <div className="flex-1"><SortableLift lift={lift} index={i} total={liftOrder.length} onMove={(dir) => moveLift(i, i + dir)} /></div>
                        </div>
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Athletes ({athleteOrder.length - edits.excludedAthletes.length} printed)</p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                  const from = athleteOrder.indexOf(Number(e.active.id));
                  const to = athleteOrder.indexOf(Number(e.over?.id));
                  if (from >= 0 && to >= 0 && from !== to) moveAthlete(from, to);
                }}>
                  <SortableContext items={athleteOrder} strategy={verticalListSortingStrategy}>
                    <ol className="max-h-64 space-y-1 overflow-y-auto">
                      {athleteOrder.map((id, i) => (
                        <SortableAthlete
                          key={id}
                          id={id}
                          name={source.athletes.find((a) => a.athleteId === id)?.displayName ?? ""}
                          index={i}
                          total={athleteOrder.length}
                          onMove={(dir) => moveAthlete(i, i + dir)}
                          included={!edits.excludedAthletes.includes(id)}
                          onToggle={(on) => setEdits({ ...edits, excludedAthletes: on ? edits.excludedAthletes.filter((x) => x !== id) : [...edits.excludedAthletes, id] })}
                        />
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="sheet-new-column">Your own column</Label>
                <Input id="sheet-new-column" className="w-40" placeholder="Hurt? / Bar #" value={newColumn} maxLength={40} onChange={(e) => setNewColumn(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" disabled={!newColumn.trim()} onClick={() => { change({ customColumns: [...layout.customColumns, { id: newId(), header: newColumn.trim() }] }); setNewColumn(""); }}>
                <Plus className="mr-1 h-4 w-4" />Add column
              </Button>
              <div className="space-y-1">
                <Label htmlFor="sheet-new-block">Your own text</Label>
                <Input id="sheet-new-block" className="w-56" placeholder="e.g. Hydrate between supersets" value={newBlock} maxLength={300} onChange={(e) => setNewBlock(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" disabled={!newBlock.trim()} onClick={() => { change({ customBlocks: [...layout.customBlocks, { id: newId(), text: newBlock.trim(), beforeExerciseId: liftOrder[0]?.exerciseId ?? null }] }); setNewBlock(""); }}>
                <Plus className="mr-1 h-4 w-4" />Add text
              </Button>
            </div>
            {(layout.customColumns.length > 0 || layout.customBlocks.length > 0) && (
              <ul className="space-y-1 text-sm">
                {layout.customColumns.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    Column: {c.header}
                    <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Remove ${c.header}`} onClick={() => change({ customColumns: layout.customColumns.filter((x) => x.id !== c.id) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
                {layout.customBlocks.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2">
                    Text: “{b.text}” before
                    <Select value={String(b.beforeExerciseId ?? "end")} onValueChange={(v) => change({ customBlocks: layout.customBlocks.map((x) => (x.id === b.id ? { ...x, beforeExerciseId: v === "end" ? null : Number(v) } : x)) })}>
                      <SelectTrigger className="h-7 w-auto"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {liftOrder.map((l) => <SelectItem key={l.exerciseId} value={String(l.exerciseId)}>{l.name}</SelectItem>)}
                        <SelectItem value="end">the end</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Remove text" onClick={() => change({ customBlocks: layout.customBlocks.filter((x) => x.id !== b.id) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => print.mutate()} disabled={print.isPending} data-testid="button-print-sheet">
                <Printer className="mr-1 h-4 w-4" />Print sheet
              </Button>
              <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending || layoutDraft == null}>
                <Save className="mr-1 h-4 w-4" />Save as team default
              </Button>
              <Button variant="ghost" disabled={!changedSomething} onClick={() => { setLayoutDraft(null); setEdits(EMPTY_DAY_EDITS); }} data-testid="button-undo-sheet">
                <Undo2 className="mr-1 h-4 w-4" />Undo my changes
              </Button>
            </div>
          </div>

          {model.orderNote && !orderNoteDismissed && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm" role="note">
              <span className="flex-1">{model.orderNote} This tip is not printed.</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Dismiss" onClick={() => setOrderNoteDismissed(true)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Click any number to type over it. Tab and Enter move on, the arrow keys move between cells, Escape cancels. What you see is what prints.</p>
          <WeightRoomSheetPreview model={model} brand={sheet.data.brand} onEdit={onEdit} />
        </>
      )}
    </div>
  );
}
