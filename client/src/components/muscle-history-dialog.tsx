import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReadFailed } from "@/components/read-failed";
import { getJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { MOVEMENT_FOR_GROUP } from "@shared/strength-score";
import { convertWeight, formatWeight, type WeightUnit } from "@shared/weight-units";

export type MuscleHistoryRow = {
  date: string;
  exerciseName: string;
  /** Normalised to pounds for comparison, the same column the score is computed from. */
  weightLbs: number;
  /** What was actually typed, in the unit it was typed in. */
  loggedWeight: number;
  loggedUnit: WeightUnit;
  reps: number;
  setNumber: number;
  countsTowardScore: boolean;
  isBest: boolean;
};

/** Inclusive floors, resolved at render so "this year" never goes stale in a cached bundle. */
const WINDOWS = [
  { id: "90d", label: "Last 90 days", since: () => isoDaysAgo(90) },
  { id: "year", label: "This year", since: () => `${new Date().getFullYear()}-01-01` },
  { id: "all", label: "All time", since: () => undefined },
] as const;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

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
 * a rule; leaving it unsaid turns it into lost data -- and the empty state links straight into
 * the library filtered to this muscle, so "nothing here" comes with somewhere to go.
 *
 * THE UNIT IS THE READER'S, NOT THE DATABASE'S. Scott, 2026-09-21: "if they want to see kg let
 * them see kilos, even if the other athletes put it in lbs." A set shown in the unit it was
 * logged in prints the athlete's own number untouched; only a set crossing units is converted.
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
  const { user } = useAuth();
  const [unit, setUnit] = useState<WeightUnit>(user?.preferredWeightUnit ?? "lbs");
  const [windowId, setWindowId] = useState<(typeof WINDOWS)[number]["id"]>("all");

  const since = useMemo(
    () => WINDOWS.find((w) => w.id === windowId)?.since(),
    [windowId],
  );

  const query = group
    ? `${fetchUrl}?group=${encodeURIComponent(group)}${since ? `&since=${since}` : ""}`
    : null;
  const { data, isLoading, isError, refetch } = useQuery<MuscleHistoryRow[]>({
    queryKey: [query],
    queryFn: () => getJson(query!),
    enabled: query != null,
  });

  const movement = group ? MOVEMENT_FOR_GROUP[group] ?? group : "";
  // The coach reads the same sheet from their roster page, and the library they can open is
  // theirs, not the athlete's. Derived from the URL that fetched the data rather than a prop,
  // for the same reason that URL is itself derived.
  const libraryBase = fetchUrl.startsWith("/api/coach") ? "/coach/exercises" : "/athlete/exercises";

  return (
    <Dialog open={group != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="capitalize">{movement}</DialogTitle>
          <DialogDescription>
            Logged sets on Forge exercises for this area. Hand-logged weight and reps only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWindowId(w.id)}
                aria-pressed={windowId === w.id}
                className={cn(
                  "px-2.5 py-1",
                  windowId === w.id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            {(["lbs", "kg"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={cn(
                  "px-2.5 py-1",
                  unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {isError ? (
          <ReadFailed what="this lift history" onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="h-24 w-full animate-pulse rounded-lg bg-surface" />
        ) : !data || data.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {windowId === "all"
                ? "Nothing logged here yet on a Forge exercise. Exercises your coach created aren't included, so this stays comparable with your strength profile."
                : "Nothing in this window. Try All time."}
            </p>
            {windowId === "all" && group && (
              <Link
                href={`${libraryBase}?muscle=${encodeURIComponent(group)}`}
                className="inline-block text-sm text-primary underline underline-offset-4"
                onClick={onClose}
              >
                Find Forge exercises for this
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((r, i) => {
              // No conversion at all when the reader's unit is the one it was logged in --
              // that prints exactly what was typed, rather than a round trip through pounds.
              const shown =
                r.loggedUnit === unit
                  ? r.loggedWeight
                  : convertWeight(r.weightLbs, "lbs", unit);
              return (
                <li
                  key={`${r.date}-${r.exerciseName}-${r.setNumber}-${i}`}
                  className="flex items-center gap-3 py-2"
                >
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
                    {r.reps} × {formatWeight(shown, unit)}
                  </span>
                </li>
              );
            })}
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
