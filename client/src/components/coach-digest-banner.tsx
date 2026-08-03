import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

/** Renders nothing until a digest exists for this week -- no roster
 * activity yet, or AI not configured, both come back null. Its own query so
 * a slow/failed AI call never blocks the rest of the dashboard. */
export function CoachDigestBanner() {
  const { data } = useQuery<{ digest: string } | null>({
    queryKey: ["/api/coach/digest"],
    queryFn: () => getJson("/api/coach/digest"),
    staleTime: Infinity,
  });

  if (!data?.digest) return null;

  return (
    <Card className="shrink-0 border-primary/30 bg-primary/5">
      <CardContent className="flex items-start gap-3 p-3 md:p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
            Your Weekly Roster Summary
          </p>
          <p className="mt-1 text-sm text-foreground">{data.digest}</p>
        </div>
      </CardContent>
    </Card>
  );
}
