import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save } from "lucide-react";

type LessonForm = {
  id?: number;
  lessonNumber: number;
  title: string;
  content: string;
  estMinutes: number | null;
};
type AnswerForm = { id?: number; orderIndex: number; answerText: string; isCorrect: boolean; explanation: string };
type QuestionForm = { id?: number; orderIndex: number; questionText: string; answers: AnswerForm[] };

type TrackFull = {
  id: number;
  title: string;
  description: string;
  keyPrinciplesForAi: string;
  orderIndex: number;
  lessons: LessonForm[];
  quizQuestions: QuestionForm[];
};

function emptyAnswer(orderIndex: number): AnswerForm {
  return { orderIndex, answerText: "", isCorrect: false, explanation: "" };
}
function emptyQuestion(orderIndex: number): QuestionForm {
  return {
    orderIndex,
    questionText: "",
    answers: [emptyAnswer(0), emptyAnswer(1), emptyAnswer(2), emptyAnswer(3)],
  };
}
function emptyLesson(lessonNumber: number): LessonForm {
  return { lessonNumber, title: "", content: "", estMinutes: null };
}

/** Full authoring surface for one Coaches Corner track -- title/description/
 * AI principles, lessons, and its end-of-track quiz. This is the "give the
 * admin access to add content and how they want to set this up" piece: the
 * seed script populated the original 7 tracks, but everything from here on
 * (new tracks, edits, retiring old content) goes through this page instead
 * of a code change. */
