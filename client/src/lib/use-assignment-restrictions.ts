/**
 * The clinician's restrictions on a return-to-training assignment (2026-11-22), as the one line the
 * day screens show under every exercise through CautionNote's `extraNote`. Null when the
 * assignment has none, while the answer is loading, and when the read fails: a missing note is
 * the same as before this build, never a blank error on the workout card.
 *
 * One route for every role (/api/assignments/:id/restrictions), which answers only for the
 * athlete on the assignment and a coach in scope. Shared by the workout card (and any later day
 * surface) so the wording comes from one place, shared/season-plan.ts.
 */
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";

const FIVE_MINUTES_MS = 300_000;

export function useAssignmentRestrictionNote(assignmentId: number | string | null | undefined): string | null {
  const id = Number(assignmentId);
  const enabled = Number.isInteger(id) && id > 0;
  const { data } = useQuery<{ restrictions: string | null; line: string | null }>({
    queryKey: ["/api/assignments", id, "restrictions"],
    queryFn: () => getJson(`/api/assignments/${id}/restrictions`),
    enabled,
    staleTime: FIVE_MINUTES_MS,
    retry: false,
  });
  return enabled ? data?.line ?? null : null;
}
