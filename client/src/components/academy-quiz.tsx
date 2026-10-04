import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Circle, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { ACADEMY_QUIZ_PASS_MARK } from "@shared/academy-quiz";
import {
  gradeQuestion,
  isAnswered,
  type QuizQuestionPayload,
  type QuizQuestionType,
  type QuizSubmission,
} from "@shared/class-quiz-grading";
import { FillBlankInput, OrderingInput, MatchingInput, QuizKeyResult } from "@/components/quiz-question-inputs";
import { toast } from "sonner";

type QuizAnswer = {
  id: number;
  answerText: string;
  isCorrect: boolean;
  explanation: string;
};

type QuizQuestion = {
  id: number;
  questionText: string;
  questionType?: QuizQuestionType;
  /** Before grading: the shuffled, key-free payload the server sends. In the admin preview the
   * full key, which is what lets the preview grade in the browser. */
  payload?: QuizQuestionPayload | null;
  answers: QuizAnswer[];
};

export type QuizAttemptSummary = { correct: number; total: number; passed: boolean; completedAt: string | Date };

type QuestionResult = {
  questionId: number;
  questionType?: QuizQuestionType;
  pickedAnswerId: number | null;
  correctAnswerId: number | null;
  submitted?: QuizSubmission | null;
  /** The key, handed back only after grading, for the three non-multiple-choice shapes. */
  payload?: QuizQuestionPayload | null;
  correct: boolean;
};

type AttemptResult = {
  correct: number;
  total: number;
  passed: boolean;
  results: QuestionResult[];
  best: QuizAttemptSummary | null;
};

/** The track quiz, scored (2026-10-03), in four shapes (2026-10-04, the same four the class
 * quizzes have). A coach answers each question in its own kind and submits; the SERVER grades
 * against the stored key and keeps the attempt, so a score is a record and not a claim. After
 * submitting, a multiple-choice answer's explanation opens on tap, as before, and the other
 * shapes show the key beside what was given. Retake as often as wanted; the best counts. */
