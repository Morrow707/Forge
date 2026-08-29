import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AcademyQuiz } from "@/components/academy-quiz";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Circle, Pencil, Plus } from "lucide-react";

type Lesson = {
  id: number;
  lessonNumber: number;
  title: string;
  content: string;
  estMinutes: number | null;
  completed: boolean;
};

type QuizAnswer = { id: number; answerText: string; isCorrect: boolean; explanation: string };
type QuizQuestion = { id: number; questionText: string; answers: QuizAnswer[] };

type Track = {
  id: number;
  title: string;
  description: string;
  keyPrinciplesForAi: string;
  lessons: Lesson[];
  quizQuestions: QuizQuestion[];
};

/** Admin's own view of Coaches Corner -- always full content, no paywall
 * check (admins are the ones curating it; see the coach-facing block in
 * routes.ts for the locked/unlocked catalog a regular coach sees).
 * Reading/browsing happens here; creating and editing a track's structure
 * (lessons + quiz) happens on academy-track-builder.tsx, reached via the
 * New Track / pencil buttons below. */
export default function AdminCoachesCorner() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);

  const { data: tracks = [], isLoading } = useQuery<Track[]>({
    queryKey: ["/api/admin/academy/tracks"],
    queryFn: () => getJson("/api/admin/academy/tracks"),
  });

  const completeMutation = useMutation({
    mutationFn: async ({ lessonId, checked }: { lessonId: number; checked: boolean }) => {
      await apiRequest("POST", `/api/admin/academy/lessons/${lessonId}/complete`, { completed: checked });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/academy/tracks"] });
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Could not update lesson");
    },
  });

  if (isLoading) {
    return (
      <AppShell title="Coaches Corner">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? null;
  const selectedLesson = selectedTrack?.lessons.find((l) => l.id === selectedLessonId) ?? null;

  if (selectedLesson && selectedTrack) {
    return (
      <AppShell
        title={selectedLesson.title}
        actions={
          <Button variant="outline" onClick={() => setSelectedLessonId(null)}>
            <ArrowLeft className="h-4 w-4" />
            Back to {selectedTrack.title}
          </Button>
        }
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {selectedLesson.estMinutes != null && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              ~{selectedLesson.estMinutes} min read
            </p>
          )}
          <div className="space-y-4 text-sm leading-relaxed text-foreground">
            {selectedLesson.content.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold">
            <Checkbox
              checked={selectedLesson.completed}
              onCheckedChange={(checked) =>
                completeMutation.mutate({ lessonId: selectedLesson.id, checked: !!checked })
              }
            />
            Mark as read
          </label>
        </div>
      </AppShell>
    );
  }

  if (selectedTrack) {
    return (
      <AppShell
        title={selectedTrack.title}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/admin/academy-tracks/${selectedTrack.id}`)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setSelectedTrackId(null)}>
              <ArrowLeft className="h-4 w-4" />
              Back to Coaches Corner
            </Button>
          </div>
        }
      >
        <p className="mb-6 max-w-2xl text-sm text-muted-foreground">{selectedTrack.description}</p>
        <div className="space-y-2">
          {selectedTrack.lessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => setSelectedLessonId(lesson.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-surface-elevated"
            >
              <span className="flex items-center gap-2">
                {lesson.completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-semibold">
                  {lesson.lessonNumber}. {lesson.title}
                </span>
              </span>
              {lesson.estMinutes != null && (
                <span className="shrink-0 text-xs text-muted-foreground">{lesson.estMinutes} min</span>
              )}
            </button>
          ))}
        </div>
        <AcademyQuiz questions={selectedTrack.quizQuestions} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Coaches Corner"
      actions={
        <Button onClick={() => navigate("/admin/academy-tracks/new")}>
          <Plus className="h-4 w-4" />
          New Lesson
        </Button>
      }
    >
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Coach-education content -- what a regular coach sees as a locked, paywalled catalog (see the
        Coaches Corner nav item next to the account menu). Click a track to read it, or the pencil to
        edit its lessons and quiz.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tracks.map((track) => (
          <Card key={track.id} className="transition-colors hover:border-primary/50">
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTrackId(track.id)}
                  className="text-left font-display text-base font-bold uppercase tracking-wide hover:text-primary"
                >
                  {track.title}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => navigate(`/admin/academy-tracks/${track.id}`)}
                  aria-label={`Edit ${track.title}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{track.description}</p>
              <div className="flex gap-1.5">
                <Badge variant="secondary" className="w-fit">
                  {track.lessons.length} lessons
                </Badge>
                <Badge variant="outline" className="w-fit">
                  {track.quizQuestions.length} quiz Qs
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
