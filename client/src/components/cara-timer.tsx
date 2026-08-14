import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getJson, apiRequest } from "@/lib/queryClient";
import { Timer } from "lucide-react";

type CaraStatus = {
  tracking: boolean;
  open: { id: number; startedAt: string; lastActivityAt: string } | null;
  idlePromptMinutes: number;
  weeklyMinutes: number;
  capMinutes: number;
} | null;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Server-authoritative CARA (NCAA countable-athletically-related-activity)
 * session timer -- invisible for any athlete whose coach hasn't opted into
 * compliance tracking. The displayed number is purely a live view of
 * `startedAt` on the server; nothing here "is" the timer, so closing the
 * tab, losing signal, or force-quitting never loses time or resets it.
 * Idle detection (the "still working out?" prompt) is the safety net for
 * the one thing the server can't see on its own -- an athlete who
 * genuinely stopped and forgot to say so. */
export function CaraTimer() {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  // Keyed on the server's lastActivityAt value (not the session id) so a
  // dismissal only suppresses the prompt until the NEXT genuinely new idle
  // episode -- lastActivityAt itself advances on every real activity signal
  // (confirming here, or the server bumping it on any non-completion save
  // while a session is open), so once it does, this dismissal no longer
  // matches and a later idle stretch in the same still-open session
  // correctly re-prompts instead of staying silently suppressed for good.
  const [promptDismissedForActivity, setPromptDismissedForActivity] = useState<string | null>(null);

  const { data } = useQuery<CaraStatus>({
    queryKey: ["/api/athlete/cara/status"],
    queryFn: () => getJson("/api/athlete/cara/status"),
    // Most athletes' coaches never turn CARA tracking on at all, and this
    // mounts on every visit to the workout page -- polling every 30s
    // forever for an athlete who will only ever get back `tracking: false`
    // is pure waste. Keep polling only while there's an actual session to
    // watch (or on first load, before we know either way).
    refetchInterval: (query) => (query.state.data?.tracking === false ? false : 30_000),
  });

  // Local tick for a smooth-looking clock between polls -- the source of
  // truth is still the server's startedAt/lastActivityAt, refreshed every
  // 30s above; this just interpolates the display in between.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const confirmActiveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/athlete/cara/confirm-active"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/athlete/cara/status"] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/athlete/cara/stop"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/athlete/cara/status"] }),
  });

  if (!data?.tracking || !data.open) return null;

  const startedAt = new Date(data.open.startedAt).getTime();
  const lastActivityAt = new Date(data.open.lastActivityAt).getTime();
  const idleMs = now - lastActivityAt;
  const showIdlePrompt =
    idleMs >= data.idlePromptMinutes * 60_000 &&
    promptDismissedForActivity !== data.open.lastActivityAt;

  return (
    <>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted-foreground">
        <Timer className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-foreground">{formatDuration(now - startedAt)}</span>
        <span>training time logged today</span>
        <span className="ml-auto">
          {data.weeklyMinutes} / {data.capMinutes} min this week
        </span>
      </div>

      <Dialog open={showIdlePrompt} onOpenChange={() => {}}>
        <DialogContent hideClose onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Still working out?</DialogTitle>
            <DialogDescription>
              We haven't seen a new set logged in a few minutes. Let us know so your training time
              stays accurate for your program's activity log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                stopMutation.mutate();
                setPromptDismissedForActivity(null);
              }}
              disabled={stopMutation.isPending}
            >
              No, I'm done
            </Button>
            <Button
              onClick={() => {
                confirmActiveMutation.mutate();
                setPromptDismissedForActivity(data.open!.lastActivityAt);
              }}
              disabled={confirmActiveMutation.isPending}
            >
              Yes, still going
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
