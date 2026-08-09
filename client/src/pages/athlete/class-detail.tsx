import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, Lock, CheckCircle2, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type LessonProgress = {
  id: number;
  lessonNumber: number;
  title: string;
  description: string | null;
  priceCents: number | null;
  state: "active" | "locked_preview" | "locked";
  skillAssignmentId: number | null;
  purchasedAt: string | null;
};

type ClassProgress = {
  class: { id: number; name: string; description: string | null; isForgeOfficial: boolean };
  enrolled: boolean;
  startDate?: string;
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

      <div className="space-y-3">
        {data.lessons.map((lesson) => (
          <Card
            key={lesson.id}
            className={cn(lesson.state === "locked" && "opacity-60")}
          >
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                    lesson.state === "active"
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {lesson.state === "active" ? (
                    <PlayCircle className="h-5 w-5" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Lesson {lesson.lessonNumber}</Badge>
                    <p className="font-semibold">{lesson.title}</p>
                  </div>
                  {lesson.description && (
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">{lesson.description}</p>
                  )}
                </div>
              </div>

              <div className="shrink-0 pl-12 sm:pl-0">
                {lesson.state === "active" && (
                  <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    On your calendar
                  </span>
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
        ))}
      </div>
    </AppShell>
  );
}
