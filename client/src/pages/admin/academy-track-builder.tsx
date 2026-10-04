import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AcademyTrackPhotoImportPanel,
  type PhotoDraftStructure,
} from "@/components/academy-track-photo-import-panel";
import {
  AcademyTrackLibraryDraftPanel,
  formatLessonSource,
  type LessonSource,
  type LibraryDraftStructure,
} from "@/components/academy-track-library-draft-panel";
import { KNOWLEDGE_DOMAINS } from "@shared/knowledge-domains";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save, Eye, BookMarked, X } from "lucide-react";
import { ReadFailed } from "@/components/read-failed";
import {
  FlashcardsEditor,
  QuizEditor,
  localQuizQuestionFrom,
  quizPayloadFromLocal,
  uid,
  type LocalFlashcard,
  type LocalQuizQuestion,
} from "@/components/lesson-quiz-editor";

type LessonForm = {
  id?: number;
  lessonNumber: number;
  title: string;
  content: string;
  estMinutes: number | null;
  sources: LessonSource[];
  flashcards: LocalFlashcard[];
};

type TrackFull = {
  id: number;
  title: string;
  description: string;
  keyPrinciplesForAi: string;
  orderIndex: number;
  lessons: (Omit<LessonForm, "flashcards"> & { flashcards?: { front: string; back: string }[] })[];
  quizQuestions: any[];
};

function emptyLesson(lessonNumber: number): LessonForm {
  return { lessonNumber, title: "", content: "", estMinutes: null, sources: [], flashcards: [] };
}

/** One row in the live preview -- collapsed it's just the read-view list
 * item a coach sees; expanded it shows the same paragraph-split rendering
 * coaches-corner.tsx uses for the actual lesson reader, so a formatting
 * mistake (missing blank line between paragraphs, etc.) is visible before
 * saving instead of only after a coach opens it. */
