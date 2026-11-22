/* THE WEIGHT-ROOM SHEET, ON SCREEN (2026-11-21). The coach's editor IS the sheet: this draws the
 * same SheetModel the PDF prints (shared/weight-room-sheet.ts buildSheet), so what prints is what
 * is on screen, and any cell the coach may change is typed into in place.
 *
 * Editing like a spreadsheet: click a cell (or press Enter on it) to type; Tab and Enter commit and
 * move to the next cell, the arrow keys move between cells, Escape cancels. A changed cell carries
 * a small marker. Supersets look the way they do in the app: the letter badge in its hue
 * (colorForLabel), a thick colored left border with a light tint around the group
 * (borderTintForLabel) and a small "Superset" label. On a phone the sheet scrolls sideways inside
 * its own box. */
import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { borderTintForLabel, colorForLabel } from "@/lib/supersets";
import { Star } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { BOX_HINT, type SheetBlock, type SheetModel } from "@shared/weight-room-sheet";

export type SheetCellEdit =
  | { kind: "sets"; exerciseId: number; value: string }
  | { kind: "percent"; exerciseId: number; value: string }
  | { kind: "goal" | "rest" | "effort"; exerciseId: number; value: string }
  | { kind: "target"; exerciseId: number; athleteId: number; value: string }
  | { kind: "note"; value: string };

export type SheetBrand = { teamName: string | null; primaryColor: string | null; logoUrl: string | null };

type Props = {
  model: SheetModel;
  brand: SheetBrand;
  onEdit?: (edit: SheetCellEdit) => void;
  /** Lift drag handles, rendered by the editor (dnd-kit), one per block. */
  liftHandle?: (block: SheetBlock, index: number) => ReactNode;
};

const CELL_SELECTOR = "[data-sheet-cell]";
/** Two boxes per set on a one-side lift: left, then right. */
const SIDES = 2;
const sideOf = (i: number) => (i % SIDES === 0 ? "L" : "R");

/** Moves focus to another editable cell: the next or previous in reading order, or the one in the
 * same column on the row above or below. */
function moveFocus(from: HTMLElement, direction: "next" | "prev" | "up" | "down") {
  const root = from.closest("[data-sheet-root]");
  if (!root) return;
  const cells = Array.from(root.querySelectorAll<HTMLElement>(CELL_SELECTOR));
  const at = cells.indexOf(from);
  if (direction === "next" || direction === "prev") {
    cells[at + (direction === "next" ? 1 : -1)]?.focus();
    return;
  }
  const col = from.dataset.col;
  const row = Number(from.dataset.row ?? "0");
  const target = cells.find((c) => c.dataset.col === col && Number(c.dataset.row ?? "0") === row + (direction === "down" ? 1 : -1));
  target?.focus();
}

const NAV_KEYS: Record<string, "next" | "prev" | "up" | "down"> = { ArrowRight: "next", ArrowLeft: "prev", ArrowUp: "up", ArrowDown: "down" };

/** One cell the coach can type into. */
function EditableCell({
  value,
  changed,
  onCommit,
  col,
  row,
  className,
  label,
  bold,
}: {
  value: string;
  changed?: boolean;
  onCommit?: (value: string) => void;
  col: string;
  row: number;
  className?: string;
  label: string;
  bold?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const self = useRef<HTMLButtonElement | null>(null);
  if (!onCommit) return <span className={cn(className, bold && "font-bold")}>{value}</span>;
  const finish = (commit: boolean, move: "next" | "down" | null) => {
    if (commit && draft !== value) onCommit(draft);
    setEditing(false);
    requestAnimationFrame(() => {
      if (!self.current) return;
      if (move) moveFocus(self.current, move);
      else self.current.focus();
    });
  };
  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        className={cn("w-full min-w-[3rem] rounded border border-primary bg-background px-1 py-0.5 text-sm", className)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true, null)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
            requestAnimationFrame(() => self.current?.focus());
          }
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true, "down");
          }
          if (e.key === "Tab") {
            e.preventDefault();
            finish(true, e.shiftKey ? null : "next");
          }
        }}
      />
    );
  }
  return (
    <button
      ref={self}
      type="button"
      data-sheet-cell=""
      data-col={col}
      data-row={row}
      aria-label={`${label}: ${value || "empty"}. Press Enter to edit.`}
      className={cn("relative w-full rounded px-1 py-0.5 text-left hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary", bold && "font-bold", className)}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          setDraft(value);
          setEditing(true);
          return;
        }
        const dir = NAV_KEYS[e.key];
        if (dir) {
          e.preventDefault();
          moveFocus(e.currentTarget, dir);
        }
      }}
    >
      {value || <span className="text-muted-foreground">—</span>}
      {changed && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="changed" data-testid="cell-changed" />}
    </button>
  );
}

