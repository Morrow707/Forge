import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, Lock, GraduationCap, CheckCircle2, Circle, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AcademyQuiz } from "@/components/academy-quiz";

type TrackSummary = {
  id: number;
  title: string;
  description: string;
  lessonCount: number;
  unlocked: boolean;
};

type LessonDetail = {
  id: number;
  lessonNumber: number;
  title: string;
  content?: string;
  estMinutes?: number | null;
  completed?: boolean;
};

type QuizAnswerDetail = { id: number; answerText: string; isCorrect: boolean; explanation: string };
type QuizQuestionDetail = { id: number; questionText: string; answers: QuizAnswerDetail[] };

type TrackDetail = {
  id: number;
  title: string;
  description: string;
  unlocked: boolean;
  lessons: LessonDetail[];
  quizQuestions?: QuizQuestionDetail[];
};

/** Admin-authored coach education -- a single paywalled bundle (see
 * hasCoachesCornerAccess in routes.ts). The catalog itself is always
 * visible so a locked coach still sees a real teaser, not an empty page;
 * lesson content only comes through once unlocked. */
type TrackSort = "unlocked" | "title";
const TRACK_SORT_OPTIONS: { value: TrackSort; label: string }[] = [
  { value: "unlocked", label: "Unlocked first" },
  { value: "title", label: "Title" },
];

export default function CoachesCorner() {
  const qc = useQueryClient();
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [sort, setSort] = useState<TrackSort>("unlocked");

  const { data: tracks = [], isLoading } = useQuery<TrackSummary[]>({
    queryKey: ["/api/coach/academy/tracks"],
    queryFn: () => getJson("/api/coach/academy/tracks"),
  });

  const { data: trackDetail } = useQuery<TrackDetail>({
    queryKey: [`/api/coach/academy/tracks/${selectedTrackId}`],
    queryFn: () => getJson(`/api/coach/academy/tracks/${selectedTrackId}`),
    enabled: selectedTrackId != null,
  });

  const unlockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/academy/unlock", {});
      return res.json();
    },
    onError: (err: ApiError) => {
      if (err.status === 402) {
        toast.info(err.message || "Coaches Corner isn't open for purchase yet.");
      } else {
        toast.error(err.message || "Could not unlock Coaches Corner");
      }
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ lessonId, completed }: { lessonId: number; completed: boolean }) => {
      await apiRequest("POST", `/api/coach/academy/lessons/${lessonId}/complete`, { completed });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/coach/academy/tracks/${selectedTrackId}`] });
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

  const anyUnlocked = tracks.some((t) => t.unlocked);
  const selectedLesson = trackDetail?.lessons.find((l) => l.id === selectedLessonId) ?? null;

  if (selectedLesson && trackDetail) {
    return (
      <AppShell
        title={selectedLesson.title}
        actions={
          <Button variant="outline" onClick={() => setSelectedLessonId(null)}>
            <ArrowLeft className="h-4 w-4" />
            Back to {trackDetail.title}
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
            {(selectedLesson.content || "").split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold">
            <Checkbox
              checked={!!selectedLesson.completed}
              onCheckedChange={(checked) =>
                completeMutation.mutate({ lessonId: selectedLesson.id, completed: !!checked })
              }
            />
            Mark as read
          </label>
        </div>
      </AppShell>
    );
  }

  if (selectedTrackId && trackDetail) {
    const completedCount = trackDetail.lessons.filter((l) => l.completed).length;
    return (
      <AppShell
        title={trackDetail.title}
        actions={
          <Button variant="outline" onClick={() => setSelectedTrackId(null)}>
            <ArrowLeft className="h-4 w-4" />
            Back to Coaches Corner
          </Button>
        }
      >
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{trackDetail.description}</p>
        <p className="mb-4 text-xs font-semibold uppercase text-muted-foreground">
          {completedCount}/{trackDetail.lessons.length} read
        </p>
        <div className="space-y-2">
          {trackDetail.lessons.map((lesson) => (
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
        <AcademyQuiz questions={trackDetail.quizQuestions ?? []} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Coaches Corner">
      {!anyUnlocked && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold uppercase tracking-wide">
                Level up your own coaching
              </h2>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              CSCS-aligned strength science, Olympic lift coaching progressions, youth development,
              sport-specific arm care, reading Forge's own analytics, season planning, and team
              culture -- a real coach-education curriculum, for coaches who want to go deeper.
            </p>
            <Button onClick={() => unlockMutation.mutate()} disabled={unlockMutation.isPending}>
              Unlock Coaches Corner
            </Button>
          </CardContent>
        </Card>
      )}
      {tracks.length > 1 && (
        <div className="mb-4 flex items-center gap-1 rounded-md bg-secondary p-1">
          {TRACK_SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSort(opt.value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                sort === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...tracks]
          .sort((a, b) => {
            if (sort === "unlocked") {
              if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
              return a.title.localeCompare(b.title);
            }
            return a.title.localeCompare(b.title);
          })
          .map((track) => (
          <Card
            key={track.id}
            className={cn(
              "transition-colors",
              track.unlocked ? "cursor-pointer hover:border-primary/50" : "opacity-80",
            )}
            onClick={() => track.unlocked && setSelectedTrackId(track.id)}
          >
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold uppercase tracking-wide">
                  {track.title}
                </h3>
                {track.unlocked ? (
                  <Badge variant="success" className="shrink-0 gap-1 text-[10px]">
                    <Unlock className="h-2.5 w-2.5" />
                    UNLOCKED
                  </Badge>
                ) : (
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">{track.description}</p>
              <Badge variant="secondary" className="w-fit">
                {track.lessonCount} lessons
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
