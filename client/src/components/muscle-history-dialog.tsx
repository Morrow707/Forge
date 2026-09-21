import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReadFailed } from "@/components/read-failed";
import { getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { MOVEMENT_FOR_GROUP } from "@shared/strength-score";

export type MuscleHistoryRow = {
  date: string;
  exerciseName: string;
  weightLbs: number;
  reps: number;
  setNumber: number;
  countsTowardScore: boolean;
  isBest: boolean;
};

/**
 * WHAT WAS ACTUALLY LIFTED FOR ONE MUSCLE GROUP -- opened by tapping that muscle on the body map.
 *
 * Deliberately thin: date, lift, reps x weight. Scott, 2026-09-21: "nothing major nothing in
 * depth just when they did it, what lift it was, what the rep and weight scheme was, that's it."
 * Anything richer belongs on the per-exercise history page, which already exists.
 *
 * THE FORGE-ONLY RULE IS STATED ON SCREEN, not left to be inferred. The list is drawn from the
 * same Forge-official population as the percentile above it (it has to be, or the history would
 * show a heavier lift than the score was computed from and the number would read as broken), so
 * an athlete's coach-created accessory work is missing from it. Saying why turns an absence into
 * a rule; leaving it unsaid turns it into lost data.
 */
export function MuscleHistoryDialog({
  group,
  fetchUrl,
  onClose,
}: {
  group: string | null;
  /** Base URL without the query string -- athlete's own, or the coach's roster-scoped read. */
  fetchUrl: string;
  onClose: () => void;
}) {
  const query = group ? `${fetchUrl}?group=${encodeURIComponent(group)}` : null;
  const { data, isLoading, isError, refetch } = useQuery<MuscleHistoryRow[]>({
    queryKey: [query],
    queryFn: () => getJson(query!),
    enabled: query != null,
  });

  const movement = group ? MOVEMENT_FOR_GROUP[group] ?? group : "";

  return (
    <Dialog open={group != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="capitalize">{movement}</DialogTitle>
          <DialogDescription>
            Your logged sets on Forge exercises for this area. Hand-logged weight and reps only.
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <ReadFailed what="this lift history" onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="h-24 w-full animate-pulse rounded-lg bg-surface" />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing logged here yet on a Forge exercise. Exercises your coach created aren't
            included, so this stays comparable with your strength profile.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((r, i) => (
              <li key={`${r.date}-${r.exerciseName}-${r.setNumber}-${i}`} className="flex items-center gap-3 py-2">
                <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {r.date}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{r.exerciseName}</span>
                <span
                  className={cn(
                    "shrink-0 text-sm tabular-nums",
                    r.isBest ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {r.reps} x {r.weightLbs} lbs
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Forge exercises only — the same set your strength profile is scored from, so the two
          always agree.
        </p>
      </DialogContent>
    </Dialog>
  );
}
