/**
 * THE WARM-UP SECTION OF A PROGRAM BUILDER DAY (2026-11-22). Scott: "I want every single workout
 * plan ... have warmups, I really want to see it."
 *
 * A day card shows "Warm-up" ABOVE its main exercises: an ordered list of library drills (picked
 * with the ordinary exercise picker, opened on the search "warmup" so tagged drills come first),
 * each with sets, reps or seconds and a note, plus a note for the block. "Use a warm-up program"
 * copies the days of a program tagged as a warm-up into this block. Nothing here saves: the
 * builder's own Save Program sends the block with the day (shared/program-day-warmup.ts holds the
 * rules, and the server normalizes it on the way in).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Flame, ListPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReadFailed } from "@/components/read-failed";
import { getJson } from "@/lib/queryClient";
import {
  estimateWarmupMinutes,
  warmupFromProgramDays,
  type ResolvedWarmupBlock,
  type WarmupBlock,
  type WarmupProgramDay,
} from "@shared/program-day-warmup";

export type LocalWarmupItem = {
  key: string;
  exerciseId: number;
  exerciseName: string;
  sets: string;
  reps: string;
  seconds: string;
  note: string;
};
export type LocalWarmup = { note: string; items: LocalWarmupItem[] };

const uid = () => crypto.randomUUID();

export const emptyLocalWarmup = (): LocalWarmup => ({ note: "", items: [] });

/** A stored (resolved) block as the builder's editable rows. Drills whose exercise is gone drop out. */
export function localWarmupFrom(block: ResolvedWarmupBlock | null | undefined): LocalWarmup {
  if (!block) return emptyLocalWarmup();
  return {
    note: block.note ?? "",
    items: block.items
      .filter((i) => i.exercise)
      .map((i) => ({
        key: uid(),
        exerciseId: i.exerciseId,
        exerciseName: i.exercise?.name ?? "",
        sets: i.sets != null ? String(i.sets) : "",
        reps: i.reps ?? "",
        seconds: i.durationSeconds != null ? String(i.durationSeconds) : "",
        note: i.note ?? "",
      })),
  };
}

