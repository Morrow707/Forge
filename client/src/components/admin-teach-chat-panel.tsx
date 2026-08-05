import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, getJson } from "@/lib/queryClient";
import { copyToClipboard } from "@/lib/clipboard";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Send, Sparkles, Loader2, Copy, Check, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type KnowledgeMessage = {
  id: number;
  role: "admin" | "assistant";
  content: string;
  createdAt: string;
};

type KnowledgeState = { guidelines: string; messages: KnowledgeMessage[] };

/** Shared chat UI for every "admin teaches an AI a living guidelines
 * document" feature on this platform (program builder, nutrition
 * education, ...). Each caller just points it at its own fetch/post
 * endpoints and supplies the copy -- the underlying pattern (rewrite the
 * complete guidelines document each turn, never a diff) is identical. */
export function AdminTeachChatPanel({
  fetchUrl,
  postUrl,
  chatTitle,
  chatDescription,
  emptyStateHint,
  placeholder,
  guidelinesTitle,
  guidelinesDescription,
  guidelinesEmptyHint,
}: {
  fetchUrl: string;
  postUrl: string;
  chatTitle: string;
  chatDescription: string;
  emptyStateHint: string;
  placeholder: string;
  guidelinesTitle: string;
  guidelinesDescription: string;
  guidelinesEmptyHint: string;
}) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<KnowledgeState>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });
  const messages = data?.messages ?? [];
  const guidelines = data?.guidelines ?? "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", postUrl, { content });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      setContent("");
    },
    onError: () => toast.error("Couldn't send that -- try again"),
  });

  async function handleCopy(message: KnowledgeMessage) {
    const copied = await copyToClipboard(message.content);
    if (!copied) {
      toast.error("Couldn't copy -- try selecting the text instead");
      return;
    }
    toast.success("Message copied");
    setCopiedId(message.id);
    setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 1500);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Card className="flex min-h-[28rem] flex-col">
        <CardHeader className="shrink-0">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {chatTitle}
          </CardTitle>
          <CardDescription>{chatDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
            {!isLoading && messages.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">{emptyStateHint}</p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn("flex", m.role === "admin" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "group relative max-w-[85%] rounded-lg px-3 py-2 pr-8 text-sm",
                    m.role === "admin"
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
                      m.role === "admin" ? "text-primary-foreground" : "text-muted-foreground",
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
                      m.role === "admin" ? "text-primary-foreground/70" : "text-muted-foreground",
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
              placeholder={placeholder}
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

      <Card className="flex min-h-[28rem] flex-col">
        <CardHeader className="shrink-0">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            {guidelinesTitle}
          </CardTitle>
          <CardDescription>{guidelinesDescription}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-md bg-surface" />
          ) : guidelines ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{guidelines}</p>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{guidelinesEmptyHint}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
