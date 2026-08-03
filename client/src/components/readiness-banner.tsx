import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { Sparkles } from "lucide-react";

/** Renders nothing until there's something real to show -- AI not
 * configured, or no wellness check-in yet for this date, both come back as
 * a null briefing and this quietly disappears rather than showing an empty
 * state. Its own query so a slow/failed AI call never blocks the workout
 * day page around it from rendering. */
export function ReadinessBanner({ date }: { date: string }) {
  const { data } = useQuery<{ briefing: string } | null>({
    queryKey: ["/api/athlete/readiness", date],
    queryFn: () => getJson(`/api/athlete/readiness?date=${date}`),
    staleTime: Infinity,
  });

  if (!data?.briefing) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          AI Readiness Coach
        </p>
        <p className="text-sm text-foreground">{data.briefing}</p>
      </div>
    </div>
  );
}
