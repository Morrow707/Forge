import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle, CalendarPlus, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type ContentPage = { title?: string; body: string };
type QuizAnswerOption = { id: number; orderIndex: number; answerText: string };
type QuizQuestion = { id: number; orderIndex: number; questionText: string; answers: QuizAnswerOption[] };
type LessonContent = { id: number; title: string; content: ContentPage[]; quizQuestions: QuizQuestion[] };

type QuizAnswerResult = {
  questionId: number;
  questionText: string;
  submittedAnswerId: number | null;
  isCorrect: boolean;
  answers: { id: number; answerText: string; isCorrect: boolean; explanation: string }[];
};
type QuizSubmitResult = {
  score: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  passThreshold: number;
  results: QuizAnswerResult[];
};

/** Full-screen, click/tap-through reader for a Class lesson's content pages
 * and end-of-chapter quiz -- the gate between a "ready" lesson (progression
 * + payment cleared) and "active" (its drills actually land on the
 * athlete's calendar). Single flex-1 overflow-y-auto scroll region between
 * pinned header/footer, same convention exercise-picker-dialog.tsx and
 * skill-picker-dialog.tsx use, so a long reading page can never get clipped
 * by the dialog's own overflow-hidden the way the old filter panel did. */
export function ClassLessonReaderDialog({
  open,
  onOpenChange,
  classId,
  lesson,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: number;
  lesson: {
    id: number;
    lessonNumber: number;
    title: string;
    contentCompletedAt: string | null;
    quizPassedAt: string | null;
  };
}) {
  const qc = useQueryClient();
  const { data: lessonContent, isLoading } = useQuery<LessonContent>({
    queryKey: [`/api/athlete/classes/${classId}/lessons/${lesson.id}/content`],
    queryFn: () => getJson(`/api/athlete/classes/${classId}/lessons/${lesson.id}/content`),
    enabled: open,
  });

  const [pageIndex, setPageIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<QuizSubmitResult | null>(null);
  // Driven locally (seeded from the server progress, advanced optimistically
  // on each step's success) rather than read straight off the `lesson` prop
  // every render -- the quiz-just-passed screen needs to stay on screen
  // until the athlete taps Continue, not vanish the instant the background
  // progress refetch (triggered by that same success) lands.
  const [contentDone, setContentDone] = useState(!!lesson.contentCompletedAt);
  const [quizPassed, setQuizPassed] = useState(!!lesson.quizPassedAt);

  useEffect(() => {
    if (open) {
      setPageIndex(0);
      setSelectedAnswers({});
      setQuizResult(null);
      setContentDone(!!lesson.contentCompletedAt);
      setQuizPassed(!!lesson.quizPassedAt);
    }
    // Only re-seed when the dialog opens (or for a different lesson) -- not
    // on every progress refetch while it's open, which would fight the
    // optimistic local state above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lesson.id]);

  function invalidateProgress() {
    qc.invalidateQueries({ queryKey: [`/api/athlete/classes/${classId}/progress`] });
    qc.invalidateQueries({ queryKey: ["/api/athlete/my-classes"] });
  }

  const completeContentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/athlete/classes/${classId}/lessons/${lesson.id}/content/complete`,
        {},
      );
      return res.json();
    },
    onSuccess: () => {
      setContentDone(true);
      invalidateProgress();
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save your progress"),
  });

  const submitQuizMutation = useMutation({
    mutationFn: async () => {
      const answers = Object.entries(selectedAnswers).map(([questionId, answerId]) => ({
        questionId: Number(questionId),
        answerId,
      }));
      const res = await apiRequest(
        "POST",
        `/api/athlete/classes/${classId}/lessons/${lesson.id}/quiz/submit`,
        { answers },
      );
      return res.json() as Promise<QuizSubmitResult>;
    },
    onSuccess: (result) => {
      setQuizResult(result);
      if (result.passed) invalidateProgress();
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not submit quiz"),
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/athlete/classes/${classId}/lessons/${lesson.id}/activate`,
        {},
      );
      return res.json();
    },
    onSuccess: () => {
      invalidateProgress();
      toast.success("Added to your calendar");
      onOpenChange(false);
    },
    onError: (err: ApiError) =>
      toast.error(err.message || "Could not add this lesson to your calendar"),
  });

  const phase: "reading" | "quiz" | "ready" = !contentDone ? "reading" : !quizPassed ? "quiz" : "ready";
  const pages = lessonContent?.content ?? [];
  const questions = lessonContent?.quizQuestions ?? [];
  const allAnswered = questions.length > 0 && questions.every((q) => selectedAnswers[q.id] != null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 top-0 left-0 flex h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0">
        <div className="shrink-0 space-y-1 border-b border-border p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline">Lesson {lesson.lessonNumber}</Badge>
              {lesson.title}
            </DialogTitle>
          </DialogHeader>
          {phase === "reading" && pages.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Page {Math.min(pageIndex + 1, pages.length)} of {pages.length}
            </p>
          )}
          {phase === "quiz" && !quizResult && questions.length > 0 && (
            <p className="text-xs text-muted-foreground">Chapter quiz -- {questions.length} questions</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading && <div className="h-40 animate-pulse rounded-lg bg-surface" />}

          {!isLoading && phase === "reading" && (
            <div className="mx-auto max-w-2xl space-y-3">
              {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reading content for this lesson yet.</p>
              ) : (
                <>
                  {pages[pageIndex]?.title && (
                    <h3 className="font-display text-base font-bold uppercase tracking-wide">
                      {pages[pageIndex].title}
                    </h3>
                  )}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {pages[pageIndex]?.body}
                  </div>
                </>
              )}
            </div>
          )}

          {!isLoading && phase === "quiz" && !quizResult && (
            <div className="mx-auto max-w-2xl space-y-5">
              {questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">This lesson's quiz isn't ready yet.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Answer every question, then submit. You can retry as many times as you need.
                  </p>
                  {questions.map((q, qi) => (
                    <div key={q.id} className="space-y-2 rounded-md border border-border p-3">
                      <p className="text-sm font-semibold">
                        {qi + 1}. {q.questionText}
                      </p>
                      <div className="space-y-1.5">
                        {q.answers.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setSelectedAnswers((prev) => ({ ...prev, [q.id]: a.id }))}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md border p-2.5 text-left text-sm transition-colors",
                              selectedAnswers[q.id] === a.id
                                ? "border-primary bg-primary/10"
                                : "border-border hover:bg-surface-elevated",
                            )}
                          >
                            <span
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 rounded-full border-2",
                                selectedAnswers[q.id] === a.id
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground",
                              )}
                            />
                            {a.answerText}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {!isLoading && phase === "quiz" && quizResult && (
            <div className="mx-auto max-w-2xl space-y-5">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md border p-3 text-sm font-semibold",
                  quizResult.passed
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                {quizResult.passed ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {quizResult.correctCount}/{quizResult.totalQuestions} correct --{" "}
                {quizResult.passed
                  ? "you passed!"
                  : `need ${Math.ceil(quizResult.passThreshold * quizResult.totalQuestions)} to pass`}
              </div>
              {quizResult.results.map((r, ri) => (
                <div key={r.questionId} className="space-y-2 rounded-md border border-border p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {r.isCorrect ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                    {ri + 1}. {r.questionText}
                  </p>
                  <div className="space-y-1.5 pl-6">
                    {r.answers.map((a) => (
                      <div
                        key={a.id}
                        className={cn(
                          "rounded-md border p-2 text-xs",
                          a.isCorrect
                            ? "border-success/40 bg-success/10"
                            : a.id === r.submittedAnswerId
                              ? "border-destructive/40 bg-destructive/10"
                              : "border-border/60",
                        )}
                      >
                        <p className="font-medium">{a.answerText}</p>
                        <p className="mt-0.5 text-muted-foreground">{a.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && phase === "ready" && (
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p className="font-semibold">Content read and quiz passed.</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Add this lesson's drills to your calendar to start training it.
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border p-4 sm:p-6">
          {phase === "reading" && (
            <>
              <Button
                variant="outline"
                onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                disabled={pageIndex === 0}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              {pageIndex < pages.length - 1 ? (
                <Button onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => completeContentMutation.mutate()}
                  disabled={completeContentMutation.isPending}
                >
                  <BookOpen className="h-4 w-4" />
                  {completeContentMutation.isPending ? "Saving…" : "Finish Reading"}
                </Button>
              )}
            </>
          )}

          {phase === "quiz" && !quizResult && (
            <Button
              className="ml-auto"
              onClick={() => submitQuizMutation.mutate()}
              disabled={!allAnswered || submitQuizMutation.isPending}
            >
              {submitQuizMutation.isPending ? "Submitting…" : "Submit Quiz"}
            </Button>
          )}

          {phase === "quiz" && quizResult && !quizResult.passed && (
            <Button
              className="ml-auto"
              variant="secondary"
              onClick={() => {
                setSelectedAnswers({});
                setQuizResult(null);
              }}
            >
              Try Again
            </Button>
          )}

          {phase === "quiz" && quizResult && quizResult.passed && (
            <Button
              className="ml-auto"
              onClick={() => {
                setQuizPassed(true);
                setQuizResult(null);
              }}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {phase === "ready" && (
            <Button
              className="ml-auto"
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
            >
              <CalendarPlus className="h-4 w-4" />
              {activateMutation.isPending ? "Adding…" : "Add to Calendar"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
