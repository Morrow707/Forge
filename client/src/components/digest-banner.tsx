import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

/** Renders nothing until a digest actually exists for this week -- no
 * workouts logged yet, or AI not configured, both come back null and this
 * quietly disappears. Its own query so a slow/failed AI call never blocks
 * the rest of the progress page. */
export function DigestBanner() {
  const { data } = useQuery<{ digest: string } | null>({
    queryKey: ["/api/athlete/digest"],
    queryFn: () => getJson("/api/athlete/digest"),
    staleTime: Infinity,
  });

  if (!data?.digest) return null;

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="flex items-start gap-3 p-5">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
            Your Weekly Training Summary
          </p>
          <p className="mt-1 text-sm text-foreground">{data.digest}</p>
        </div>
      </CardContent>
    </Card>
  );
}
