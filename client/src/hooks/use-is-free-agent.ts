import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

/** Whether the signed-in athlete is a Free Agent -- on nobody's roster.
 *
 * Every AI call an athlete can make is Free Agent only (see
 * requireFreeAgent in server/routes.ts), so this is what decides whether an
 * AI control is offered at all. It has to be an account-level fact: the
 * server asks "does this athlete have any coach", so a per-program or
 * per-day notion of "no coach in the loop here" disagrees with it for a
 * coached athlete's self-assigned program, and the athlete gets offered a
 * button that answers 403.
 *
 * `undefined` while the answer isn't known yet -- callers should treat that
 * as "not yet", not as "no", so an AI control never flickers into view for
 * a coached athlete during the first load.
 */
export function useIsFreeAgent(): boolean | undefined {
  const { user } = useAuth();
  const { data: coaches } = useQuery<{ id: number }[]>({
    queryKey: ["/api/athlete/coaches"],
    enabled: user?.role === "athlete",
  });
  if (user?.role !== "athlete") return false;
  if (!coaches) return undefined;
  return coaches.length === 0;
}
