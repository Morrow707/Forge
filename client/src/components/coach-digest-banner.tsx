import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";

const DISMISS_KEY = "forge-coach-digest-dismissed";

/** Renders nothing until a digest exists for this week -- no roster
 * activity yet, or AI not configured, both come back null. Its own query so
 * a slow/failed AI call never blocks the rest of the dashboard. Dismissal is
 * keyed on the digest's own text, not just "dismissed today" -- so clearing
 * it frees up space immediately, but a genuinely new digest (next week, or
 * after enough roster activity to regenerate one) still pops back up. */
export function CoachDigestBanner() {
  const { data } = useQuery<{ digest: string } | null>({
    queryKey: ["/api/coach/digest"],
    queryFn: () => getJson("/api/coach/digest"),
    staleTime: Infinity,
  });
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY));

  if (!data?.digest || data.digest === dismissed) return null;

  return (
    <Card className="shrink-0 border-primary/30 bg-primary/5">
      <CardContent className="flex items-start gap-3 p-3 md:p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
            Your Weekly Roster Summary
          </p>
          <p className="mt-1 text-sm text-foreground">{data.digest}</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="-mr-1.5 -mt-1.5 shrink-0"
          aria-label="Dismiss weekly summary"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, data.digest);
            setDismissed(data.digest);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
