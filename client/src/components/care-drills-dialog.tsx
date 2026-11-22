/**
 * "Add care drills" on a program builder day (2026-11-22, shared/care-drills.ts).
 *
 * Shows two to four joint-care drills from the library chosen for this day's joints and the
 * program's sport and positions. The coach ticks the ones to keep and taps Add; Dismiss adds
 * nothing. Nothing reaches the day without that tap, and each drill added is an ordinary row the
 * coach can edit or remove like any other.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartPulse } from "lucide-react";
import type { Exercise } from "@shared/schema";
import { suggestCareDrills, type CareDayExercise, type CareProgramContext } from "@shared/care-drills";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReadFailed } from "@/components/read-failed";
import { CautionNote, ExerciseTagChips } from "@/components/exercise-tags";
import { useT } from "@/i18n";

export function CareDrillsDialog({
  apiBase,
  open,
  onOpenChange,
  day,
  program,
  onAccept,
}: {
  apiBase: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: CareDayExercise[];
  program: CareProgramContext;
  onAccept: (chosen: Exercise[]) => void;
}) {
  const t = useT();
  // The same list (and cache entry) the exercise picker reads.
  const { data: library = [], isLoading, isError, refetch } = useQuery<Exercise[]>({
    queryKey: [`${apiBase}/exercises`],
    enabled: open,
  });
  const result = useMemo(() => suggestCareDrills(day, library, program), [day, library, program]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // Every suggestion starts ticked each time the dialog opens; the coach unticks what they do not want.
  const suggestionKey = result.suggestions.map((s) => s.exercise.id).join(",");
  useEffect(() => {
    if (open) setPicked(new Set(result.suggestions.map((s) => s.exercise.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestionKey]);

  const chosen = result.suggestions.filter((s) => picked.has(s.exercise.id)).map((s) => s.exercise);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4" />
            {t("Care drills for this day")}
          </DialogTitle>
        </DialogHeader>
        {isError && <ReadFailed what={t("the exercise library")} onRetry={() => void refetch()} />}
        {!isError && isLoading && <p className="text-sm text-muted-foreground">{t("Loading the library…")}</p>}
        {!isError && !isLoading && result.noneTagged && (
          <p className="text-sm text-muted-foreground" data-testid="text-no-care-drills">
            {t("No care drills tagged yet. Tag an exercise as \"Joint care\" in the exercise library and it will be suggested here.")}
          </p>
        )}
        {!isError && !isLoading && !result.noneTagged && result.suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("Every care drill in the library is already on this day.")}</p>
        )}
        {!isError && !isLoading && result.suggestions.length > 0 && (
          <div className="space-y-2" data-testid="care-drill-suggestions">
            <p className="text-xs text-muted-foreground">{t("Suggestions only. Untick any you do not want; nothing is added until you tap Add.")}</p>
            {result.suggestions.map((s) => (
              <label
                key={s.exercise.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2"
                data-testid={`care-suggestion-${s.exercise.id}`}
              >
                <Checkbox
                  checked={picked.has(s.exercise.id)}
                  onCheckedChange={(c) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (c === true) next.add(s.exercise.id);
                      else next.delete(s.exercise.id);
                      return next;
                    })
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{s.exercise.name}</p>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                  <ExerciseTagChips exercise={s.exercise} className="mt-1" />
                  <CautionNote note={s.exercise.cautionNote} className="mt-1" />
                </div>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-dismiss-care-drills">
            {t("Dismiss")}
          </Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => {
              onAccept(chosen);
              onOpenChange(false);
            }}
            data-testid="button-accept-care-drills"
          >
            {chosen.length > 0 ? t("Add {count} to this day", { count: chosen.length }) : t("Add to this day")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
