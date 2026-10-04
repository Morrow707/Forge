import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUIZ_QUESTION_TYPES, type QuizQuestionType, type QuizQuestionPayload } from "@shared/class-quiz-grading";
import type { ClassReadingLevel } from "@shared/class-reading-level";

/** THE ONE QUIZ AND FLASHCARD AUTHORING SURFACE (2026-10-04). Written for the class builder,
 * moved here the same day so the Coaches Corner track builder draws the same editors: four
 * question shapes, the typed-lists-to-wire conversion, and "draft from this lesson" against
 * the lesson's own text. A page that renders these holds the local shapes below and converts
 * on save with quizPayloadFromLocal. The draft routes take pages of text, so a track lesson
 * (one content string) is sent as one page. */

export type LessonTextPage = { title?: string; body: string };

export type LocalQuizAnswer = {
  key: string;
  id?: number;
  answerText: string;
  isCorrect: boolean;
  explanation: string;
};
export type LocalQuizQuestion = {
  key: string;
  id?: number;
  questionText: string;
  questionType: QuizQuestionType;
  answers: LocalQuizAnswer[];
  /** fill_blank: accepted answers, one per line. */
  acceptedText: string;
  /** ordering: the items in the correct order, one per line. */
  itemsText: string;
  /** matching: the pairs in order. */
  pairs: { key: string; left: string; right: string }[];
  /** Shown after grading on the three non-multiple-choice shapes. */
  explanation: string;
};

/** The builder keeps the typed lists as text; this is the one conversion to the wire shape. */
export function quizPayloadFromLocal(q: LocalQuizQuestion): QuizQuestionPayload | null {
  const lines = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
  const explanation = q.explanation.trim() || undefined;
  switch (q.questionType) {
    case "fill_blank":
      return { accepted: lines(q.acceptedText), explanation };
    case "ordering":
      return { items: lines(q.itemsText), explanation };
    case "matching":
      return { pairs: q.pairs.map((p) => ({ left: p.left.trim(), right: p.right.trim() })).filter((p) => p.left && p.right), explanation };
    default:
      return null;
  }
}

export function localQuizQuestionFrom(q: any): LocalQuizQuestion {
  const payload = (q.payload ?? null) as QuizQuestionPayload | null;
  return {
    key: uid(),
    id: q.id,
    questionText: q.questionText,
    questionType: (q.questionType ?? "multiple_choice") as QuizQuestionType,
    answers: ((q.answers ?? []) as any[]).map((a: any) => ({
      key: uid(),
      id: a.id,
      answerText: a.answerText,
      isCorrect: Boolean(a.isCorrect),
      explanation: a.explanation ?? "",
    })),
    acceptedText: (payload?.accepted ?? []).join("\n"),
    itemsText: (payload?.items ?? []).join("\n"),
    pairs: (payload?.pairs ?? []).map((p) => ({ key: uid(), left: p.left, right: p.right })),
    explanation: payload?.explanation ?? "",
  };
}
export type LocalFlashcard = { key: string; front: string; back: string };

export function uid() {
  return crypto.randomUUID();
}

export function makeQuizQuestion(questionType: QuizQuestionType = "multiple_choice"): LocalQuizQuestion {
  return {
    key: uid(),
    questionText: "",
    questionType,
    answers:
      questionType === "multiple_choice"
        ? [0, 1, 2, 3].map((i) => ({ key: uid(), answerText: "", isCorrect: i === 0, explanation: "" }))
        : [],
    acceptedText: "",
    itemsText: "",
    pairs: questionType === "matching" ? [0, 1, 2].map(() => ({ key: uid(), left: "", right: "" })) : [],
    explanation: "",
  };
}

/** Off by default. When on, cards are typed here or drafted from this lesson's own pages
 * (the only thing the draft reads), then edited before saving. */
