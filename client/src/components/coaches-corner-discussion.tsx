import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ArrowLeft, Flag, Lock, MessageSquare, Pin, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Author = { id: number; name: string };
type ThreadSummary = {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  replyCount: number;
  lastActivityAt: string;
  createdAt: string;
  author: Author;
  track: { id: number; title: string } | null;
};
type Reply = { id: number; body: string; createdAt: string; author: Author };
type ThreadDetail = ThreadSummary & { replies: Reply[] };

const TITLE_MAX = 140;
const BODY_MAX = 5000;

/** Peer discussion (2026-10-03): coaches with the add-on talking to each other, by name. The
 * one rule on screen and in the code: no athlete is ever named here. Every post can be
 * reported; a coach can remove their own; an admin hides, pins and locks. */
export function CoachesCornerDiscussion({ tracks }: { tracks: { id: number; title: string }[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [trackId, setTrackId] = useState<number | null>(null);
  const [reply, setReply] = useState("");

  const list = useQuery<ThreadSummary[]>({
    queryKey: ["/api/coach/discussion/threads"],
    queryFn: () => getJson("/api/coach/discussion/threads"),
  });
  const detail = useQuery<ThreadDetail>({
    queryKey: [`/api/coach/discussion/threads/${openId}`],
    queryFn: () => getJson(`/api/coach/discussion/threads/${openId}`),
    enabled: openId != null,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/coach/discussion/threads"] });
    if (openId != null) qc.invalidateQueries({ queryKey: [`/api/coach/discussion/threads/${openId}`] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/discussion/threads", { title: title.trim(), body: body.trim(), trackId });
      return res.json() as Promise<{ id: number }>;
    },
    onSuccess: (t) => {
      setTitle("");
      setBody("");
      setTrackId(null);
      setComposing(false);
      invalidate();
      setOpenId(t.id);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't post"),
  });
  const post = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/coach/discussion/threads/${openId}/replies`, { body: reply.trim() });
    },
    onSuccess: () => {
      setReply("");
      invalidate();
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't reply"),
  });
  const remove = useMutation({
    mutationFn: async ({ kind, id }: { kind: "thread" | "reply"; id: number }) => {
      await apiRequest("DELETE", kind === "thread" ? `/api/coach/discussion/threads/${id}` : `/api/coach/discussion/replies/${id}`, {});
      return kind;
    },
    onSuccess: (kind) => {
      if (kind === "thread") setOpenId(null);
      invalidate();
      toast.success("Removed");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't remove"),
  });
  const report = useMutation({
    mutationFn: async ({ kind, id, reason }: { kind: "thread" | "reply"; id: number; reason: string }) => {
      await apiRequest("POST", kind === "thread" ? `/api/coach/discussion/threads/${id}/report` : `/api/coach/discussion/replies/${id}/report`, { reason });
    },
    onSuccess: () => toast.success("Reported. Forge will take a look."),
    onError: (err: ApiError) => toast.error(err.message || "Couldn't report"),
  });

  function askReport(kind: "thread" | "reply", id: number) {
    const reason = window.prompt("What's wrong with this post? (Names an athlete, abusive, spam, something else.)");
    if (!reason || reason.trim().length < 3) return;
    report.mutate({ kind, id, reason: reason.trim() });
  }

  const rules = (
    <p className="text-xs text-muted-foreground">
      Coaches only, posting as yourself. Never name or describe an athlete, yours or anyone else's. Anything
      here can be reported and Forge reads every report.
    </p>
  );

  if (openId != null) {
    const t = detail.data;
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setOpenId(null)}>
          <ArrowLeft className="h-4 w-4" />
          All threads
        </Button>
        {detail.isError ? (
          <Card>
            <CardContent className="py-10">
              <ReadFailed what="this thread" onRetry={() => void detail.refetch()} />
            </CardContent>
          </Card>
        ) : !t ? (
          <div className="h-32 animate-pulse rounded-lg bg-surface" />
        ) : (
          <>
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold uppercase tracking-wide">
                      {t.pinned && <Pin className="mr-1.5 inline h-4 w-4 text-primary" />}
                      {t.title}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {t.author.name}, {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                      {t.track && <> &middot; {t.track.title}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {t.author.id === user?.id ? (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => window.confirm("Remove this thread?") && remove.mutate({ kind: "thread", id: t.id })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" aria-label="Report" onClick={() => askReport("thread", t.id)}>
                        <Flag className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {t.body.split("\n\n").map((p, i) => (
                  <p key={i} className="whitespace-pre-line text-sm leading-relaxed">
                    {p}
                  </p>
                ))}
              </CardContent>
            </Card>
            <div className="space-y-2">
              {t.replies.map((r) => (
                <Card key={r.id}>
                  <CardContent className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{r.author.name}</span>,{" "}
                        {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                      </p>
                      {r.author.id === user?.id ? (
                        <button type="button" className="text-muted-foreground hover:text-destructive" aria-label="Remove reply" onClick={() => remove.mutate({ kind: "reply", id: r.id })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Report reply" onClick={() => askReport("reply", r.id)}>
                          <Flag className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="whitespace-pre-line text-sm leading-relaxed">{r.body}</p>
                  </CardContent>
                </Card>
              ))}
              {t.replies.length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
            </div>
            {t.locked ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" /> This thread is closed to replies.
              </p>
            ) : (
              <Card>
                <CardContent className="space-y-2 p-4">
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={BODY_MAX} placeholder="Reply as yourself. No athlete names." />
                  <div className="flex items-center justify-between gap-3">
                    {rules}
                    <Button size="sm" onClick={() => post.mutate()} disabled={post.isPending || reply.trim().length === 0}>
                      Reply
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">Coach to coach</h2>
          {rules}
        </div>
        <Button size="sm" onClick={() => setComposing((v) => !v)}>
          <Plus className="h-4 w-4" />
          New thread
        </Button>
      </div>
      {composing && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} placeholder="Title" />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={BODY_MAX} placeholder="What's the question or the thing you've learned? No athlete names." />
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={trackId ?? ""}
                onChange={(e) => setTrackId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Not about a track</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || title.trim().length < 3 || body.trim().length === 0}>
                Post
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {list.isError ? (
        <Card>
          <CardContent className="py-10">
            <ReadFailed what="the discussion" onRetry={() => void list.refetch()} />
          </CardContent>
        </Card>
      ) : list.isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-surface" />
      ) : (list.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nobody has posted yet. Start the first thread.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.data!.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenId(t.id)}
              className={cn(
                "flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-surface-elevated",
                t.pinned && "border-primary/40",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {t.pinned && <Pin className="mr-1 inline h-3.5 w-3.5 text-primary" />}
                  {t.locked && <Lock className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />}
                  {t.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.author.name} &middot; {formatDistanceToNow(new Date(t.lastActivityAt), { addSuffix: true })}
                  {t.track && <> &middot; {t.track.title}</>}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