function LessonPreviewRow({ lesson, index }: { lesson: LessonForm; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
      >
        <span className="min-w-0 flex-1 truncate font-semibold">
          {index + 1}. {lesson.title.trim() || "Untitled lesson"}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {lesson.estMinutes != null && `${lesson.estMinutes} min`}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {lesson.content.trim() ? (
            lesson.content.split("\n\n").map((para, i) => <p key={i}>{para}</p>)
          ) : (
            <p className="italic">No content yet.</p>
          )}
        </div>
      )}
    </div>
  );
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

  const { data: existing, isLoading, isError, refetch } = useQuery<TrackFull>({
    queryKey: [`/api/admin/academy/tracks/${trackId}`],
    queryFn: () => getJson(`/api/admin/academy/tracks/${trackId}`),
    enabled: trackId != null,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keyPrinciplesForAi, setKeyPrinciplesForAi] = useState("");
  const [orderIndex, setOrderIndex] = useState(0);
  const [lessons, setLessons] = useState<LessonForm[]>([]);
  const [questions, setQuestions] = useState<LocalQuizQuestion[]>([]);

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setDescription(existing.description);
      setKeyPrinciplesForAi(existing.keyPrinciplesForAi);
      setOrderIndex(existing.orderIndex);
      setLessons(
        existing.lessons.map((l) => ({
          ...l,
          sources: l.sources ?? [],
          flashcards: (l.flashcards ?? []).map((c) => ({ key: uid(), front: c.front, back: c.back })),
        })),
      );
      setQuestions(existing.quizQuestions.map(localQuizQuestionFrom));
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description,
        keyPrinciplesForAi,
        orderIndex,
        lessons: lessons.map((l, i) => ({
          ...l,
          lessonNumber: i + 1,
          flashcards: l.flashcards.map((c) => ({ front: c.front.trim(), back: c.back.trim() })).filter((c) => c.front && c.back),
        })),
        // The one conversion from the editor's typed lists to the wire shape, shared with the
        // class builder (lesson-quiz-editor.tsx).
        quizQuestions: questions.map((q, i) => ({
          id: q.id,
          orderIndex: i,
          questionText: q.questionText,
          questionType: q.questionType,
          payload: quizPayloadFromLocal(q),
          answers:
            q.questionType === "multiple_choice"
              ? q.answers.map((a, ai) => ({ id: a.id, orderIndex: ai, answerText: a.answerText, isCorrect: a.isCorrect, explanation: a.explanation }))
              : [],
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
      toast.success("Lesson deleted");
      navigate("/admin/coaches-corner");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete"),
  });

  // Further reading for every lesson that has none, from the licensed library. Retrieval
  // only, so it is cheap and attaches nothing where the library has nothing close.
  const citeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/academy/suggest-sources", {
        lessons: lessons.filter((l) => l.title.trim() && l.content.trim()).map((l) => ({
          title: l.title,
          content: l.content,
          sources: l.sources,
        })),
        domains: KNOWLEDGE_DOMAINS.map((d) => d.key),
      });
      return res.json() as Promise<{ sources: LessonSource[][] }>;
    },
    onSuccess: ({ sources }) => {
      let attached = 0;
      setLessons((prev) => {
        let k = 0;
        return prev.map((l) => {
          if (!l.title.trim() || !l.content.trim()) return l;
          const next = sources[k++] ?? l.sources;
          if (next.length > l.sources.length) attached += 1;
          return { ...l, sources: next };
        });
      });
      toast.success(attached > 0 ? `Further reading added to ${attached} lesson${attached === 1 ? "" : "s"}` : "The licensed library has nothing close to these lessons");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't find citations"),
  });

  if (!isNew && isLoading) {
    return (
      <AppShell title="Loading…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  // DESTRUCTIVE IF LEFT ALONE. Editing an existing track hydrates this form from the
  // query in an effect; a failed read means the effect never runs, so title, lessons
  // and quiz questions stay at their empty initial values -- and Save PUTs that whole
  // payload over the track. An admin who opens a track, sees an empty form and presses
  // Save deletes every lesson and question in it. The form does not open until the read
  // lands.
  if (!isNew && isError) {
    return (
      <AppShell title="Coaches Corner Lesson">
        <ReadFailed what="this track" onRetry={() => void refetch()} />
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


  // Only fills title/description/principles if the admin hasn't already
  // typed something -- but always appends the transcribed lessons, so a
  // second photo (another chapter of the same source) adds to what's
  // already there instead of wiping it.
  function handlePhotoDraft(structure: PhotoDraftStructure, note: string | null) {
    setTitle((prev) => prev || structure.title);
    setDescription((prev) => prev || structure.description);
    setKeyPrinciplesForAi((prev) => prev || structure.keyPrinciplesForAi);
    setLessons((prev) => [
      ...prev,
      ...structure.lessons.map((l, i) => ({
        lessonNumber: prev.length + i + 1,
        title: l.title,
        content: l.content,
        estMinutes: l.estMinutes,
        sources: [],
        flashcards: [],
      })),
    ]);
    if (note) toast.info(note, { duration: 10000 });
  }

  // Same shape as the photo draft, plus the quiz and each lesson's further reading.
  function handleLibraryDraft(structure: LibraryDraftStructure, note: string | null) {
    setTitle((prev) => prev || structure.title);
    setDescription((prev) => prev || structure.description);
    setKeyPrinciplesForAi((prev) => prev || structure.keyPrinciplesForAi);
    setLessons((prev) => [
      ...prev,
      ...structure.lessons.map((l, i) => ({
        lessonNumber: prev.length + i + 1,
        title: l.title,
        content: l.content,
        estMinutes: l.estMinutes,
        sources: l.sources ?? [],
        flashcards: [],
      })),
    ]);
    setQuestions((prev) => [...prev, ...structure.quizQuestions.map((q) => ({ ...localQuizQuestionFrom(q), id: undefined }))]);
    if (note) toast.info(note, { duration: 15000 });
  }

  return (
    <AppShell
      title={isNew ? "New Coaches Corner Lesson" : "Edit Coaches Corner Lesson"}
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
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex-1 space-y-6 lg:max-w-3xl">
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
                placeholder="A concise distillation injected into every AI coach's system prompt alongside every other track's, not the full lesson text, just the core takeaways."
              />
            </div>
          </CardContent>
        </Card>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">Lessons</h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => citeMutation.mutate()}
                disabled={citeMutation.isPending || lessons.every((l) => !l.content.trim())}
                title="Attach further reading from the licensed library to lessons that have none"
              >
                <BookMarked className="h-4 w-4" />
                {citeMutation.isPending ? "Finding..." : "Find citations"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLessons((prev) => [...prev, emptyLesson(prev.length + 1)])}
              >
                <Plus className="h-4 w-4" />
                Add Lesson
              </Button>
            </div>
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
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move lesson up"
                      onClick={() => moveLesson(i, -1)}
                      disabled={i === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move lesson down"
                      onClick={() => moveLesson(i, 1)}
                      disabled={i === lessons.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label="Remove lesson"
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
                    placeholder="Lesson content, separate paragraphs with a blank line."
                  />
                  <FlashcardsEditor
                    cards={lesson.flashcards}
                    pages={[{ title: lesson.title, body: lesson.content }]}
                    readingLevel={null}
                    onChange={(updater) =>
                      setLessons((prev) => prev.map((l, li) => (li === i ? { ...l, flashcards: updater(l.flashcards) } : l)))
                    }
                  />
                  {lesson.sources.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Further reading</p>
                      <ul className="space-y-1">
                        {lesson.sources.map((src, si) => (
                          <li key={si} className="flex items-center gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate">{formatLessonSource(src)}</span>
                            <button
                              type="button"
                              aria-label="Remove this source"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setLessons((prev) =>
                                  prev.map((l, li) =>
                                    li === i ? { ...l, sources: l.sources.filter((_, k) => k !== si) } : l,
                                  ),
                                )
                              }
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {lessons.length === 0 && <p className="text-sm text-muted-foreground">No lessons yet.</p>}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">Quiz</h2>
            <p className="text-xs text-muted-foreground">Four shapes: multiple choice, fill in the blank, put in order, match the pairs.</p>
          </div>
          {/* The same editor the class builder uses, drafting against this track's own lessons. */}
          <QuizEditor
            questions={questions}
            pages={lessons.map((l) => ({ title: l.title, body: l.content }))}
            readingLevel={null}
            onChange={(updater) => setQuestions(updater)}
          />
          {questions.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No quiz questions yet.</p>}
        </div>
      </div>

      <div className="w-full space-y-6 lg:sticky lg:top-4 lg:w-80 lg:shrink-0 lg:self-start">
        <AcademyTrackLibraryDraftPanel onDraft={handleLibraryDraft} />
        <AcademyTrackPhotoImportPanel onDraft={handlePhotoDraft} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" />
              Preview
            </CardTitle>
            <CardDescription>What a coach sees, updates as you edit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-wide">
                {title.trim() || "Untitled Lesson"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {description.trim() || "No description yet."}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {lessons.length} lesson{lessons.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {questions.length} quiz Qs
              </Badge>
            </div>
            <div className="space-y-1.5">
              {lessons.length === 0 ? (
                <p className="text-xs text-muted-foreground">No lessons yet.</p>
              ) : (
                lessons.map((lesson, i) => (
                  <LessonPreviewRow key={lesson.id ?? `new-${i}`} lesson={lesson} index={i} />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </AppShell>
  );
}