export function FlashcardsEditor({
  enabled,
  cards,
  pages,
  readingLevel,
  onToggle,
  onChange,
}: {
  /** Omit for a surface with no on/off switch (a Coaches Corner lesson): cards are the switch. */
  enabled?: boolean;
  cards: LocalFlashcard[];
  pages: LessonTextPage[];
  readingLevel: ClassReadingLevel | null;
  onToggle?: (enabled: boolean) => void;
  onChange: (updater: (cards: LocalFlashcard[]) => LocalFlashcard[]) => void;
}) {
  const draft = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/classes/lesson-flashcards/draft", {
        pages: pages.filter((p) => p.body.trim()).map((p) => ({ title: p.title?.trim() || undefined, body: p.body })),
        count: 10,
        readingLevel,
      });
      return res.json() as Promise<{ cards: { front: string; back: string }[] }>;
    },
    onSuccess: ({ cards: drafted }) => {
      if (drafted.length === 0) {
        toast.info("The pages are too short to draft cards from. Write the lesson first.");
        return;
      }
      onChange((prev) => [...prev, ...drafted.map((c) => ({ key: uid(), front: c.front, back: c.back }))]);
      toast.success(`${drafted.length} cards drafted from this lesson. Read them before saving.`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't draft cards"),
  });
  const hasPages = pages.some((p) => p.body.trim().length > 0);
  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      {onToggle ? (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={Boolean(enabled)} onCheckedChange={(c) => onToggle(Boolean(c))} />
          Give this lesson flashcards
        </label>
      ) : (
        <p className="text-sm font-semibold">Flashcards</p>
      )}
      {(onToggle ? enabled : true) && (
        <>
          {cards.map((c, i) => (
            <div key={c.key} className="flex items-start gap-2 rounded border border-border/60 p-1.5">
              <span className="mt-2 w-5 shrink-0 text-[10px] font-semibold text-muted-foreground">{i + 1}</span>
              <div className="flex-1 space-y-1">
                <Input
                  value={c.front}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChange((prev) => prev.map((x) => (x.key === c.key ? { ...x, front: val } : x)));
                  }}
                  placeholder="Front: the prompt or question"
                  className="h-8 text-sm"
                  maxLength={300}
                />
                <Textarea
                  value={c.back}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChange((prev) => prev.map((x) => (x.key === c.key ? { ...x, back: val } : x)));
                  }}
                  placeholder="Back: the answer, a sentence or two"
                  rows={2}
                  className="text-xs"
                  maxLength={600}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove card ${i + 1}`}
                onClick={() => onChange((prev) => prev.filter((x) => x.key !== c.key))}
                className="mt-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => onChange((prev) => [...prev, { key: uid(), front: "", back: "" }])}>
              <Plus className="h-3.5 w-3.5" />
              Add card
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => draft.mutate()}
              disabled={draft.isPending || !hasPages}
              title={hasPages ? "Ten cards from this lesson's pages, for you to edit" : "Write the reading pages first"}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {draft.isPending ? "Drafting..." : "Draft from this lesson"}
            </Button>
          </div>
          {cards.length === 0 && <p className="text-[11px] text-muted-foreground">No cards yet. The reader sees no review step until there is at least one.</p>}
        </>
      )}
    </div>
  );
}

export const QUIZ_TYPE_LABELS: Record<QuizQuestionType, string> = {
  multiple_choice: "Multiple choice",
  fill_blank: "Fill in the blank",
  ordering: "Put in order",
  matching: "Match the pairs",
};

export function QuizEditor({
  questions,
  pages,
  readingLevel,
  onChange,
}: {
  questions: LocalQuizQuestion[];
  pages: LessonTextPage[];
  readingLevel: ClassReadingLevel | null;
  onChange: (updater: (questions: LocalQuizQuestion[]) => LocalQuizQuestion[]) => void;
}) {
  const patch = (key: string, p: Partial<LocalQuizQuestion>) =>
    onChange((prev) => prev.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const draft = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/classes/lesson-quiz/draft", {
        pages: pages.filter((p) => p.body.trim()).map((p) => ({ title: p.title?.trim() || undefined, body: p.body })),
        count: 6,
        readingLevel,
      });
      return res.json() as Promise<{ questions: any[] }>;
    },
    onSuccess: ({ questions: drafted }) => {
      if (drafted.length === 0) {
        toast.info("The pages are too short to draft a quiz from. Write the lesson first.");
        return;
      }
      onChange((prev) => [...prev, ...drafted.map((q) => ({ ...localQuizQuestionFrom(q), id: undefined }))]);
      toast.success(`${drafted.length} questions drafted from this lesson. Check every answer key before saving.`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't draft a quiz"),
  });
  const hasPages = pages.some((p) => p.body.trim().length > 0);
  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={q.key} className="space-y-2 rounded-md border border-border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Question {qi + 1}
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={q.questionType}
                onValueChange={(v) => {
                  const questionType = v as QuizQuestionType;
                  onChange((prev) =>
                    prev.map((x) => {
                      if (x.key !== q.key) return x;
                      const fresh = makeQuizQuestion(questionType);
                      return {
                        ...x,
                        questionType,
                        answers: questionType === "multiple_choice" && x.answers.length === 0 ? fresh.answers : x.answers,
                        pairs: questionType === "matching" && x.pairs.length === 0 ? fresh.pairs : x.pairs,
                      };
                    }),
                  );
                }}
              >
                <SelectTrigger className="h-7 w-[150px] text-xs" aria-label="Question type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUIZ_QUESTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {QUIZ_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            <button
              type="button"
              aria-label={`Remove question ${qi + 1}`}
              onClick={() => onChange((prev) => prev.filter((x) => x.key !== q.key))}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            </div>
          </div>
          <Textarea
            value={q.questionText}
            onChange={(e) => {
              const val = e.target.value;
              onChange((prev) => prev.map((x) => (x.key === q.key ? { ...x, questionText: val } : x)));
            }}
            rows={2}
            placeholder={q.questionType === "fill_blank" ? "Question text, with the blank written as ___" : "Question text"}
            className="text-sm"
          />
          {q.questionType === "fill_blank" && (
            <Textarea
              value={q.acceptedText}
              onChange={(e) => patch(q.key, { acceptedText: e.target.value })}
              rows={2}
              placeholder={"Accepted answers, one per line (case and punctuation don't matter)"}
              className="text-xs"
            />
          )}
          {q.questionType === "ordering" && (
            <Textarea
              value={q.itemsText}
              onChange={(e) => patch(q.key, { itemsText: e.target.value })}
              rows={4}
              placeholder={"The steps in the CORRECT order, one per line. The athlete sees them shuffled."}
              className="text-xs"
            />
          )}
          {q.questionType === "matching" && (
            <div className="space-y-1.5">
              {q.pairs.map((p, pi) => (
                <div key={p.key} className="flex items-center gap-1.5">
                  <Input
                    value={p.left}
                    onChange={(e) => {
                      const val = e.target.value;
                      patch(q.key, { pairs: q.pairs.map((y) => (y.key === p.key ? { ...y, left: val } : y)) });
                    }}
                    placeholder="Left"
                    className="h-8 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Input
                    value={p.right}
                    onChange={(e) => {
                      const val = e.target.value;
                      patch(q.key, { pairs: q.pairs.map((y) => (y.key === p.key ? { ...y, right: val } : y)) });
                    }}
                    placeholder="Right"
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    aria-label={`Remove pair ${pi + 1}`}
                    onClick={() => patch(q.key, { pairs: q.pairs.filter((y) => y.key !== p.key) })}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => patch(q.key, { pairs: [...q.pairs, { key: uid(), left: "", right: "" }] })}
              >
                <Plus className="h-3.5 w-3.5" />
                Add pair
              </Button>
            </div>
          )}
          {q.questionType !== "multiple_choice" && (
            <Input
              value={q.explanation}
              onChange={(e) => patch(q.key, { explanation: e.target.value })}
              placeholder="Explanation shown after the athlete answers (optional)"
              className="h-8 text-xs"
            />
          )}
          <div className={cn("space-y-1.5", q.questionType !== "multiple_choice" && "hidden")}>
            {q.answers.map((a) => (
              <div key={a.key} className="flex items-start gap-2 rounded border border-border/60 p-1.5">
                <button
                  type="button"
                  aria-label="Mark this the correct answer"
                  aria-pressed={a.isCorrect}
                  onClick={() =>
                    onChange((prev) =>
                      prev.map((x) =>
                        x.key === q.key
                          ? { ...x, answers: x.answers.map((y) => ({ ...y, isCorrect: y.key === a.key })) }
                          : x,
                      ),
                    )
                  }
                  className={cn(
                    "mt-2 h-3.5 w-3.5 shrink-0 rounded-full border-2",
                    a.isCorrect ? "border-teal-500 bg-teal-500" : "border-muted-foreground",
                  )}
                />
                <div className="flex-1 space-y-1">
                  <Input
                    value={a.answerText}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange((prev) =>
                        prev.map((x) =>
                          x.key === q.key
                            ? {
                                ...x,
                                answers: x.answers.map((y) =>
                                  y.key === a.key ? { ...y, answerText: val } : y,
                                ),
                              }
                            : x,
                        ),
                      );
                    }}
                    placeholder="Answer choice"
                    className="h-8 text-sm"
                  />
                  <Input
                    value={a.explanation}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange((prev) =>
                        prev.map((x) =>
                          x.key === q.key
                            ? {
                                ...x,
                                answers: x.answers.map((y) =>
                                  y.key === a.key ? { ...y, explanation: val } : y,
                                ),
                              }
                            : x,
                        ),
                      );
                    }}
                    placeholder="Explanation shown after the athlete answers"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => onChange((prev) => [...prev, makeQuizQuestion()])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Question
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={!hasPages || draft.isPending}
          onClick={() => draft.mutate()}
          title={hasPages ? undefined : "Write the lesson's pages first"}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {draft.isPending ? "Drafting..." : "Draft quiz from this lesson"}
        </Button>
      </div>
    </div>
  );
}
