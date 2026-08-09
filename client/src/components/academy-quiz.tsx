import { useState } from "react";
import { CheckCircle2, XCircle, Circle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type QuizAnswer = {
  id: number;
  answerText: string;
  isCorrect: boolean;
  explanation: string;
};

type QuizQuestion = {
  id: number;
  questionText: string;
  answers: QuizAnswer[];
};

/** A self-check quiz, not a scored exam -- no attempt/score is ever saved.
 * Every answer is independently expandable at any time (not just the one
 * picked first), each with its own explanation of why it's right or wrong,
 * so a coach can work through every option to actually understand the
 * material instead of just learning which letter was correct. */
export function AcademyQuiz({ questions }: { questions: QuizQuestion[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (questions.length === 0) return null;

  function toggle(answerId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(answerId)) next.delete(answerId);
      else next.add(answerId);
      return next;
    });
  }

  return (
    <div className="mt-8 border-t border-border pt-6">
      <h2 className="mb-1 font-display text-lg font-bold uppercase tracking-wide">Track Quiz</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        A self-check, not a scored test -- tap any answer to see why it's right or wrong, then try
        the others.
      </p>
      <div className="space-y-6">
        {questions.map((q, qi) => (
          <div key={q.id}>
            <p className="mb-2 font-semibold">
              {qi + 1}. {q.questionText}
            </p>
            <div className="space-y-1.5">
              {q.answers.map((a) => {
                const isOpen = expanded.has(a.id);
                return (
                  <div key={a.id} className="overflow-hidden rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-elevated"
                    >
                      {isOpen ? (
                        a.isCorrect ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                        )
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1">{a.answerText}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {isOpen && (
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
          </div>
        ))}
      </div>
    </div>
  );
}
