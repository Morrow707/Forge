import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Send, Sparkles, Lock, Loader2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

type ProgramChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

/** Conversational AI program builder -- describe what you want, the AI
 * rewrites the whole program structure and replies with a summary, applied
 * immediately (no draft/review step). Scoped to the admin's own programs;
 * unlike the coach-facing one-shot AI Assist, there's no separate "review
 * before it touches a real program" gate here since this is the trusted
 * admin building for themselves, not a coach acting on an athlete's behalf.
 * `onApplied` is called with the fresh program returned by each turn so the
 * builder can update its fields immediately, without waiting on a refetch. */
export function ProgramAiChatPanel({
  apiBase,
  programId,
  onApplied,
}: {
  apiBase: string;
  programId: number;
  onApplied: (program: any) => void;
}) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fetchUrl = `${apiBase}/programs/${programId}/chat`;

  async function handleCopy(message: ProgramChatMessage) {
    const copied = await copyToClipboard(message.content);
    if (!copied) {
      toast.error("Couldn't copy -- try selecting the text instead");
      return;
    }
    toast.success("Message copied");
    setCopiedId(message.id);
    setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 1500);
  }

  const { data: messages, isLoading, error } = useQuery<ProgramChatMessage[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", fetchUrl, { content });
      return res.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      setContent("");
      if (result.program) onApplied(result.program);
    },
    onError: () => toast.error("Couldn't send that -- try again"),
  });

  // A Free Agent who hasn't paid gets a 402 here (see requirePaidAiAccess
  // in routes.ts) -- that's an expected, permanent state, not a transient
  // failure, so it gets its own quiet locked-state card instead of an
  // error. This has to come after every hook above it -- an early return
  // can never sit between hooks.
  if (error instanceof ApiError && error.status === 402) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="shrink-0">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Program Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-xs text-sm text-muted-foreground">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Program Builder
        </CardTitle>
        <CardDescription>
          Describe what you want -- the AI rewrites the program and applies it immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
          {!isLoading && !messages?.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tell me what you want to build: your main goal, how many days a week you can
              train, your experience level, and any equipment limits. I'll ask if I need
              anything else before building your program.
            </p>
          )}
          {messages?.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "group relative max-w-[85%] rounded-lg px-3 py-2 pr-8 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-primary/30 bg-primary/5",
                )}
              >
                <button
                  type="button"
                  onClick={() => handleCopy(m)}
                  aria-label="Copy message"
                  title="Copy"
                  className={cn(
                    "absolute right-0.5 top-0.5 rounded p-2 opacity-70 transition-opacity hover:opacity-100",
                    m.role === "user" ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {copiedId === m.id ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px]",
                    m.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {format(parseISO(m.createdAt), "MMM d, h:mm a")}
                </p>
              </div>
            </div>
          ))}
          {send.isPending && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking...
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!content.trim() || send.isPending) return;
            send.mutate();
          }}
          className="flex shrink-0 items-end gap-2 border-t border-border pt-3"
        >
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="e.g. Add a 4th day focused on conditioning"
            className="min-h-[44px] flex-1 resize-none"
            maxLength={2000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (content.trim() && !send.isPending) send.mutate();
              }
            }}
          />
          <Button type="submit" disabled={send.isPending || !content.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