const numberOrNull = (text: string): number | null => {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** The builder's rows as the save payload: null for an empty block, so a cleared warm-up clears. */
export function warmupPayload(local: LocalWarmup | undefined): WarmupBlock | null | undefined {
  if (local === undefined) return undefined;
  const items = local.items.map((i) => ({
    exerciseId: i.exerciseId,
    sets: numberOrNull(i.sets),
    reps: i.reps.trim() || null,
    durationSeconds: numberOrNull(i.seconds),
    note: i.note.trim() || null,
  }));
  const note = local.note.trim() || null;
  return items.length === 0 && note == null ? null : { note, items };
}

/** A new drill row from the picker, with a light default (one set of ten). */
export function localWarmupItemFrom(exercise: { id: number; name: string }): LocalWarmupItem {
  return { key: uid(), exerciseId: exercise.id, exerciseName: exercise.name, sets: "1", reps: "10", seconds: "", note: "" };
}

const move = <T,>(list: readonly T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export function DayWarmupSection({
  warmup,
  dayNumber,
  onChange,
  onAddDrill,
  onUseProgram,
}: {
  warmup: LocalWarmup;
  dayNumber: number;
  onChange: (next: LocalWarmup) => void;
  onAddDrill: () => void;
  onUseProgram: () => void;
}) {
  const minutes = estimateWarmupMinutes(
    warmup.items.map((i) => ({ sets: numberOrNull(i.sets), reps: i.reps || null, durationSeconds: numberOrNull(i.seconds) })),
  );
  const patch = (key: string, p: Partial<LocalWarmupItem>) =>
    onChange({ ...warmup, items: warmup.items.map((i) => (i.key === key ? { ...i, ...p } : i)) });
  return (
    <div className="space-y-2 rounded-md border border-orange-500/30 bg-orange-500/5 p-2.5" data-testid={`warmup-section-${dayNumber}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="label-xs flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
          <Flame className="h-3.5 w-3.5" />
          Warm-up
        </p>
        {warmup.items.length > 0 && <span className="text-[11px] text-muted-foreground">about {minutes} min</span>}
      </div>
      {warmup.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No warm-up yet. Add drills, or copy one from a warm-up program.</p>
      ) : (
        <ol className="space-y-1.5">
          {warmup.items.map((item, i) => (
            <li key={item.key} className="rounded border border-border bg-surface-elevated p-2" data-testid={`warmup-item-${dayNumber}-${i}`}>
              <div className="mb-1.5 flex items-center gap-1">
                <span className="flex-1 truncate text-xs font-semibold">{item.exerciseName}</span>
                <button type="button" aria-label={`Move ${item.exerciseName} up`} onClick={() => onChange({ ...warmup, items: move(warmup.items, i, i - 1) })} className="text-muted-foreground hover:text-foreground">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={`Move ${item.exerciseName} down`} onClick={() => onChange({ ...warmup, items: move(warmup.items, i, i + 1) })} className="text-muted-foreground hover:text-foreground">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={`Remove ${item.exerciseName} from the warm-up`} onClick={() => onChange({ ...warmup, items: warmup.items.filter((x) => x.key !== item.key) })} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <SmallField label="Sets" value={item.sets} inputMode="numeric" onChange={(v) => patch(item.key, { sets: v })} />
                <SmallField label="Reps" value={item.reps} inputMode="numeric" onChange={(v) => patch(item.key, { reps: v })} />
                <SmallField label="Seconds" value={item.seconds} inputMode="numeric" onChange={(v) => patch(item.key, { seconds: v })} />
              </div>
              <Input
                value={item.note}
                placeholder="Note (optional)"
                aria-label={`Note for ${item.exerciseName}`}
                onChange={(e) => patch(item.key, { note: e.target.value })}
                className="mt-1.5 h-7 px-2 text-xs"
              />
            </li>
          ))}
        </ol>
      )}
      <Input
        value={warmup.note}
        placeholder="Warm-up note (optional)"
        aria-label={`Warm-up note for day ${dayNumber}`}
        onChange={(e) => onChange({ ...warmup, note: e.target.value })}
        className="h-7 px-2 text-xs"
      />
      <div className="flex flex-col gap-1.5">
        <Button size="sm" variant="outline" className="w-full" onClick={onAddDrill} data-testid={`button-add-warmup-${dayNumber}`}>
          <Plus className="h-3.5 w-3.5" />
          Add warm-up drill
        </Button>
        <Button size="sm" variant="ghost" className="w-full" onClick={onUseProgram} data-testid={`button-use-warmup-program-${dayNumber}`}>
          <ListPlus className="h-3.5 w-3.5" />
          Use a warm-up program
        </Button>
      </div>
    </div>
  );
}

function SmallField({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (v: string) => void; inputMode?: "numeric" }) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] uppercase text-muted-foreground">{label}</label>
      <Input value={value} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} className="h-7 px-2 text-xs" />
    </div>
  );
}

type ProgramSummary = { id: number; name: string; purposes?: string[] | null };
type ProgramDetail = {
  id: number;
  name: string;
  weeks: Array<{ days: Array<{ id: number; title: string; isRestDay: boolean; exercises: Array<{ exerciseId: number; sets: number; reps: string; notes: string | null; exercise: { id: number; name: string } }> }> }>;
};

/**
 * "Use a warm-up program": the programs tagged purpose "warmup" this reader can see, then the
 * chosen program's days. Picking a day (or "All days") REPLACES this day's warm-up block with a
 * copy; the program itself is never touched.
 */
export function WarmupProgramDialog({
  open,
  onOpenChange,
  apiBase,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  onPick: (warmup: LocalWarmup) => void;
}) {
  const [programId, setProgramId] = useState<number | null>(null);
  const list = useQuery<ProgramSummary[]>({
    queryKey: [`${apiBase}/programs`],
    queryFn: () => getJson(`${apiBase}/programs`),
    enabled: open,
  });
  const detail = useQuery<ProgramDetail>({
    queryKey: [`${apiBase}/programs`, programId],
    queryFn: () => getJson(`${apiBase}/programs/${programId}`),
    enabled: open && programId != null,
  });
  const warmupPrograms = (list.data ?? []).filter((p) => p.purposes?.includes("warmup"));
  const days = (detail.data?.weeks ?? []).flatMap((w) => w.days).filter((d) => !d.isRestDay && d.exercises.length > 0);
  const names = new Map(days.flatMap((d) => d.exercises.map((ex) => [ex.exerciseId, ex.exercise.name] as const)));
  const pick = (chosen: WarmupProgramDay[]) => {
    const block = warmupFromProgramDays(chosen);
    onPick({
      note: "",
      items: (block?.items ?? []).map((i) => ({
        key: uid(),
        exerciseId: i.exerciseId,
        exerciseName: names.get(i.exerciseId) ?? "",
        sets: i.sets != null ? String(i.sets) : "",
        reps: i.reps ?? "",
        seconds: "",
        note: i.note ?? "",
      })),
    });
    setProgramId(null);
    onOpenChange(false);
  };
  const body = () => {
    if (list.isError) return <ReadFailed what="your programs" error={list.error} onRetry={() => void list.refetch()} />;
    if (programId == null) {
      return (
        <div className="space-y-1.5" data-testid="warmup-program-list">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!list.isLoading && warmupPrograms.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No warm-up programs yet. Tag a program "Warm-up" in its builder and it shows here.
            </p>
          )}
          {warmupPrograms.map((p) => (
            <Button key={p.id} variant="outline" className="w-full justify-start" onClick={() => setProgramId(p.id)}>
              {p.name}
            </Button>
          ))}
        </div>
      );
    }
    if (detail.isError) return <ReadFailed what="that program" error={detail.error} onRetry={() => void detail.refetch()} />;
    return (
      <div className="space-y-1.5" data-testid="warmup-program-days">
        {detail.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {days.map((d) => (
          <Button key={d.id} variant="outline" className="h-auto w-full flex-col items-start py-2" onClick={() => pick([d])}>
            <span className="text-sm font-semibold">{d.title}</span>
            <span className="text-left text-xs text-muted-foreground">{d.exercises.map((ex) => ex.exercise.name).join(", ")}</span>
          </Button>
        ))}
        {days.length > 1 && (
          <Button variant="secondary" className="w-full" onClick={() => pick(days)}>
            All days, in order
          </Button>
        )}
        {!detail.isLoading && days.length === 0 && <p className="text-sm text-muted-foreground">That program has no drills to copy.</p>}
        <Button variant="ghost" size="sm" onClick={() => setProgramId(null)}>
          Back to warm-up programs
        </Button>
      </div>
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setProgramId(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use a warm-up program</DialogTitle>
          <DialogDescription>Copies a warm-up program's drills into this day's warm-up. The program itself is not changed.</DialogDescription>
        </DialogHeader>
        {body()}
      </DialogContent>
    </Dialog>
  );
}
