import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, Lock, CheckCircle2, PlayCircle, BookOpen, ListChecks, Star, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClassLessonReaderDialog } from "@/components/class-lesson-reader-dialog";

type LessonProgress = {
  id: number;
  lessonNumber: number;
  title: string;
  description: string | null;
  priceCents: number | null;
  hasQuiz: boolean;
  state: "active" | "ready" | "locked_preview" | "locked";
  skillAssignmentId: number | null;
  purchasedAt: string | null;
  contentCompletedAt: string | null;
  quizPassedAt: string | null;
  quizPerfectAt: string | null;
};

type ClassProgress = {
  class: { id: number; name: string; description: string | null; isForgeOfficial: boolean };
  enrolled: boolean;
  startDate?: string;
  completedAt?: string | null;
  lessons: LessonProgress[];
};

export default function AthleteClassDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const classId = Number(id);

  const { data, isLoading } = useQuery<ClassProgress>({
    queryKey: [`/api/athlete/classes/${classId}/progress`],
    queryFn: () => getJson(`/api/athlete/classes/${classId}/progress`),
  });

  const [readerLessonId, setReaderLessonId] = useState<number | null>(null);
  const [readerStartAt, setReaderStartAt] = useState<"reading" | "quiz">("reading");
  const readerLesson = data?.lessons.find((l) => l.id === readerLessonId) ?? null;

  function openReader(lessonId: number, startAt: "reading" | "quiz") {
    setReaderLessonId(lessonId);
    setReaderStartAt(startAt);
  }

  const purchaseMutation = useMutation({
    mutationFn: async (lessonId: number) => {
      const res = await apiRequest("POST", `/api/athlete/classes/${classId}/lessons/${lessonId}/purchase`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/athlete/classes/${classId}/progress`] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/my-classes"] });
      toast.success("Lesson unlocked");
    },
    onError: (err: ApiError) => {
      if (err.status === 402) {
        toast.info(err.message || "Payments aren't live yet -- coming soon.");
      } else {
        toast.error(err.message || "Could not unlock lesson");
      }
    },
  });

  if (isLoading || !data) {
    return (
      <AppShell title="Loading Class…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={data.class.name}
      actions={
        <Button variant="outline" onClick={() => navigate("/athlete/classes")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      }
    >
      {data.class.description && (
        <p className="mb-6 max-w-2xl text-sm text-muted-foreground">{data.class.description}</p>
      )}

      {data.completedAt && (
        <Card className="mb-6 border-amber-400/40 bg-amber-400/5">
          <CardContent className="flex items-center gap-3 p-4">
            <Trophy className="h-8 w-8 shrink-0 fill-amber-400 text-amber-400" />
            <div>
              <p className="font-semibold">Class completed!</p>
              <p className="text-sm text-muted-foreground">
                You've finished every lesson in {data.class.name}.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data.lessons.map((lesson) => {
          const canTakeLesson = lesson.state === "active" || lesson.state === "ready";
          const hasReadOnce = !!lesson.contentCompletedAt;
          return (
            <Card key={lesson.id} className={cn(lesson.state === "locked" && "opacity-60")}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                      lesson.state === "active" || lesson.state === "ready"
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {lesson.state === "active" ? (
                      <PlayCircle className="h-5 w-5" />
                    ) : lesson.state === "ready" ? (
                      <BookOpen className="h-4 w-4" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Lesson {lesson.lessonNumber}</Badge>
                      <p className="font-semibold">{lesson.title}</p>
                      {lesson.quizPerfectAt ? (
                        <span title="Gold star -- perfect quiz score">
                          <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
                        </span>
                      ) : lesson.quizPassedAt ? (
                        <span title="Bronze star -- quiz passed">
                          <Star className="h-4 w-4 shrink-0 fill-amber-700 text-amber-700" />
                        </span>
                      ) : null}
                    </div>
                    {lesson.description && (
                      <p className="mt-1 max-w-xl text-sm text-muted-foreground">{lesson.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 pl-12 sm:pl-0">
                  {lesson.state === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-success hover:text-success"
                      onClick={() => navigate("/athlete/calendar")}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      On your calendar
                    </Button>
                  )}
                  {canTakeLesson && (
                    <Button
                      size="sm"
                      variant={hasReadOnce ? "outline" : "default"}
                      onClick={() => openReader(lesson.id, "reading")}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      {hasReadOnce ? "Take Lesson Again" : "Take Lesson"}
                    </Button>
                  )}
                  {canTakeLesson && hasReadOnce && (
                    <Button size="sm" onClick={() => openReader(lesson.id, "quiz")}>
                      <ListChecks className="h-3.5 w-3.5" />
                      Take Test
                    </Button>
                  )}
                  {lesson.state === "locked_preview" && (
                    <Button
                      size="sm"
                      onClick={() => purchaseMutation.mutate(lesson.id)}
                      disabled={purchaseMutation.isPending}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Unlock
                      {lesson.priceCents != null && ` — $${(lesson.priceCents / 100).toFixed(2)}`}
                    </Button>
                  )}
                  {lesson.state === "locked" && (
                    <span className="text-xs text-muted-foreground">
                      Complete Lesson {lesson.lessonNumber - 1} to unlock
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {readerLesson && (
        <ClassLessonReaderDialog
          open={readerLessonId != null}
          onOpenChange={(open) => !open && setReaderLessonId(null)}
          classId={classId}
          lesson={readerLesson}
          startAt={readerStartAt}
          alreadyActive={readerLesson.state === "active"}
        />
      )}
    </AppShell>
  );
}
