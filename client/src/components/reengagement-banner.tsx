import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getJson } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BellRing, Check, X } from "lucide-react";

interface InactiveAthlete {
  id: number;
  name: string;
  email: string;
  daysSinceActive: number | null;
}

const DISMISS_KEY = "forge-coach-reengagement-dismissed";

/** Renders nothing once the roster has no one stale -- most coaches on most
 * days should never see this. Nudges are one-tap and fire-and-forget; we
 * don't track whether an athlete acts on one, just that the coach reached
 * out, so a sent nudge only disables itself locally for this session.
 * Dismissal is keyed on the sorted set of athlete IDs currently shown, not
 * just "dismissed today" -- clearing it frees up space immediately, but as
 * soon as that set changes (someone new goes quiet, or drops off the list)
 * it pops back up since that's new information. */
export function ReengagementBanner() {
  const [sentIds, setSentIds] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY));

  const { data } = useQuery<InactiveAthlete[]>({
    queryKey: ["/api/coach/inactive-athletes"],
    queryFn: () => getJson("/api/coach/inactive-athletes"),
    staleTime: 5 * 60 * 1000,
  });

  const nudgeMutation = useMutation({
    mutationFn: async (athleteId: number) =>
      apiRequest("POST", `/api/coach/roster/${athleteId}/nudge`),
    onSuccess: (_data, athleteId) => {
      setSentIds((prev) => new Set(prev).add(athleteId));
      toast.success("Nudge sent");
    },
    onError: () => {
      toast.error("Couldn't send nudge");
    },
  });

  if (!data || data.length === 0) return null;

  const currentKey = [...data]
    .map((a) => a.id)
    .sort((a, b) => a - b)
    .join(",");
  if (currentKey === dismissed) return null;

  return (
    <Card className="shrink-0 border-primary/30 bg-primary/5">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                Athletes Haven't Logged a Workout Recently
              </p>
              <Button
                size="icon"
                variant="ghost"
                className="-mr-1.5 -mt-1.5 h-6 w-6 shrink-0"
                aria-label="Dismiss"
                onClick={() => {
                  localStorage.setItem(DISMISS_KEY, currentKey);
                  setDismissed(currentKey);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {data.map((athlete) => {
                const sent = sentIds.has(athlete.id);
                return (
                  <div
                    key={athlete.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{athlete.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {athlete.daysSinceActive == null
                          ? "No activity on record"
                          : `${athlete.daysSinceActive} day${athlete.daysSinceActive === 1 ? "" : "s"} inactive`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={sent ? "outline" : "default"}
                      disabled={sent || nudgeMutation.isPending}
                      onClick={() => nudgeMutation.mutate(athlete.id)}
                      data-testid={`button-nudge-${athlete.id}`}
                    >
                      {sent ? (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5" /> Sent
                        </>
                      ) : (
                        "Send Nudge"
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
