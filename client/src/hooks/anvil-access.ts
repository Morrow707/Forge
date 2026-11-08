import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { anvilRoutesFor } from "@shared/anvil-routes";
import type { AnvilRefusal } from "@shared/anvil-eligibility";

/**
 * MAY THIS PERSON TAKE THE ANVIL -- ASKED, NEVER RE-DERIVED.
 *
 * The same rule `useCameraAccess` follows, for the same reason: the gate has five branches
 * (role, missing birthday, minor, opted out, no agreement) and two copies of it would drift
 * silently, with the drift visible only to the person it strands. The server answers from
 * `anvilEligibility`, which is the one place that decision lives.
 *
 * `undefined` while the answer has not arrived, and every caller must require an explicit
 * `true`. Defaulting to yes flashes a Start button at somebody who cannot press it; defaulting
 * to no flashes its absence at somebody who can.
 */
export type AnvilAccess =
  | { allowed: true; reason: "adult_with_consent"; agreementStale: boolean }
  | { allowed: false; reason: AnvilRefusal; says: string; agreementStale: boolean };

export function useAnvilAccess() {
  const { user } = useAuth();
  // ASKED ONLY FOR A ROLE THAT COULD BE ANSWERED YES. `requireRole` refuses a guardian before
  // the gate is reached, and this hook is called from AppShell -- so without this a guardian
  // would spend a 403 on every page they open to learn something the route map already says.
  const couldTakeIt = anvilRoutesFor(user?.role ?? "") != null;
  const { data, isLoading, isError } = useQuery<AnvilAccess>({
    queryKey: ["/api/anvil/access"],
    queryFn: () => getJson("/api/anvil/access"),
    enabled: couldTakeIt,
    // The answer moves when somebody accepts the agreement, which invalidates this key, and
    // otherwise only when an admin edits their row. Refetching it on every navigation would be
    // a request per screen for an answer that changes once.
    staleTime: 5 * 60 * 1000,
    // A refusal is an ANSWER rather than a fault, so retrying it spends requests to learn the
    // same thing three times.
    retry: false,
  });
  return {
    access: data,
    /** Not yet known. Treat as "not yet", never as "no" -- useIsFreeAgent's own rule. */
    loading: couldTakeIt && isLoading,
    /**
     * The request itself failed. SEPARATE from `allowed: false`, because a refusal with a
     * sentence and a read that did not land are different things to put on a screen: the first
     * is the answer and the second is "try again". The family this repo has now fixed on six
     * surfaces.
     */
    failed: isError,
  };
}
