import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, getJson } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Send, Sparkles, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

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
}: {
  fetchUrl: string;
  postUrl?: string;
  athleteName?: string;
}) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
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

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Training Chat
        </CardTitle>
        <CardDescription className="flex items-start gap-1.5">
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {postUrl
              ? "Ask about your training, recovery, or progress. If you join a coach later, they'll be able to see this conversation."
              : `${athleteName ?? "This athlete"}'s conversation with the AI training chat -- always visible to you as their coach.`}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
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
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  m.role === "athlete"
                    ? "bg-primary text-primary-foreground"
                    : "border border-primary/30 bg-primary/5",
                )}
              >
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
          <div ref={bottomRef} />
        </div>

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
              value={content}
              onChange={(e) => setContent(e.target.value)}
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
