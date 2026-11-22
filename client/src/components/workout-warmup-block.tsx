/**
 * THE WARM-UP ON THE WORKOUT SCREEN (2026-11-22). The day's warm-up block, shown FIRST, before the
 * first exercise: each drill with its prescription, collapsible, and ONE "Warm-up done" tick for
 * the whole block (never per drill). The tick is a fact about the day: the workout screen saves it
 * with the day through its ordinary autosave (workoutLogs' revision rule applies to it like every
 * other edit), and it never stands in front of the main work: nothing below waits on it.
 */
import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { estimateWarmupMinutes, warmupItemPrescription, type ResolvedWarmupBlock } from "@shared/program-day-warmup";
import { useT } from "@/i18n";

export function WorkoutWarmupBlock({
  warmup,
  done,
  onToggleDone,
}: {
  warmup: ResolvedWarmupBlock;
  done: boolean;
  onToggleDone: (done: boolean) => void;
}) {
  const t = useT();
  // Open until it is done; a done warm-up folds away so the main work is what the screen shows.
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const open = openChoice ?? !done;
  const items = warmup.items.filter((i) => i.exercise);
  const minutes = estimateWarmupMinutes(items);
  return (
    <section
      className={cn("rounded-md border border-l-4 p-3", done ? "border-emerald-600/40 bg-emerald-500/5" : "border-orange-500/40 bg-orange-500/5")}
      data-testid="workout-warmup"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpenChoice(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          data-testid="button-toggle-warmup"
        >
          <Flame className="h-4 w-4 shrink-0 text-orange-500" />
          <span className="font-semibold">{t("Warm-up")}</span>
          <span className="text-xs text-muted-foreground">
            {t.plural(items.length, "{count} drill, about {minutes} min", "{count} drills, about {minutes} min", { minutes })}
          </span>
          {open ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {warmup.note && <p className="text-xs text-muted-foreground">{warmup.note}</p>}
          <ol className="space-y-1">
            {items.map((item, i) => (
              <li key={`${item.exerciseId}-${i}`} className="flex items-baseline justify-between gap-2 text-sm" data-testid={`workout-warmup-item-${i}`}>
                <span className="min-w-0">
                  <span className="font-medium">{item.exercise?.name}</span>
                  {item.note && <span className="block text-xs text-muted-foreground">{item.note}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{warmupItemPrescription(item)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <button
        type="button"
        onClick={() => onToggleDone(!done)}
        aria-pressed={done}
        className={cn(
          "mt-2 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
          done ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-emerald-600",
        )}
        data-testid="button-warmup-done"
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        {t("Warm-up done")}
      </button>
    </section>
  );
}
