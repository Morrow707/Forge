/**
 * THE ASSIGN DIALOG'S EQUIPMENT WARNING (2026-11-21). When the athletes a program is going to
 * train in a room that is missing what some of its exercises need, this names the days and the
 * exercises, and offers "Suggest swaps": the existing swap logic, narrowed to what those rooms can
 * do, proposes a replacement for each one, and nothing changes until the coach taps Apply. It never
 * stops the assignment (a coach may know the gym better than the checklist does).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { ReadFailed } from "@/components/read-failed";

type Gap = { weekNumber: number; dayNumber: number; dayTitle: string; exercises: { programExerciseId: number; name: string; missing: string[] }[] };
type Suggestion = { programExerciseId: number; dayTitle: string; from: { id: number; name: string }; missing: string[]; to: { id: number; name: string } | null; reason: string | null };

export function EquipmentGapNotice({ programId, athleteIds }: { programId: number | null; athleteIds: number[] }) {
  const qc = useQueryClient();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const key = ["equipment-check", programId, [...athleteIds].sort((a, b) => a - b).join(",")];
  const { data, isError, refetch } = useQuery<{ hasProfile: boolean; canSwap: boolean; days: Gap[] }>({
    queryKey: key,
    enabled: programId != null && athleteIds.length > 0,
    queryFn: async () => (await apiRequest("POST", `/api/coach/programs/${programId}/equipment-check`, { athleteIds })).json(),
  });
  const suggest = useMutation({
    mutationFn: async () =>
      (await (await apiRequest("POST", `/api/coach/programs/${programId}/equipment-swaps`, { athleteIds })).json()) as { suggestions: Suggestion[] },
    onSuccess: (r) => setSuggestions(r.suggestions),
    onError: (err: ApiError) => toast.error(err.message || "Couldn't suggest swaps"),
  });
  const apply = useMutation({
    mutationFn: async (swaps: { programExerciseId: number; exerciseId: number }[]) =>
      apiRequest("POST", `/api/coach/programs/${programId}/equipment-swaps/apply`, { swaps }),
    onSuccess: () => {
      setSuggestions(null);
      qc.invalidateQueries({ queryKey: ["equipment-check"] });
      qc.invalidateQueries({ queryKey: [`/api/coach/programs/${programId}`] });
      toast.success("Swapped. The program now fits these rooms.");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't apply the swaps"),
  });

  // A failed check is said, never shown as "nothing missing".
  if (isError) return <ReadFailed what="this program's equipment check" onRetry={() => void refetch()} />;
  if (!data || data.days.length === 0) return null;
  const applicable = (suggestions ?? []).filter((s) => s.to);
  return (
    <div className="space-y-2 rounded-md border border-amber-400/50 bg-amber-400/5 p-3 text-sm" data-testid="equipment-gap-notice">
      <p className="flex items-center gap-1.5 font-medium text-amber-500">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Some exercises need equipment these athletes' weight room hasn't listed
      </p>
      <ul className="space-y-1 text-xs">
        {data.days.map((d) => (
          <li key={`${d.weekNumber}-${d.dayNumber}`}>
            <span className="font-medium">
              Week {d.weekNumber}, {d.dayTitle}:
            </span>{" "}
            {d.exercises.map((e) => `${e.name} (needs ${e.missing.join(" and ")})`).join("; ")}
          </li>
        ))}
      </ul>
      {data.canSwap ? (
        !suggestions && (
          <Button type="button" size="sm" variant="outline" disabled={suggest.isPending} onClick={() => suggest.mutate()} data-testid="button-suggest-swaps">
            {suggest.isPending ? "Finding swaps..." : "Suggest swaps"}
          </Button>
        )
      ) : (
        <p className="text-xs text-muted-foreground">This is a Forge program. Duplicate it to swap exercises in your own copy.</p>
      )}
      {suggestions && (
        <div className="space-y-1.5" data-testid="equipment-swap-suggestions">
          {suggestions.map((s) => (
            <p key={s.programExerciseId} className="text-xs">
              {s.dayTitle}: {s.from.name} {s.to ? <>&rarr; <span className="font-medium">{s.to.name}</span></> : "(no good swap in this room)"}
            </p>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={apply.isPending || applicable.length === 0}
              onClick={() => apply.mutate(applicable.map((s) => ({ programExerciseId: s.programExerciseId, exerciseId: s.to!.id })))}
              data-testid="button-apply-swaps"
            >
              Apply {applicable.length} swap{applicable.length === 1 ? "" : "s"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestions(null)}>
              Keep as is
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
