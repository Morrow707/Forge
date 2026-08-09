import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";

type Lesson = {
  id: number;
  lessonNumber: number;
  title: string;
  content: string;
  estMinutes: number | null;
  completed: boolean;
};

type Track = {
  id: number;
  title: string;
  description: string;
  keyPrinciplesForAi: string;
  lessons: Lesson[];
};

/** Admin's own view of Coaches Corner -- always full content, no paywall
 * check (admins are the ones curating it; see the coach-facing block in
 * routes.ts for the locked/unlocked catalog a regular coach sees). Read-only
 * for now; content is authored via seed.ts, not this page. */
export default function AdminCoachesCorner() {
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
          <Button variant="outline" onClick={() => setSelectedTrackId(null)}>
            <ArrowLeft className="h-4 w-4" />
            Back to Coaches Corner
          </Button>
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
      </AppShell>
    );
  }

  return (
    <AppShell title="Coaches Corner">
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Coach-education content -- what a regular coach sees as a locked, paywalled catalog (see the
        Coaches Corner nav item next to the account menu). Seeded via server/seed.ts; not yet
        editable from this page.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tracks.map((track) => (
          <Card
            key={track.id}
            className="cursor-pointer transition-colors hover:border-primary/50"
            onClick={() => setSelectedTrackId(track.id)}
          >
            <CardContent className="flex flex-col gap-2 p-5">
              <h3 className="font-display text-base font-bold uppercase tracking-wide">{track.title}</h3>
              <p className="text-sm text-muted-foreground">{track.description}</p>
              <Badge variant="secondary" className="w-fit">
                {track.lessons.length} lessons
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