export default function AdminAcademyTrackBuilder() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const trackId = isNew ? null : Number(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery<TrackFull>({
    queryKey: [`/api/admin/academy/tracks/${trackId}`],
    queryFn: () => getJson(`/api/admin/academy/tracks/${trackId}`),
    enabled: trackId != null,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keyPrinciplesForAi, setKeyPrinciplesForAi] = useState("");
  const [orderIndex, setOrderIndex] = useState(0);
  const [lessons, setLessons] = useState<LessonForm[]>([]);
  const [questions, setQuestions] = useState<QuestionForm[]>([]);

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setDescription(existing.description);
      setKeyPrinciplesForAi(existing.keyPrinciplesForAi);
      setOrderIndex(existing.orderIndex);
      setLessons(existing.lessons);
      setQuestions(existing.quizQuestions);
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description,
        keyPrinciplesForAi,
        orderIndex,
        lessons: lessons.map((l, i) => ({ ...l, lessonNumber: i + 1 })),
        quizQuestions: questions.map((q, i) => ({
          ...q,
          orderIndex: i,
          answers: q.answers.map((a, ai) => ({ ...a, orderIndex: ai })),
        })),
      };
      const res = isNew
        ? await apiRequest("POST", "/api/admin/academy/tracks", payload)
        : await apiRequest("PUT", `/api/admin/academy/tracks/${trackId}`, payload);
      return res.json();
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/academy/tracks"] });
      toast.success("Saved");
      if (isNew) navigate(`/admin/academy-tracks/${saved.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/academy/tracks/${trackId}`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/academy/tracks"] });
      toast.success("Track deleted");
      navigate("/admin/coaches-corner");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete"),
  });

  if (!isNew && isLoading) {
    return (
      <AppShell title="Loading…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  function moveLesson(index: number, dir: -1 | 1) {
    setLessons((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <AppShell
      title={isNew ? "New Track" : "Edit Track"}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/coaches-corner")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          {!isNew && (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => {
                if (window.confirm(`Delete "${title}"? This removes all its lessons and quiz questions.`)) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      }
    >
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Sports Nutrition Literacy for Coaches"
                />
              </div>
              <div className="w-24 space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Order</label>
                <Input
                  type="number"
                  value={orderIndex}
                  onChange={(e) => setOrderIndex(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Shown on the catalog card, coach- and admin-facing."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Key principles for AI
              </label>
              <Textarea
                value={keyPrinciplesForAi}
                onChange={(e) => setKeyPrinciplesForAi(e.target.value)}
                rows={3}
                placeholder="A concise distillation injected into every AI coach's system prompt alongside every other track's -- not the full lesson text, just the core takeaways."
              />
            </div>
          </CardContent>
        </Card>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">Lessons</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLessons((prev) => [...prev, emptyLesson(prev.length + 1)])}
            >
              <Plus className="h-4 w-4" />
              Add Lesson
            </Button>
          </div>
          <div className="space-y-3">
            {lessons.map((lesson, i) => (
              <Card key={lesson.id ?? `new-${i}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-sm font-semibold text-muted-foreground">#{i + 1}</span>
                    <Input
                      value={lesson.title}
                      onChange={(e) =>
                        setLessons((prev) =>
                          prev.map((l, li) => (li === i ? { ...l, title: e.target.value } : l)),
                        )
                      }
                      placeholder="Lesson title"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={lesson.estMinutes ?? ""}
                      onChange={(e) =>
                        setLessons((prev) =>
                          prev.map((l, li) =>
                            li === i ? { ...l, estMinutes: e.target.value ? Number(e.target.value) : null } : l,
                          ),
                        )
                      }
                      placeholder="min"
                      className="w-20"
                    />
                    <Button size="icon" variant="ghost" onClick={() => moveLesson(i, -1)} disabled={i === 0}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => moveLesson(i, 1)}
                      disabled={i === lessons.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setLessons((prev) => prev.filter((_, li) => li !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    value={lesson.content}
                    onChange={(e) =>
                      setLessons((prev) =>
                        prev.map((l, li) => (li === i ? { ...l, content: e.target.value } : l)),
                      )
                    }
                    rows={6}
                    placeholder="Lesson content -- separate paragraphs with a blank line."
                  />
                </CardContent>
              </Card>
            ))}
            {lessons.length === 0 && <p className="text-sm text-muted-foreground">No lessons yet.</p>}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">Quiz</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuestions((prev) => [...prev, emptyQuestion(prev.length)])}
            >
              <Plus className="h-4 w-4" />
              Add Question
            </Button>
          </div>
          <div className="space-y-3">
            {questions.map((q, qi) => (
              <Card key={q.id ?? `new-${qi}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-sm font-semibold text-muted-foreground">Q{qi + 1}</span>
                    <Input
                      value={q.questionText}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((qq, qqi) => (qqi === qi ? { ...qq, questionText: e.target.value } : qq)),
                        )
                      }
                      placeholder="Question text"
                      className="flex-1"
                    />
                    <Button size="icon" variant="ghost" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => moveQuestion(qi, 1)}
                      disabled={qi === questions.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setQuestions((prev) => prev.filter((_, qqi) => qqi !== qi))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2 pl-4">
                    {q.answers.map((a, ai) => (
                      <div key={a.id ?? `new-${ai}`} className="space-y-1.5 rounded-md border border-border p-2.5">
                        <div className="flex items-center gap-2">
                          <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                            <Checkbox
                              checked={a.isCorrect}
                              onCheckedChange={(checked) =>
                                setQuestions((prev) =>
                                  prev.map((qq, qqi) =>
                                    qqi === qi
                                      ? {
                                          ...qq,
                                          answers: qq.answers.map((aa, aai) => ({
                                            ...aa,
                                            isCorrect: aai === ai ? !!checked : aa.isCorrect,
                                          })),
                                        }
                                      : qq,
                                  ),
                                )
                              }
                            />
                            Correct
                          </label>
                          <Input
                            value={a.answerText}
                            onChange={(e) =>
                              setQuestions((prev) =>
                                prev.map((qq, qqi) =>
                                  qqi === qi
                                    ? {
                                        ...qq,
                                        answers: qq.answers.map((aa, aai) =>
                                          aai === ai ? { ...aa, answerText: e.target.value } : aa,
                                        ),
                                      }
                                    : qq,
                                ),
                              )
                            }
                            placeholder="Answer text"
                            className="flex-1"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="shrink-0 text-destructive"
                            onClick={() =>
                              setQuestions((prev) =>
                                prev.map((qq, qqi) =>
                                  qqi === qi ? { ...qq, answers: qq.answers.filter((_, aai) => aai !== ai) } : qq,
                                ),
                              )
                            }
                            disabled={q.answers.length <= 2}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <Textarea
                          value={a.explanation}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((qq, qqi) =>
                                qqi === qi
                                  ? {
                                      ...qq,
                                      answers: qq.answers.map((aa, aai) =>
                                        aai === ai ? { ...aa, explanation: e.target.value } : aa,
                                      ),
                                    }
                                  : qq,
                              ),
                            )
                          }
                          rows={2}
                          placeholder="Explanation shown when this answer is expanded -- why it's right or wrong."
                        />
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setQuestions((prev) =>
                          prev.map((qq, qqi) =>
                            qqi === qi ? { ...qq, answers: [...qq.answers, emptyAnswer(qq.answers.length)] } : qq,
                          ),
                        )
                      }
                      disabled={q.answers.length >= 6}
                    >
                      <Plus className="h-4 w-4" />
                      Add Answer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {questions.length === 0 && <p className="text-sm text-muted-foreground">No quiz questions yet.</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