export function AcademyQuiz({
  trackId,
  questions,
  bestAttempt,
  onAttempt,
  preview = false,
}: {
  trackId: number;
  questions: QuizQuestion[];
  bestAttempt: QuizAttemptSummary | null;
  onAttempt?: () => void;
  /** The admin's own preview of a track: graded here against the key the admin already holds,
   * nothing recorded, so an admin checking their questions does not write attempts against
   * their account. */
  preview?: boolean;
}) {
  const [subs, setSubs] = useState<Record<number, QuizSubmission>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function setSubmission(questionId: number, patch: Partial<QuizSubmission>) {
    setSubs((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] ?? { questionId }), questionId, ...patch } }));
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (preview) {
        const results: QuestionResult[] = questions.map((q) => {
          const sub = subs[q.id];
          const questionType = q.questionType ?? "multiple_choice";
          const correctAnswer = q.answers.find((a) => a.isCorrect) ?? null;
          return {
            questionId: q.id,
            questionType,
            pickedAnswerId: sub?.answerId ?? null,
            correctAnswerId: correctAnswer?.id ?? null,
            submitted: sub ?? null,
            payload: questionType === "multiple_choice" ? null : (q.payload ?? null),
            correct: gradeQuestion({ id: q.id, questionType, payload: q.payload ?? null, answers: q.answers }, sub),
          };
        });
        const correct = results.filter((r) => r.correct).length;
        const total = questions.length;
        return { correct, total, passed: total > 0 && correct / total >= ACADEMY_QUIZ_PASS_MARK, results, best: null } satisfies AttemptResult;
      }
      const res = await apiRequest("POST", `/api/coach/academy/tracks/${trackId}/quiz-attempt`, {
        answers: Object.values(subs),
      });
      return res.json() as Promise<AttemptResult>;
    },
    onSuccess: (r) => {
      setResult(r);
      setExpanded(new Set());
      onAttempt?.();
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't score the quiz"),
  });

  if (questions.length === 0) return null;

  function toggle(answerId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(answerId)) next.delete(answerId);
      else next.add(answerId);
      return next;
    });
  }

  const answered = questions.filter((q) => isAnswered({ questionType: q.questionType ?? "multiple_choice", payload: q.payload ?? null }, subs[q.id])).length;
  const passMarkPct = Math.round(ACADEMY_QUIZ_PASS_MARK * 100);

  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide">Track Quiz</h2>
        {bestAttempt && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              bestAttempt.passed ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground",
            )}
          >
            Best: {bestAttempt.correct}/{bestAttempt.total}
            {bestAttempt.passed ? ", passed" : ""}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {result
          ? `You scored ${result.correct} of ${result.total}${result.passed ? ", which passes." : `. ${passMarkPct}% passes; retake when you're ready.`} Tap a multiple-choice answer to see why.`
          : `Answer every question and submit. ${passMarkPct}% passes, and your best score is kept.`}
      </p>
      <div className="space-y-6">
        {questions.map((q, qi) => {
          const r = result?.results.find((x) => x.questionId === q.id);
          const type = q.questionType ?? "multiple_choice";
          const sub = subs[q.id];
          return (
            <div key={q.id}>
              {type === "fill_blank" && !result ? (
                <div className="mb-2 flex gap-2 font-semibold">
                  <span>{qi + 1}.</span>
                  <div className="min-w-0 flex-1 font-normal">
                    <FillBlankInput questionText={q.questionText} value={sub?.text ?? ""} onChange={(text) => setSubmission(q.id, { text })} />
                  </div>
                </div>
              ) : (
                <p className="mb-2 flex items-start gap-2 font-semibold">
                  {r && (r.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />)}
                  <span>
                    {qi + 1}. {q.questionText}
                  </span>
                </p>
              )}
              {type === "multiple_choice" && (
                <div className="space-y-1.5">
                  {q.answers.map((a) => {
                    const isOpen = expanded.has(a.id);
                    const picked = (result ? r?.pickedAnswerId : sub?.answerId) === a.id;
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "overflow-hidden rounded-md border",
                          !result && picked ? "border-primary" : "border-border",
                          result && a.isCorrect && "border-success/60",
                          result && picked && !a.isCorrect && "border-destructive/60",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => (result ? toggle(a.id) : setSubmission(q.id, { answerId: a.id }))}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-elevated"
                        >
                          {result ? (
                            a.isCorrect ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                            ) : picked ? (
                              <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                            ) : (
                              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )
                          ) : picked ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="flex-1">{a.answerText}</span>
                          {result && (
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                isOpen && "rotate-180",
                              )}
                            />
                          )}
                        </button>
                        {result && isOpen && (
                          <div
                            className={cn(
                              "border-t px-3 py-2 text-sm",
                              a.isCorrect
                                ? "border-success/30 bg-success/5 text-success"
                                : "border-destructive/30 bg-destructive/5 text-destructive",
                            )}
                          >
                            {a.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {type === "ordering" && !result && (
                <OrderingInput payload={q.payload ?? null} value={sub?.order} onChange={(order) => setSubmission(q.id, { order })} />
              )}
              {type === "matching" && !result && (
                <MatchingInput payload={q.payload ?? null} value={sub?.matches} onChange={(matches) => setSubmission(q.id, { matches })} />
              )}
              {type !== "multiple_choice" && result && r && (
                <QuizKeyResult result={{ questionType: type, payload: r.payload ?? null, submitted: r.submitted ?? null, isCorrect: r.correct }} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex items-center gap-3">
        {result ? (
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setSubs({});
              setExpanded(new Set());
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Retake
          </Button>
        ) : (
          <>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || answered === 0}>
              {submit.isPending ? "Scoring..." : "Submit answers"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {answered}/{questions.length} answered
            </span>
          </>
        )}
      </div>
    </div>
  );
}
