import { useState } from "react";
import { useT } from "@/i18n";
import { TranslatableText } from "@/components/translatable-text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, ShieldCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReadFailed } from "@/components/read-failed";
import { ApiError, apiRequest, getJson } from "@/lib/queryClient";
import { MESSAGE_MAX_LENGTH } from "@shared/coach-messaging";
import { cn } from "@/lib/utils";

/* ONE PRIVATE THREAD: A COACH AND ONE ATHLETE THEY COACH (2026-11-21). Used by the coach's and the
 * athlete's Messages pages, pointed at their own role's routes. The server decides everything that
 * matters -- whether the two are in a coaching relationship, whether the thread is read-only, and
 * whether a parent can see it -- and this draws what it says:
 *   - a failed read is ReadFailed, never "no messages yet";
 *   - a held or ended thread shows its sentence and no composer;
 *   - when a parent can see the thread, both parties are told so above the composer;
 *   - text only, 2000 characters, and a sender may remove their own message (the other side then
 *     sees that one was removed; nothing is edited and nothing is deleted). */

export type ThreadMessage = {
  id: number;
  fromMe: boolean;
  senderRole: "coach" | "athlete";
  body: string | null;
  removed: boolean;
  createdAt: string;
  replyTo: { teamPostId: number; body: string } | null;
};

type Thread = {
  with: { id: number; name: string };
  state: "active" | "held" | "ended";
  canSend: boolean;
  readOnlyReason: string | null;
  parentCanSee: boolean;
  messages: ThreadMessage[];
};

export function CoachMessageThread({
  threadUrl,
  listUrl,
  replyToTeamPost,
  onReplySent,
}: {
  /** GET reads the thread, POST sends to it. */
  threadUrl: string;
  /** The thread list to refresh after a send (unread counts, ordering). */
  listUrl: string;
  /** A coach's Team Board post this athlete is answering privately. */
  replyToTeamPost?: { id: number; body: string } | null;
  onReplySent?: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery<Thread>({
    queryKey: [threadUrl],
    queryFn: () => getJson(threadUrl),
    retry: false,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [threadUrl] });
    void qc.invalidateQueries({ queryKey: [listUrl] });
    void qc.invalidateQueries({ queryKey: ["/api/messages/unread"] });
  };

  const send = useMutation({
    mutationFn: async () => (await apiRequest("POST", threadUrl, { body, teamPostId: replyToTeamPost?.id ?? null })).json(),
    onSuccess: () => {
      setBody("");
      onReplySent?.();
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t("Couldn't send that, try again")),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/messages/${id}/remove`),
    onSuccess: refresh,
    onError: () => toast.error(t("Couldn't remove that message")),
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-md bg-surface" />;
  if (isError || !data) return <ReadFailed what={t("this conversation")} error={error} onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col gap-3" data-testid="coach-message-thread">
      <h2 className="text-base font-semibold">{data.with.name}</h2>
      <div className="space-y-2">
        {data.messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("No messages yet.")}</p>}
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={cn("max-w-[85%] rounded-lg border p-3 text-sm", m.fromMe ? "ml-auto border-primary/40 bg-primary/10" : "mr-auto")}
            data-testid={`message-${m.id}`}
          >
            {m.replyTo && (
              <p className="mb-1 border-l-2 pl-2 text-xs text-muted-foreground">{t("Replying to the Team Board post: “{post}”", { post: m.replyTo.body })}</p>
            )}
            {m.body === null ? (
              <p className="italic text-muted-foreground">{t("This message was removed.")}</p>
            ) : (
              m.fromMe ? (
                <p className="whitespace-pre-wrap">{m.body}</p>
              ) : (
                // The other person's words, translated by AI for a reader in another language and
                // marked as translated, with the original one tap away.
                <TranslatableText text={m.body} className="whitespace-pre-wrap" />
              )
            )}
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {t.date(m.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {m.removed && m.body !== null && ` · ${t("removed, the other side sees only that it was")}`}
              </span>
              {m.fromMe && !m.removed && (
                <button type="button" className="underline" onClick={() => remove.mutate(m.id)} disabled={remove.isPending}>
                  {t("Remove")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {data.parentCanSee && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-parent-can-see">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("A parent or guardian can read this conversation.")}
        </p>
      )}

      {data.canSend ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) send.mutate();
          }}
        >
          {replyToTeamPost && (
            <p className="border-l-2 pl-2 text-xs text-muted-foreground">{t("Replying privately to: “{post}”", { post: replyToTeamPost.body })}</p>
          )}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder={t("Write a message…")}
            className="min-h-16 text-sm"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {body.length}/{MESSAGE_MAX_LENGTH}
            </span>
            <Button type="submit" size="sm" disabled={send.isPending || !body.trim()}>
              <Send className="h-4 w-4" />
              {t("Send")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="flex items-center gap-1.5 rounded-md border p-3 text-sm text-muted-foreground" data-testid="text-thread-read-only">
          <Lock className="h-4 w-4 shrink-0" />
          {data.readOnlyReason}
        </p>
      )}
    </div>
  );
}

export type ThreadSummary = {
  id: number;
  name: string;
  state: "active" | "held" | "ended";
  unread: number;
  lastMessageAt: string | null;
};

/** The list of threads, one row per person, with unread counts. */
export function ThreadList({
  threads,
  selectedId,
  onSelect,
}: {
  threads: ThreadSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const tr = useT();
  const stateLabel: Record<ThreadSummary["state"], string> = { active: "", held: tr("On hold"), ended: tr("Read-only") };
  return (
    <ul className="divide-y rounded-md border" data-testid="message-thread-list">
      {threads.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn("flex w-full items-center justify-between gap-2 p-3 text-left text-sm", selectedId === t.id && "bg-muted")}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.name}</span>
              {stateLabel[t.state] && <span className="text-xs text-muted-foreground">{stateLabel[t.state]}</span>}
            </span>
            {t.unread > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground" data-testid={`unread-${t.id}`}>
                {t.unread}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
