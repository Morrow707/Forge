import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Plus, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";

export type CoachCue = {
  id: number;
  kind: string;
  label: string;
  body: string;
  audioUrl: string | null;
};

/**
 * THE CUE DRAWER -- Phase 4b of docs/video-review-plan.md.
 *
 * The things a coach says over and over. Tapping one drops it on the timeline at the current
 * moment as an ordinary `cue` event carrying a COPY of its text.
 *
 * The copy is the point, and it is `onDrop`'s contract rather than this component's: nothing
 * here hands the caller a cue id to store. Editing or deleting a cue later must not change
 * what a coach already said in a review somebody has watched.
 */
export function CueDrawer({ onDrop }: { onDrop: (cue: CoachCue) => void }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");

  const cues = useQuery<CoachCue[]>({
    queryKey: ["/api/coach/cues"],
    queryFn: () => getJson("/api/coach/cues"),
  });

  const create = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/coach/cues", { label: label.trim(), body: body.trim() });
    },
    onSuccess: () => {
      setLabel("");
      setBody("");
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ["/api/coach/cues"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Couldn't save that cue."),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/coach/cues/${id}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["/api/coach/cues"] }),
    // Only the coach who made a cue may delete it, so a staff coach meets a 404 here. Said
    // plainly rather than as "not found", which reads like the cue is gone.
    onError: () => toast.error("That cue belongs to another coach on your staff."),
  });

  // isError before any emptiness claim: "no cues yet" and "we could not ask" are different
  // things, and the second read as the first looks like a coach's library was wiped.
  if (cues.isError) {
    return <ReadFailed what="your cues" onRetry={() => void cues.refetch()} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cues</p>
        <Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)}>
          <Plus className="h-3.5 w-3.5" />
          {adding ? "Cancel" : "New cue"}
        </Button>
      </div>

      {adding && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="Short name (e.g. Knees out)"
            aria-label="Cue name"
            className="w-40"
          />
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={280}
            placeholder="What you say"
            aria-label="What you say"
            className="min-w-[12rem] flex-1"
          />
          <Button
            size="sm"
            disabled={create.isPending || !label.trim() || !body.trim()}
            onClick={() => create.mutate()}
          >
            Save
          </Button>
        </div>
      )}

      {cues.isLoading ? (
        <div className="h-8 w-full animate-pulse rounded-md bg-surface" />
      ) : (cues.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Save the things you say every session — tap one to drop it on the timeline.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {(cues.data ?? []).map((c) => (
            <span key={c.id} className="flex items-center rounded-full border border-border">
              <button
                type="button"
                onClick={() => onDrop(c)}
                title={c.body}
                className="flex items-center gap-1.5 rounded-l-full px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                {c.audioUrl ? (
                  <Volume2 className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <MessageSquarePlus className="h-3 w-3 text-muted-foreground" />
                )}
                {c.label}
              </button>
              <button
                type="button"
                aria-label={`Delete cue ${c.label}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(c.id)}
                className="rounded-r-full px-2 py-1 text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
