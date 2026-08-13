import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  CalendarPlus,
  BookOpen,
  PlayCircle,
  Trophy,
  FileDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ContentPage = {
  title?: string;
  body: string;
  videoUrl?: string | null;
  imageUrls?: string[];
  attachmentUrl?: string | null;
  attachmentName?: string | null;
};
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
  perfect: boolean;
  passThreshold: number;
  results: QuizAnswerResult[];
};

/** Friendly, funny, a little whimsical -- picked at random per failed
 * attempt so grinding through retries doesn't feel like reading a stern
 * error message over and over. */
const ENCOURAGING_FAIL_LINES = [
  "Oh, so close! Hit the books (well, the chapter) and give it another go.",
  "Not quite -- your swing needs a little more film study first.",
  "Solid effort! Review the chapter and step back up to the plate.",
  "Almost there! A quick re-read and you'll crush this one.",
  "Good try! Brush up on the chapter and take another cut at it.",
];
function randomFailLine() {
  return ENCOURAGING_FAIL_LINES[Math.floor(Math.random() * ENCOURAGING_FAIL_LINES.length)];
}

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
  startAt = "reading",
  alreadyActive = false,
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
  /** "reading" (the "Take Lesson" / "Take Lesson Again" button) always
   * starts from page one. "quiz" (the "Take Test" button) jumps straight to
   * the quiz -- lets an athlete who's already read the chapter retake it
   * without re-paging through every page first. */
  startAt?: "reading" | "quiz";
  /** True once this lesson's drills are already on the athlete's calendar
   * (state === "active"). Content/quiz are already done in that case, so
   * finishing either one here just closes the dialog instead of running
   * the Add-to-Calendar gate again. */
  alreadyActive?: boolean;
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
  const [failLine, setFailLine] = useState("");
  // Driven directly by which button opened the dialog (startAt), not
  // derived from contentCompletedAt/quizPassedAt -- those flags mean
  // "completed at least once," but "Take Test" needs to land on the quiz
  // even when they're already both true, and "Take Lesson Again" needs to
  // restart at page one even though they're already both true too.
  const [phase, setPhase] = useState<"reading" | "quiz" | "ready">(startAt === "quiz" ? "quiz" : "reading");

  useEffect(() => {
    if (open) {
      setPageIndex(0);
      setSelectedAnswers({});
      setQuizResult(null);
      setFailLine("");
      setPhase(startAt === "quiz" ? "quiz" : "reading");
    }
    // Only re-seed when the dialog opens (or for a different lesson) -- not
    // on every progress refetch while it's open, which would fight the
    // local phase state above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lesson.id, startAt]);

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
      invalidateProgress();
      if (questions.length > 0) {
        setPhase("quiz");
      } else if (alreadyActive) {
        onOpenChange(false);
      } else {
        setPhase("ready");
      }
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
      if (!result.passed) setFailLine(randomFailLine());
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
                  {!!pages[pageIndex]?.imageUrls?.length && (
                    <div
                      className={cn(
                        "grid gap-2",
                        pages[pageIndex].imageUrls!.length > 1 ? "grid-cols-2" : "grid-cols-1",
                      )}
                    >
                      {pages[pageIndex].imageUrls!.map((src) => (
                        <img
                          key={src}
                          src={src}
                          alt=""
                          loading="lazy"
                          className="w-full rounded-md border border-border bg-white"
                        />
                      ))}
                    </div>
                  )}
                  {pages[pageIndex]?.videoUrl && (
                    <a
                      href={pages[pageIndex].videoUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm font-medium text-primary hover:bg-primary/10"
                    >
                      <PlayCircle className="h-5 w-5 shrink-0" />
                      Watch instructional video
                    </a>
                  )}
                  {pages[pageIndex]?.attachmentUrl && (
                    <a
                      href={pages[pageIndex].attachmentUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated p-3 text-sm font-medium hover:bg-secondary"
                    >
                      <FileDown className="h-5 w-5 shrink-0 text-primary" />
                      Download {pages[pageIndex]?.attachmentName || "worksheet"}
                    </a>
                  )}
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
                {quizResult.perfect ? (
                  <Trophy className="h-4 w-4 shrink-0" />
                ) : quizResult.passed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0" />
                )}
                <span>
                  {quizResult.correctCount}/{quizResult.totalQuestions} correct --{" "}
                  {quizResult.perfect
                    ? "perfect score! Gold star earned."
                    : quizResult.passed
                      ? "you passed!"
                      : failLine}
                </span>
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

        <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4 sm:p-6">
          {phase === "reading" && pages.length > 0 && (
            <div className="flex items-center justify-center gap-1.5">
              {pages.map((p, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === pageIndex ? "w-6 bg-primary" : "w-1.5 bg-border",
                  )}
                />
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {phase === "reading" && (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  disabled={pageIndex === 0}
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back
                </Button>
                {pageIndex < pages.length - 1 ? (
                  <Button
                    size="lg"
                    className="flex-1"
                    onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
                  >
                    Next
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="flex-1"
                    onClick={() => completeContentMutation.mutate()}
                    disabled={completeContentMutation.isPending}
                  >
                    {questions.length === 0 && <BookOpen className="h-5 w-5" />}
                    {completeContentMutation.isPending
                      ? "Saving…"
                      : questions.length > 0
                        ? "View Quiz"
                        : "Finish Reading"}
                    {questions.length > 0 && <ArrowRight className="h-5 w-5" />}
                  </Button>
                )}
              </>
            )}

            {phase === "quiz" && !quizResult && (
              <Button
                size="lg"
                className="ml-auto"
                onClick={() => submitQuizMutation.mutate()}
                disabled={!allAnswered || submitQuizMutation.isPending}
              >
                {submitQuizMutation.isPending ? "Submitting…" : "Submit Quiz"}
              </Button>
            )}

            {phase === "quiz" && quizResult && !quizResult.passed && (
              <Button
                size="lg"
                className="ml-auto"
                variant="secondary"
                onClick={() => {
                  setSelectedAnswers({});
                  setQuizResult(null);
                  setFailLine("");
                }}
              >
                Try Again
              </Button>
            )}

            {phase === "quiz" && quizResult && quizResult.passed && alreadyActive && (
              <Button size="lg" className="ml-auto" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}

            {phase === "quiz" && quizResult && quizResult.passed && !alreadyActive && (
              <Button size="lg" className="ml-auto" onClick={() => setPhase("ready")}>
                Continue
                <ArrowRight className="h-5 w-5" />
              </Button>
            )}

            {phase === "ready" && (
              <Button
                size="lg"
                className="ml-auto"
                onClick={() => activateMutation.mutate()}
                disabled={activateMutation.isPending}
              >
                <CalendarPlus className="h-5 w-5" />
                {activateMutation.isPending ? "Adding…" : "Add to Calendar"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
