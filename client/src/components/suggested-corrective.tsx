import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { Wrench } from "lucide-react";

type CorrectiveSuggestion = { id: number; name: string; muscleGroup: string };

/** Shown under a flagged fault on the sprint/mechanics tracker review screen
 * -- looks up an existing corrective from the athlete's coach (or Forge's
 * official bank) that's a keyword match for the fault, via a hand-written
 * lookup since there's no fault-code taxonomy on the exercises table (see
 * FAULT_CORRECTIVE_KEYWORDS in shared/fault-correctives.ts). Renders
 * nothing if no match is found, so it never implies a suggestion exists
 * when one doesn't. */
export function SuggestedCorrective({ faultCode }: { faultCode: string }) {
  const { data: suggestions = [], isError, refetch } = useQuery<CorrectiveSuggestion[]>({
    queryKey: ["/api/athlete/suggested-correctives", faultCode],
    queryFn: () => getJson(`/api/athlete/suggested-correctives?faultCode=${faultCode}`),
  });

  // Rendering nothing on a FAILED read would say the same thing as rendering nothing on an
  // empty one -- that no corrective matches this fault. The comment above promises this
  // component never implies a suggestion exists when one does not; the converse matters too,
  // because the athlete is looking at a flagged fault and deciding what to do about it. One
  // line, in place, rather than a box: this sits under a fault on a review screen.
  if (isError) {
    return (
      <button
        type="button"
        onClick={() => void refetch()}
        className="ml-6 flex items-center gap-1.5 text-xs text-muted-foreground underline"
      >
        <Wrench className="h-3 w-3 shrink-0" />
        We couldn't check for a corrective. Try again.
      </button>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <p className="ml-6 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Wrench className="h-3 w-3 shrink-0" />
      Suggested corrective: {suggestions.map((s) => s.name).join(", ")}
    </p>
  );
}
