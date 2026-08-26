import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";

/** Renders nothing until there's something real to show -- AI not
 * configured, or no wellness check-in yet for this date, both come back as
 * a null briefing and this quietly disappears rather than showing an empty
 * state. Its own query so a slow/failed AI call never blocks the workout
 * day page around it from rendering.
 *
 * "Coach's Brief" -- a magazine-pull-quote treatment (display type, left
 * accent rule) rather than a generic info-banner look, since this is meant
 * to read as the one headline for the day, not a dismissible tip. */
export function ReadinessBanner({ date }: { date: string }) {
  const { data } = useQuery<{ briefing: string } | null>({
    queryKey: ["/api/athlete/readiness", date],
    queryFn: () => getJson(`/api/athlete/readiness?date=${date}`),
    staleTime: Infinity,
  });

  if (!data?.briefing) return null;

  return (
    <div className="rounded-lg border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
        Coach's Brief
      </p>
      <p className="mt-2 border-l-2 border-primary/50 pl-3 font-display text-lg font-semibold leading-snug tracking-wide text-foreground sm:text-xl">
        {data.briefing}
      </p>
    </div>
  );
}
