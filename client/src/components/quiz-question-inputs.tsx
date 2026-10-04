import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import { shuffled, type QuizQuestionPayload, type QuizQuestionType, type QuizSubmission } from "@shared/class-quiz-grading";

/** The three non-multiple-choice question inputs (2026-10-04). Each one works by touch and by
 * pointer: ordering and matching drag with dnd-kit and also take taps and buttons, because a
 * phone in a gym is where most of these get answered. None of them knows the answer key. */

export function FillBlankInput({ questionText, value, onChange, disabled }: { questionText: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [before, after] = questionText.split("___");
  return (
    <div className="space-y-2 text-sm">
      <p className="leading-relaxed">
        {before}
        <span className="mx-1 inline-block min-w-32 border-b-2 border-primary align-baseline">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="type the answer"
            className="h-7 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
            maxLength={200}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </span>
        {after}
      </p>
    </div>
  );
}

function SortableRow({ id, index, total, onMove, disabled }: { id: string; index: number; total: number; onMove: (dir: -1 | 1) => void; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-2 text-sm", isDragging && "border-primary shadow-md")}
    >
      <button type="button" className="cursor-grab touch-none text-muted-foreground" aria-label="Drag to reorder" disabled={disabled} {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 shrink-0 text-xs font-semibold text-muted-foreground">{index + 1}.</span>
      <span className="flex-1">{id}</span>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" onClick={() => onMove(-1)} disabled={disabled || index === 0}>
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" onClick={() => onMove(1)} disabled={disabled || index === total - 1}>
        <ChevronDown className="h-4 w-4" />
      </Button>
    </li>
  );
}

/** The athlete arranges a shuffled copy of the items. `value` is their current order; the
 * first render shuffles once and reports it so Submit has something to send. */
export function OrderingInput({ payload, value, onChange, disabled }: { payload: QuizQuestionPayload | null; value: string[] | null | undefined; onChange: (order: string[]) => void; disabled?: boolean }) {
  const items = payload?.items ?? [];
  useEffect(() => {
    if (!value || value.length !== items.length) {
      let s = shuffled(items);
      // A shuffle that lands on the right order teaches nothing; try again once.
      if (items.length > 1 && s.every((it, i) => it === items[i])) s = shuffled(items);
      onChange(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.join("\u0000")]);
  const order = value && value.length === items.length ? value : items;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(order, from, to));
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Put these in the right order. Drag, or use the arrows.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="space-y-1.5">
            {order.map((it, i) => (
              <SortableRow
                key={it}
                id={it}
                index={i}
                total={order.length}
                disabled={disabled}
                onMove={(dir) => {
                  const j = i + dir;
                  if (j < 0 || j >= order.length) return;
                  onChange(arrayMove(order, i, j));
                }}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function Chip({ id, label, disabled }: { id: string; label: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("touch-none rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary", isDragging && "opacity-70 shadow-md")}
      {...attributes}
      {...listeners}
    >
      {label}
    </button>
  );
}

function Slot({ id, left, chosen, selectedRight, onTap, onClear, disabled }: { id: string; left: string; chosen: string | undefined; selectedRight: string | null; onTap: () => void; onClear: () => void; disabled?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("flex items-center gap-2 rounded-md border p-2 text-sm", isOver ? "border-primary bg-primary/5" : "border-border bg-surface")}>
      <span className="flex-1 font-medium">{left}</span>
      {chosen ? (
        <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          {chosen}
          {!disabled && (
            <button type="button" aria-label="Clear" onClick={onClear} className="ml-0.5">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ) : (
        <button
          type="button"
          onClick={onTap}
          disabled={disabled || !selectedRight}
          className={cn("rounded-full border border-dashed px-3 py-1 text-xs", selectedRight ? "border-primary text-primary" : "border-border text-muted-foreground")}
        >
          {selectedRight ? `Place "${selectedRight}"` : "drop here"}
        </button>
      )}
    </div>
  );
}

/** Drag a right-column chip onto its left-column slot, or tap a chip then tap a slot. */
export function MatchingInput({ payload, value, onChange, disabled }: { payload: QuizQuestionPayload | null; value: Record<string, string> | null | undefined; onChange: (m: Record<string, string>) => void; disabled?: boolean }) {
  const pairs = payload?.pairs ?? [];
  const rights = useMemo(() => shuffled(pairs.map((p) => p.right)), [pairs.map((p) => p.right).join("\u0000")]);
  const matches = value ?? {};
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const used = new Set(Object.values(matches));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );
  function place(left: string, right: string) {
    const next: Record<string, string> = { ...matches };
    for (const k of Object.keys(next)) if (next[k] === right) delete next[k];
    next[left] = right;
    onChange(next);
    setSelectedRight(null);
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const right = String(active.id).replace(/^chip:/, "");
    const left = String(over.id).replace(/^slot:/, "");
    if (pairs.some((p) => p.left === left)) place(left, right);
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Match each item on the left with the right one. Drag a chip onto it, or tap a chip then tap the row.</p>
        <div className="flex flex-wrap gap-2">
          {rights.filter((r) => !used.has(r)).map((r) => (
            <div key={r} onClick={() => !disabled && setSelectedRight((s) => (s === r ? null : r))} className={cn("rounded-full", selectedRight === r && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
              <Chip id={`chip:${r}`} label={r} disabled={disabled} />
            </div>
          ))}
          {rights.every((r) => used.has(r)) && <span className="text-xs text-muted-foreground">All placed.</span>}
        </div>
        <div className="space-y-1.5">
          {pairs.map((p) => (
            <Slot
              key={p.left}
              id={`slot:${p.left}`}
              left={p.left}
              chosen={matches[p.left]}
              selectedRight={selectedRight}
              disabled={disabled}
              onTap={() => selectedRight && place(p.left, selectedRight)}
              onClear={() => {
                const next = { ...matches };
                delete next[p.left];
                onChange(next);
              }}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}

/** What the right answer was, for the three non-multiple-choice shapes, beside what the
 * reader gave. The key only exists on a graded result. Shared by the class reader and the
 * Coaches Corner track quiz. */
export type QuizKeyResultProps = {
  questionType?: QuizQuestionType;
  /** The key, handed back only after grading. */
  payload?: QuizQuestionPayload | null;
  submitted?: QuizSubmission | null;
  isCorrect: boolean;
};
export function QuizKeyResult({ result: r }: { result: QuizKeyResultProps }) {
  const payload = r.payload ?? null;
  const sub = r.submitted ?? null;
  const explanation = payload?.explanation?.trim();
  return (
    <div className="space-y-2 pl-6 text-xs">
      {r.questionType === "fill_blank" && (
        <>
          <p>
            <span className="text-muted-foreground">Your answer: </span>
            <span className={cn("font-medium", r.isCorrect ? "text-success" : "text-destructive")}>{sub?.text?.trim() || "(blank)"}</span>
          </p>
          {!r.isCorrect && (payload?.accepted?.length ?? 0) > 0 && (
            <p>
              <span className="text-muted-foreground">Accepted: </span>
              <span className="font-medium">{payload!.accepted!.join(", ")}</span>
            </p>
          )}
        </>
      )}
      {r.questionType === "ordering" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-muted-foreground">Your order</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              {(sub?.order ?? []).map((it, i) => (
                <li key={i} className={cn(payload?.items?.[i] === it ? "text-success" : "text-destructive")}>{it}</li>
              ))}
            </ol>
          </div>
          {!r.isCorrect && (
            <div>
              <p className="mb-1 text-muted-foreground">Correct order</p>
              <ol className="list-decimal space-y-0.5 pl-4">
                {(payload?.items ?? []).map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
      {r.questionType === "matching" && (
        <div className="space-y-1">
          {(payload?.pairs ?? []).map((p) => {
            const given = sub?.matches?.[p.left];
            const ok = given === p.right;
            return (
              <p key={p.left}>
                <span className="font-medium">{p.left}</span>
                <span className="text-muted-foreground"> → </span>
                <span className={cn(ok ? "text-success" : "text-destructive")}>{given ?? "(none)"}</span>
                {!ok && (
                  <>
                    <span className="text-muted-foreground"> · correct: </span>
                    <span>{p.right}</span>
                  </>
                )}
              </p>
            );
          })}
        </div>
      )}
      {explanation && <p className="text-muted-foreground">{explanation}</p>}
    </div>
  );
}
