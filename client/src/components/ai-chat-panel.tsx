import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Send, Sparkles, Eye, Lock, Loader2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { useSwipeToDismissKeyboard } from "@/hooks/use-swipe-to-dismiss-keyboard";

type ChatMessage = {
  id: number;
  role: "athlete" | "assistant";
  content: string;
  createdAt: string;
};

/** Shared between the athlete's own chat page and the coach's read-only
 * view of it -- pass `postUrl` to make it interactive (athlete side); omit
 * it for a read-only transcript (coach side). This is never a private
 * channel: the coach banner/description below is not decoration, it's the
 * actual safety property of the feature. */
export function AiChatPanel({
  fetchUrl,
  postUrl,
  athleteName,
  title = "AI Training Chat",
  description = "Ask about your training, recovery, or progress. If you join a coach later, they'll be able to see this conversation.",
}: {
  fetchUrl: string;
  postUrl?: string;
  athleteName?: string;
  title?: string;
  description?: string;
}) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  // Same keyboard-dismiss gap as program-ai-chat-panel.tsx's own textarea -- Enter already means
  // "send" here, so there's no keyboard action that closes it, and this small "Done" row (only
  // rendered while the field has focus) is the only way off the keyboard on a phone screen.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputFocused, setInputFocused] = useState(false);
  // Same gesture iOS Mail/Messages use -- swipe down on the message list (not the input) while
  // already scrolled to the top, and the keyboard closes, no "Done" tap needed.
  const { containerRef: messageListRef } = useSwipeToDismissKeyboard<HTMLDivElement>(() =>
    textareaRef.current?.blur(),
  );
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function handleCopy(message: ChatMessage) {
    const copied = await copyToClipboard(message.content);
    if (!copied) {
      toast.error("Couldn't copy -- try selecting the text instead");
      return;
    }
    toast.success("Message copied");
    setCopiedId(message.id);
    setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 1500);
  }

  const { data: messages, isLoading, error } = useQuery<ChatMessage[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
    refetchInterval: postUrl ? false : 30_000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", postUrl!, { content });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      setContent("");
    },
    onError: () => toast.error("Couldn't send that -- try again"),
  });

  // A Free Agent who hasn't paid gets a 402 here (see requirePaidAiAccess in
  // routes.ts) -- expected and permanent until they pay, so it gets its own
  // card instead of rendering an empty chat with no explanation. A coached
  // athlete never reaches this at all (FreeAgentGate keeps this component
  // from even mounting for them). This has to come after every hook above
  // it -- an early return can never sit between hooks.
  if (error instanceof ApiError && error.status === 402) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="shrink-0">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
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
          {title}
        </CardTitle>
        <CardDescription className="flex items-start gap-1.5">
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {postUrl
              ? description
              : `${athleteName ?? "This athlete"}'s conversation with the AI training chat -- always visible to you as their coach.`}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div ref={messageListRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
          {!isLoading && !messages?.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {postUrl
                ? "No messages yet -- ask something to get started."
                : "No messages yet."}
            </p>
          )}
          {messages?.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "athlete" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "group relative max-w-[85%] rounded-lg px-3 py-2 pr-8 text-sm",
                  m.role === "athlete"
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
                    m.role === "athlete" ? "text-primary-foreground" : "text-muted-foreground",
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
                    m.role === "athlete" ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {format(parseISO(m.createdAt), "MMM d, h:mm a")}
                </p>
              </div>
            </div>
          ))}
          {postUrl && send.isPending && (
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

        {postUrl && inputFocused && (
          <div className="flex shrink-0 justify-end">
            <button
              type="button"
              onClick={() => textareaRef.current?.blur()}
              className="text-xs font-semibold text-primary"
            >
              Done
            </button>
          </div>
        )}
        {postUrl && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!content.trim() || send.isPending) return;
              send.mutate();
            }}
            className="flex shrink-0 items-end gap-2 border-t border-border pt-3"
          >
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Ask your AI training chat something..."
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
        )}
      </CardContent>
    </Card>
  );
}
