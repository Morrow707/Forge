import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { MessageSquareText, Send, ThumbsDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type Citation = { trackId: number; trackTitle: string; lessonId: number; lessonNumber: number; lessonTitle: string };
type Turn = { role: "user" | "assistant"; content: string; citations?: Citation[]; flagged?: boolean };

/** "Ask the library": a coach's question answered from Forge's own Coaches Corner lessons,
 * each answer naming the lessons it drew on so they can be opened. Nothing outside Forge is
 * read (docs/legal-open-questions.md, question 12). The thread lives in this component and
 * nowhere else. */
export function CoachesCornerAsk({ onOpenLesson }: { onOpenLesson: (trackId: number, lessonId: number) => void }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  // Opt in per session: the server sends aggregates about the roster (count, sports,
  // positions, ages, teams), never a name, so the answer can be about this program.
  const [includeRoster, setIncludeRoster] = useState(false);

  const ask = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/coach/academy/ask", {
        question: q,
        history: turns.slice(-6).map((t) => ({ role: t.role, content: t.content })),
        includeRoster,
      });
      return res.json() as Promise<{ answer: string; citations: Citation[] }>;
    },
    onMutate: (q) => {
      setTurns((prev) => [...prev, { role: "user", content: q }]);
      setQuestion("");
    },
    onSuccess: (r) => setTurns((prev) => [...prev, { role: "assistant", content: r.answer, citations: r.citations }]),
    onError: (err: ApiError) => {
      toast.error(err.message || "The library couldn't answer");
      setTurns((prev) => prev.slice(0, -1));
    },
  });

  // "This didn't answer my question": filed for the admin with the answer that fell short.
  const flag = useMutation({
    mutationFn: async (index: number) => {
      const answer = turns[index];
      const q = [...turns.slice(0, index)].reverse().find((t) => t.role === "user");
      await apiRequest("POST", "/api/coach/academy/ask/flag", { question: q?.content ?? "(unknown)", answerGiven: answer?.content ?? null });
      return index;
    },
    onSuccess: (index) => {
      setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, flagged: true } : t)));
      toast.success("Sent to Forge. Thanks, that's how the next track gets chosen.");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send that"),
  });

  function submit() {
    const q = question.trim();
    if (q.length < 3 || ask.isPending) return;
    ask.mutate(q);
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-4 w-4 text-primary" />
          Ask the library
        </CardTitle>
        <CardDescription>
          A question, answered from Forge's own lessons, with the lessons it came from. Not medical
          advice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {turns.length > 0 && (
          <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border border-border bg-surface p-3">
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "text-sm font-semibold" : "space-y-2 text-sm"}>
                {t.role === "user" ? (
                  <p>{t.content}</p>
                ) : (
                  <>
                    {t.content.split("\n\n").map((para, pi) => (
                      <p key={pi} className="leading-relaxed">
                        {para}
                      </p>
                    ))}
                    <div className="pt-1">
                      {t.flagged ? (
                        <span className="text-xs text-muted-foreground">Sent to Forge.</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => flag.mutate(i)}
                          disabled={flag.isPending}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <ThumbsDown className="h-3 w-3" />
                          This didn't answer my question
                        </button>
                      )}
                    </div>
                    {t.citations && t.citations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {t.citations.map((c) => (
                          <button
                            key={c.lessonId}
                            type="button"
                            onClick={() => onOpenLesson(c.trackId, c.lessonId)}
                            className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20"
                          >
                            {c.trackTitle}: {c.lessonNumber}. {c.lessonTitle}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {ask.isPending && <p className="text-sm text-muted-foreground">Reading the lessons...</p>}
          </div>
        )}
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={includeRoster} onCheckedChange={(c) => setIncludeRoster(Boolean(c))} />
          Answer for my roster (sends counts, sports, positions and ages, never a name)
        </label>
        <div className="flex items-end gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder="e.g. How should I structure the first four weeks for freshmen who have never lifted?"
            className="flex-1"
          />
          <Button onClick={submit} disabled={ask.isPending || question.trim().length < 3} aria-label="Ask">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