function SetBoxes({ block, rpe }: { block: SheetBlock; rpe: SheetModel["rpe"] }) {
  const count = block.sides ? block.sets * SIDES : block.sets;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <td key={`s${i}`} className="h-8 min-w-[2.6rem] border border-foreground/60" />
      ))}
      {rpe === "set" && Array.from({ length: block.sets }, (_, i) => <td key={`r${i}`} className="min-w-[2.2rem] border border-foreground/60" />)}
      {rpe === "lift" && <td className="min-w-[2.2rem] border border-foreground/60" />}
    </>
  );
}

function setHeaders(block: SheetBlock, rpe: SheetModel["rpe"]): string[] {
  const count = block.sides ? block.sets * SIDES : block.sets;
  const sets = Array.from({ length: count }, (_, i) => (block.sides ? `${Math.floor(i / SIDES) + 1} ${sideOf(i)}` : String(i + 1)));
  const rpes = { lift: ["RPE"], set: Array.from({ length: block.sets }, (_, i) => `RPE ${i + 1}`), off: [] as string[] }[rpe];
  return [...sets, ...rpes];
}

function BlockHeader({ model, block, index, onEdit, handle }: { model: SheetModel; block: SheetBlock; index: number; onEdit?: Props["onEdit"]; handle?: ReactNode }) {
  const edit = (kind: "sets" | "percent" | "goal" | "rest" | "effort") => (onEdit ? (value: string) => onEdit({ kind, exerciseId: block.exerciseId, value }) : undefined);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {handle}
      {block.slot && (
        <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-bold", colorForLabel(block.slot))} data-testid="sheet-slot">
          {block.slot}
        </span>
      )}
      <span className="font-semibold">{block.name}</span>
      {block.superset?.first && <span className="text-xs uppercase tracking-wide text-muted-foreground">Superset</span>}
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <EditableCell value={String(block.sets)} changed={block.setsChanged} onCommit={edit("sets")} col={`sets-${index}`} row={0} label={`${block.name} sets`} className="w-10" />
        × {block.reps}
        {block.sides ? " each side" : ""}
        {block.kind !== "load" ? ` (${BOX_HINT[block.kind]})` : ""}
      </span>
      {!block.bodyweight && block.kind === "load" && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          %
          <EditableCell value={block.percent != null ? String(block.percent) : ""} changed={block.percentChanged} onCommit={edit("percent")} col={`pct-${index}`} row={0} label={`${block.name} percent`} className="w-12" />
        </span>
      )}
      {block.effort != null && <EditableCell value={block.effort} changed={block.effortChanged} onCommit={edit("effort")} col={`effort-${index}`} row={0} label={`${block.name} effort`} className="w-auto text-xs" />}
      {block.goal != null && <EditableCell value={block.goal} changed={block.goalChanged} onCommit={edit("goal")} col={`goal-${index}`} row={0} label={`${block.name} goal`} className="w-auto text-xs" />}
      {block.rest != null && (block.rest || !block.superset) && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {block.superset ? "" : "Rest"}
          <EditableCell value={block.rest} changed={block.restChanged} onCommit={edit("rest")} col={`rest-${index}`} row={0} label={`${block.name} rest`} className="w-auto" />
        </span>
      )}
      {block.cues && <p className="w-full text-xs italic text-muted-foreground">{block.cues}</p>}
    </div>
  );
}

