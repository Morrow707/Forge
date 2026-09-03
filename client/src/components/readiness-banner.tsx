import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { X } from "lucide-react";

function dismissKey(date: string) {
  return `forge:readiness-banner-dismissed:${date}`;
}

/** Renders nothing until there's something real to show -- AI not
 * configured, or no wellness check-in yet for this date, both come back as
 * a null briefing and this quietly disappears rather than showing an empty
 * state. Its own query so a slow/failed AI call never blocks the workout
 * day page around it from rendering.
 *
 * "Coach's Brief" -- a magazine-pull-quote treatment (display type, left
 * accent rule). Dismissible per date (localStorage, not the server) rather
 * than permanently -- tomorrow's briefing is different content and should
 * still show. */
export function ReadinessBanner({ date }: { date: string }) {
  const { data } = useQuery<{ briefing: string } | null>({
    queryKey: ["/api/athlete/readiness", date],
    queryFn: () => getJson(`/api/athlete/readiness?date=${date}`),
    staleTime: Infinity,
  });
  const [dismissed, setDismissed] = useState(
    () => window.localStorage.getItem(dismissKey(date)) === "1",
  );

  if (!data?.briefing || dismissed) return null;

  return (
    <div className="relative rounded-lg border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 pr-10">
      <button
        type="button"
        aria-label="Dismiss Coach's Brief"
        onClick={() => {
          window.localStorage.setItem(dismissKey(date), "1");
          setDismissed(true);
        }}
        className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
        Coach's Brief
      </p>
      <p className="mt-2 border-l-2 border-primary/50 pl-3 font-display text-lg font-semibold leading-snug tracking-wide text-foreground sm:text-xl">
        {data.briefing}
      </p>
    </div>
  );
}
