import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Send, Sparkles, Lock, Loader2, Copy, Check, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

type ProgramChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

// What generateProgramFromChat actually does, in order: gather the current
// program/exercise library/coaching guidelines, run it through the model,
// then write the result back. There's no server-sent progress -- this is
// one request/response, not a stream -- so these can't track real-time
// state; the index just advances on a timer and holds on the last step
// rather than looping back to "Reading," which would give the game away on
// a slow reply. Still grounded in what the request is actually doing, not
// arbitrary busy-work text.
const THINKING_STEPS = [
  "Reading your program...",
  "Checking your exercise library...",
  "Thinking through the changes...",
  "Applying updates...",
];

/** Conversational AI program builder -- describe what you want, the AI
 * rewrites the whole program structure and replies with a summary, applied
 * immediately (no separate draft/review step). Used by admin (their own
 * Forge library), a Free Agent (their own program), and a coach (a program
 * on their roster) alike -- for a coach this has the same blast radius as
 * their own manual edit + Save Program already does to the same program, so
 * there's nothing extra to gate here. `onApplied` is called with the fresh
 * program returned by each turn so the builder can update its fields
 * immediately, without waiting on a refetch. */
export function ProgramAiChatPanel({
  apiBase,
  programId,
  onApplied,
  resourcePath = "programs",
  title = "AI Program Builder",
  initialPrompt,
}: {
  apiBase: string;
  programId: number;
  onApplied: (program: any) => void;
  /** URL segment for the resource being edited -- "programs" (default) for
   * the strength builder, "skill-programs" for the skills one. The chat
   * protocol (ask_question/update_program tool-calling, 402 paywall) is
   * identical either way, so this is the only thing that needs to change to
   * reuse this panel for Skills. */
  resourcePath?: string;
  /** Header text -- "AI Program Builder" (default) for strength, "AI Skill
   * Builder" for skills, so the two paywalled products never read as the
   * same one. */
  title?: string;
  /** Compiled from the "New Program" questionnaire (see program-list.tsx) --
   * auto-sent as the first turn the moment this program's chat loads with no
   * existing messages, so the athlete never has to retype what they just
   * answered. Undefined for every other entry point (manual "New Program",
   * an existing program), which is the common case. */
  initialPrompt?: string;
}) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // The on-screen keyboard has no built-in way to dismiss itself for a plain multiline
  // textarea on iOS -- Enter already means "send" here (Shift+Enter for a real newline), not
  // "done", so there's never a keyboard action that closes it, and this panel can fill enough
  // of a phone screen that nothing tappable outside the input remains once the keyboard is up.
  // inputFocused (via the ref below) drives a small "Done" row that appears only while the
  // field actually has focus, so it's never visible taking up space the rest of the time.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputFocused, setInputFocused] = useState(false);
  // Collapsed by default -- a brand-new program shouldn't have to give up a
  // full-height column just to advertise a feature nobody's used yet. Once
  // a conversation already exists (loaded below), it opens automatically so
  // a coach doesn't lose sight of prior turns. An initialPrompt is itself
  // about to become the first message, so it opens immediately too rather
  // than waiting on that round-trip.
  const [open, setOpen] = useState(!!initialPrompt);
  const autoSentRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fetchUrl = `${apiBase}/${resourcePath}/${programId}/chat`;

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

  useEffect(() => {
    if (messages && messages.length > 0) setOpen(true);
  }, [messages]);

  const send = useMutation({
    mutationFn: async (overrideContent?: string) => {
      const res = await apiRequest("POST", fetchUrl, { content: overrideContent ?? content });
      return res.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      setContent("");
      if (result.program) onApplied(result.program);
    },
    // A slow/failed turn (a heavy request -- full exercise catalog, program structure, chat
    // history, up to 8192 output tokens -- occasionally taking long enough to trip a proxy or
    // network timeout) previously just failed outright with nothing but a toast, no second
    // attempt. 2 retries with a real backoff (not React Query's default near-instant retry,
    // which would just resend into the same still-busy request) gives a transient failure a real
    // chance to succeed before the athlete has to notice and resend by hand.
    retry: 2,
    retryDelay: (attempt) => 1000 * 2 ** attempt,
    onError: () => toast.error("Couldn't send that -- try again"),
  });

  const [thinkingStep, setThinkingStep] = useState(0);
  useEffect(() => {
    if (!send.isPending) {
      setThinkingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setThinkingStep((i) => Math.min(i + 1, THINKING_STEPS.length - 1));
    }, 1600);
    return () => clearInterval(interval);
  }, [send.isPending]);

  useEffect(() => {
    if (
      initialPrompt &&
      !autoSentRef.current &&
      !isLoading &&
      messages &&
      messages.length === 0
    ) {
      autoSentRef.current = true;
      send.mutate(initialPrompt);
    }
  }, [initialPrompt, isLoading, messages]);

  // A Free Agent who hasn't paid gets a 402 here (see requirePaidAiAccess
  // in routes.ts) -- that's an expected, permanent state, not a transient
  // failure, so it gets its own quiet locked-state card instead of an
  // error. This has to come after every hook above it -- an early return
  // can never sit between hooks.
  if (error instanceof ApiError && error.status === 402) {
    return (
      <Card>
        <CardHeader className="shrink-0">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-xs text-sm text-muted-foreground">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col overflow-hidden", open && "h-[75vh] max-h-[720px] min-h-0 flex-1")}>
      <CardHeader className="shrink-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {open && (
          <CardDescription>
            Describe what you want -- the AI rewrites the program and applies it immediately.
          </CardDescription>
        )}
      </CardHeader>
      {open && (
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
              <div className="w-56 max-w-[85%] rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  {THINKING_STEPS[thinkingStep]}
                </span>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-primary/15">
                  <div className="h-full w-1/3 rounded-full bg-primary animate-shimmer" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {inputFocused && (
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!content.trim() || send.isPending) return;
            send.mutate(undefined);
          }}
          className="flex shrink-0 items-end gap-2 border-t border-border pt-3"
        >
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="e.g. Add a 4th day focused on conditioning"
            className="min-h-[44px] flex-1 resize-none"
            maxLength={2000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (content.trim() && !send.isPending) send.mutate(undefined);
              }
            }}
          />
          <Button type="submit" disabled={send.isPending || !content.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
      )}
    </Card>
  );
}