function TargetCell({ model, block, row, rowIndex, onEdit, blockIndex }: { model: SheetModel; block: SheetBlock; row: SheetModel["groups"][number]["rows"][number]; rowIndex: number; onEdit?: Props["onEdit"]; blockIndex: number }) {
  const cell = row.cells[blockIndex];
  return (
    <td className="border px-1">
      <div className="flex items-center gap-1">
        <EditableCell
          value={cell.target ?? ""}
          changed={cell.targetChanged}
          bold={model.boldTargets}
          className={model.boldTargets ? "text-base" : "text-sm"}
          col={`target-${blockIndex}`}
          row={rowIndex}
          label={`${row.displayName} ${block.name} target`}
          onCommit={onEdit ? (value) => onEdit({ kind: "target", exerciseId: block.exerciseId, athleteId: row.athleteId, value }) : undefined}
        />
        {cell.pr && <Star className="h-3 w-3 shrink-0 fill-current" aria-label="would be a new best" data-testid="sheet-pr" />}
      </div>
    </td>
  );
}

function TeamView({ model, onEdit, liftHandle }: Props) {
  const showMax = model.layout.toggles.max;
  const showTarget = model.layout.toggles.target;
  return (
    <div className="space-y-6">
      {model.groups.map((group) => (
        <section key={group.label ?? "all"} className="space-y-4">
          {group.label && <h3 className="text-base font-bold">{group.label}</h3>}
          {model.blocks.map((block, bi) => {
            const showLast = group.rows.some((r) => r.cells[bi].last != null);
            const showPlates = group.rows.some((r) => r.cells[bi].plates != null);
            return (
              <div key={block.programExerciseId}>
                {block.textBefore.map((t, i) => (
                  <p key={i} className="mb-2 text-sm font-semibold">{t}</p>
                ))}
                <div className={cn("rounded p-2", block.superset && cn("border-l-4", borderTintForLabel(block.superset.letter)))} data-testid="sheet-block">
                  <BlockHeader model={model} block={block} index={bi} onEdit={onEdit} handle={liftHandle?.(block, bi)} />
                  <table className="mt-2 w-full border-collapse text-sm">
                    <thead className="bg-[var(--sheet-tint)] text-left text-xs">
                      <tr>
                        <th className="border px-1 py-1">Athlete</th>
                        {showMax && <th className="border px-1" data-testid="col-max">Max</th>}
                        {showTarget && <th className="border px-1" data-testid="col-target">Target</th>}
                        {showLast && <th className="border px-1" data-testid="col-last">Last</th>}
                        {showPlates && <th className="border px-1" data-testid="col-plates">Plates</th>}
                        {setHeaders(block, model.rpe).map((h) => (
                          <th key={h} className="border px-1 text-center">{h}</th>
                        ))}
                        {model.customColumns.map((c) => (
                          <th key={c.id} className="border px-1">{c.header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, ri) => (
                        <tr key={row.athleteId}>
                          <td className="whitespace-nowrap border px-1">
                            {row.displayName}
                            {!row.onDay && <span className="ml-1 text-xs text-muted-foreground">(not on this day)</span>}
                          </td>
                          {showMax && <td className="border px-1 text-muted-foreground">{row.cells[bi].max}</td>}
                          {showTarget && <TargetCell model={model} block={block} row={row} rowIndex={ri} onEdit={onEdit} blockIndex={bi} />}
                          {showLast && <td className="border px-1 text-xs">{row.cells[bi].last}</td>}
                          {showPlates && <td className="border px-1 text-xs">{row.cells[bi].plates}</td>}
                          <SetBoxes block={block} rpe={model.rpe} />
                          {model.customColumns.map((c) => (
                            <td key={c.id} className="min-w-[3.5rem] border border-foreground/60" />
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {model.textAfter.map((t, i) => (
            <p key={i} className="text-sm font-semibold">{t}</p>
          ))}
        </section>
      ))}
    </div>
  );
}

function AcrossView({ model, onEdit }: Props) {
  return (
    <div className="space-y-6">
      {[...model.blocks.flatMap((b) => b.textBefore), ...model.textAfter].map((t, i) => (
        <p key={i} className="text-sm font-semibold">{t}</p>
      ))}
      {model.groups.map((group) => (
        <section key={group.label ?? "all"}>
          {group.label && <h3 className="mb-2 text-base font-bold">{group.label}</h3>}
          <table className="border-collapse text-sm">
            <thead className="bg-[var(--sheet-tint)] text-xs">
              <tr>
                <th className="border px-1" />
                {model.blocks.map((block) => (
                  <th
                    key={block.programExerciseId}
                    colSpan={(model.layout.toggles.target ? 1 : 0) + setHeaders(block, model.rpe).length + (group.rows.some((r) => r.cells[model.blocks.indexOf(block)].last != null) ? 1 : 0)}
                    className={cn("border px-1 text-left", block.superset && cn("border-t-4", borderTintForLabel(block.superset.letter)))}
                  >
                    {block.slot && <span className={cn("mr-1 rounded px-1", colorForLabel(block.slot))}>{block.slot}</span>}
                    {block.name}
                  </th>
                ))}
                {model.customColumns.map((c) => (
                  <th key={c.id} rowSpan={2} className="border px-1">{c.header}</th>
                ))}
              </tr>
              <tr>
                <th className="border px-1 text-left">Athlete</th>
                {model.blocks.map((block, bi) => (
                  <Fragment key={block.programExerciseId}>
                    {model.layout.toggles.target && <th className="border px-1">Target</th>}
                    {group.rows.some((r) => r.cells[bi].last != null) && <th className="border px-1">Last</th>}
                    {setHeaders(block, model.rpe).map((h) => (
                      <th key={`${bi}-${h}`} className="border px-1">{h}</th>
                    ))}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row, ri) => (
                <tr key={row.athleteId}>
                  <td className="whitespace-nowrap border px-1">{row.displayName}</td>
                  {model.blocks.map((block, bi) => (
                    <Fragment key={block.programExerciseId}>
                      {model.layout.toggles.target && <TargetCell model={model} block={block} row={row} rowIndex={ri} onEdit={onEdit} blockIndex={bi} />}
                      {group.rows.some((r) => r.cells[bi].last != null) && <td className="border px-1 text-xs">{row.cells[bi].last}</td>}
                      <SetBoxes block={block} rpe={model.rpe} />
                    </Fragment>
                  ))}
                  {model.customColumns.map((c) => (
                    <td key={c.id} className="min-w-[3.5rem] border border-foreground/60" />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function CardsView({ model, onEdit }: Props) {
  const rows = model.groups.flatMap((g) => g.rows.map((row) => ({ row, group: g.label })));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(({ row, group }, ri) => (
        <div key={row.athleteId} className="rounded border border-dashed p-3">
          <p className="font-bold">
            {row.displayName}
            {group ? <span className="ml-1 text-xs font-normal text-muted-foreground">· {group}</span> : null}
          </p>
          {model.blocks.map((block, bi) => (
            <div key={block.programExerciseId} className={cn("mt-2", block.superset && cn("border-l-4 pl-2", borderTintForLabel(block.superset.letter)))}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {block.slot && <span className={cn("rounded px-1 text-xs font-bold", colorForLabel(block.slot))}>{block.slot}</span>}
                <span className="font-medium">{block.name}</span>
                {row.cells[bi].target != null && (
                  <EditableCell
                    value={row.cells[bi].target ?? ""}
                    changed={row.cells[bi].targetChanged}
                    bold={model.boldTargets}
                    col={`target-${bi}`}
                    row={ri}
                    label={`${row.displayName} ${block.name} target`}
                    className="w-auto"
                    onCommit={onEdit ? (value) => onEdit({ kind: "target", exerciseId: block.exerciseId, athleteId: row.athleteId, value }) : undefined}
                  />
                )}
                {row.cells[bi].pr && <Star className="h-3 w-3 fill-current" aria-label="would be a new best" />}
                {row.cells[bi].last && <span className="text-xs text-muted-foreground">last {row.cells[bi].last}</span>}
                {row.cells[bi].plates && <span className="text-xs text-muted-foreground">{row.cells[bi].plates}</span>}
              </div>
              <div className="mt-1 flex gap-1">
                {setHeaders(block, model.rpe).map((h) => (
                  <div key={h} className="h-7 w-10 border border-foreground/60 text-[10px] text-muted-foreground">{h}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The whole sheet as the coach will print it. */
export function WeightRoomSheetPreview(props: Props) {
  const { model, brand, onEdit } = props;
  const primary = brand.primaryColor || "#F65B23";
  const views = { team: TeamView, across: AcrossView, cards: CardsView };
  const View = views[model.layout.view];
  return (
    <div className="overflow-x-auto rounded-md border bg-white text-neutral-800" data-sheet-root="" style={{ ["--sheet-tint" as string]: `color-mix(in srgb, ${primary} 15%, white)` }}>
      <div className="min-w-[640px]">
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: primary, color: "white" }}>
          {brand.logoUrl && <img src={brand.logoUrl} alt="" className="h-10 w-10 object-contain" />}
          <div>
            <p className="text-lg font-bold leading-tight">{brand.teamName || "FORGE"}</p>
            <p className="text-xs opacity-90">Weight-room sheet · {model.date}</p>
            {brand.teamName && <p className="text-[10px] opacity-80">Powered by Forge</p>}
          </div>
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pt-3">
          <div className="space-y-0.5 text-sm">
            <p className="font-semibold">
              {model.dayTitle} · {model.programName}
            </p>
            <p className="text-xs text-neutral-500">
              {model.teamName} · {model.date} · Coach {model.coachName}
            </p>
            {model.phaseLine && (
              <p className="text-xs text-neutral-500" data-testid="sheet-phase">
                {model.phaseLine}
                {model.lighterWeek ? " · lighter week" : ""}
              </p>
            )}
            {model.warmup && <p className="text-xs" data-testid="sheet-warmup">Warm-up: {model.warmup.join(", ")}</p>}
            {model.note != null && (
              <div className="flex items-center gap-1 text-xs font-semibold" data-testid="sheet-note">
                Note:
                <EditableCell value={model.note} col="note" row={0} label="Note line" className="min-w-[12rem]" onCommit={onEdit ? (value) => onEdit({ kind: "note", value }) : undefined} />
              </div>
            )}
          </div>
          {model.qrUrl && <QRCodeSVG value={model.qrUrl} size={56} data-testid="sheet-qr" />}
        </div>
        <div className="p-4">
          <View {...props} />
        </div>
        {model.coachNotes && (
          <div className="mx-4 mb-3 h-14 rounded border p-1 text-[10px] text-neutral-500" data-testid="sheet-coach-notes">
            Coach notes
          </div>
        )}
        <div className="flex justify-between px-4 pb-3 text-[10px] text-neutral-500">
          <span>{brand.teamName ? `Generated by ${brand.teamName} via Forge` : "Generated by Forge"}</span>
          {model.code && <span className="font-mono font-bold text-neutral-800" data-testid="sheet-code">{model.code}</span>}
        </div>
      </div>
    </div>
  );
}
