import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Film, Send, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import type { ClipSummary } from "@shared/video-clips";

type RequestRow = {
  id: number;
  setId: number;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reviewId: number | null;
};

function day(value: string): string {
  try {
    return format(parseISO(value), "MMM d");
  } catch {
    return value;
  }
}

/**
 * "ASK MY COACH TO CHECK THIS" -- the athlete's side of the review queue (Phase 4b of
 * docs/video-review-plan.md).
 *
 * The failure this is for is "I filmed it and nobody watched it". So the thing that matters
 * here is not the asking, which is one POST -- it is that the athlete can SEE what they have
 * asked for and whether it came back. A button that fires and forgets leaves them exactly
 * where they started.
 *
 * An ask can only be made about a clip the athlete already has, so this lists their own clips
 * and never offers a file picker: the server refuses a set that is not theirs or has no
 * footage, and offering either would be an invitation to meet that refusal.
 */
export function AskCoachForReview() {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);

  const clips = useQuery<ClipSummary[]>({
    queryKey: ["/api/athlete/clips"],
    queryFn: () => getJson("/api/athlete/clips"),
  });
  const asks = useQuery<RequestRow[]>({
    queryKey: ["/api/athlete/video-review-requests"],
    queryFn: () => getJson("/api/athlete/video-review-requests"),
  });

  const openBySet = useMemo(() => {
    const map = new Map<number, RequestRow>();
    for (const a of asks.data ?? []) if (!a.resolvedAt) map.set(a.setId, a);
    return map;
  }, [asks.data]);

  const ask = useMutation({
    mutationFn: async (setId: number) => {
      await apiRequest("POST", "/api/athlete/video-review-requests", {
        setId,
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      setNote("");
      setChosen(null);
      void qc.invalidateQueries({ queryKey: ["/api/athlete/video-review-requests"] });
      toast.success("Sent to your coach — it's on their review queue.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Couldn't send that. Please try again.");
    },
  });

  const withdraw = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/athlete/video-review-requests/${id}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["/api/athlete/video-review-requests"] }),
  });

  // isError before any emptiness claim, both times: "you have no clips" and "we could not ask"
  // are different things, and the second read as the first tells an athlete their footage is
  // gone.
  if (clips.isError) {
    return <ReadFailed what="your clips" onRetry={() => void clips.refetch()} />;
  }
  if (asks.isError) {
    return <ReadFailed what="what you've asked your coach" onRetry={() => void asks.refetch()} />;
  }
  if (clips.isLoading || asks.isLoading) {
    return <div className="h-20 w-full animate-pulse rounded-lg bg-surface" />;
  }

  const rows = (clips.data ?? []).slice(0, 12);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Film a set and you can ask your coach to break it down here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((c) => {
        const open = openBySet.get(c.id);
        const isChosen = chosen === c.id;
        return (
          <div key={`${c.source}:${c.id}`} className="rounded-md border border-border px-3 py-2">
            <div className="flex items-center gap-3">
              <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {c.setNumber != null ? `${c.exerciseName} — Set ${c.setNumber}` : c.exerciseName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{day(c.date)}</span>
              </span>
              {open ? (
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Waiting since {day(open.createdAt)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={withdraw.isPending}
                    onClick={() => withdraw.mutate(open.id)}
                  >
                    Withdraw
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setChosen(isChosen ? null : c.id)}>
                  {isChosen ? "Cancel" : "Ask my coach"}
                </Button>
              )}
            </div>
            {isChosen && !open && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="What should they look at? (optional)"
                  aria-label="What should your coach look at?"
                />
                <Button size="sm" disabled={ask.isPending} onClick={() => ask.mutate(c.id)}>
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {(asks.data ?? []).some((a) => a.resolvedAt) && (
        <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          Answered reviews appear under Coach reviews above.
        </p>
      )}
    </div>
  );
}
