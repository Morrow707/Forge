import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { Check } from "lucide-react";

type Analytics = {
  tracks: {
    trackId: number;
    title: string;
    lessonCount: number;
    started: number;
    allLessonsRead: number;
    lessons: { lessonId: number; lessonNumber: number; title: string; readBy: number }[];
    quizAttempts: number;
    quizPasses: number;
    quizCoaches: number;
    questions: { questionId: number; questionText: string; answered: number; missed: number; missRate: number | null }[];
  }[];
  hardestQuestions: { questionId: number; questionText: string; trackTitle: string; answered: number; missed: number; missRate: number | null }[];
  discussionThreads: number;
  openQuestions: number;
  openReports: number;
};
type CoachQuestion = { id: number; question: string; answerGiven: string | null; createdAt: string };

/** Completion analytics and the coach-submitted questions. Counts only; no coach is named.
 * A question most coaches miss is a bad question or a lesson that did not teach it. */
export default function AdminCoachesCornerAnalytics() {
  const qc = useQueryClient();
  const a = useQuery<Analytics>({ queryKey: ["/api/admin/coaches-corner/analytics"], queryFn: () => getJson("/api/admin/coaches-corner/analytics") });
  const q = useQuery<CoachQuestion[]>({ queryKey: ["/api/admin/coaches-corner/questions"], queryFn: () => getJson("/api/admin/coaches-corner/questions") });
  const resolve = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/coaches-corner/questions/${id}/resolve`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/coaches-corner/questions"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/coaches-corner/analytics"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't resolve"),
  });
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

  return (
    <AppShell title="Coaches Corner analytics">
      {a.isError ? (
        <ReadFailed what="the analytics" onRetry={() => void a.refetch()} />
      ) : !a.data ? (
        <div className="h-32 animate-pulse rounded-lg bg-surface" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Tracks", a.data.tracks.length],
              ["Board threads", a.data.discussionThreads],
              ["Open questions", a.data.openQuestions],
              ["Open reports", a.data.openReports],
            ].map(([label, n]) => (
              <Card key={String(label)}>
                <CardContent className="p-4">
                  <p className="text-2xl font-bold">{n}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where coaches get to</CardTitle>
              <CardDescription>Started is any lesson read. Finished is every lesson read. Pass rate is attempts, not coaches.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3">Track</th>
                    <th className="py-1 pr-3">Started</th>
                    <th className="py-1 pr-3">Finished</th>
                    <th className="py-1 pr-3">Quiz attempts</th>
                    <th className="py-1 pr-3">Pass rate</th>
                    <th className="py-1">Drop-off</th>
                  </tr>
                </thead>
                <tbody>
                  {a.data.tracks.map((t) => {
                    const first = t.lessons[0]?.readBy ?? 0;
                    const last = t.lessons[t.lessons.length - 1]?.readBy ?? 0;
                    return (
                      <tr key={t.trackId} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-medium">{t.title}</td>
                        <td className="py-1.5 pr-3">{t.started}</td>
                        <td className="py-1.5 pr-3">{t.allLessonsRead}</td>
                        <td className="py-1.5 pr-3">{t.quizAttempts}</td>
                        <td className="py-1.5 pr-3">{pct(t.quizPasses, t.quizAttempts)}</td>
                        <td className="py-1.5 text-xs text-muted-foreground">
                          {first > 0 ? `${first} read lesson 1, ${last} read lesson ${t.lessonCount}` : "nobody yet"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Questions most coaches miss</CardTitle>
              <CardDescription>Three or more answers. A high miss rate is a bad question or a lesson that did not teach it.</CardDescription>
            </CardHeader>
            <CardContent>
              {a.data.hardestQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not enough quiz attempts yet.</p>
              ) : (
                <ul className="space-y-2">
                  {a.data.hardestQuestions.map((h) => (
                    <li key={h.questionId} className="text-sm">
                      <span className="font-semibold">{pct(h.missed, h.answered)} missed</span> ({h.answered} answers), {h.trackTitle}: {h.questionText}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Questions the library couldn't answer</CardTitle>
              <CardDescription>Filed by coaches from "This didn't answer my question". The next track comes from here.</CardDescription>
            </CardHeader>
            <CardContent>
              {q.isError ? (
                <ReadFailed what="the questions" onRetry={() => void q.refetch()} />
              ) : (q.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing open.</p>
              ) : (
                <ul className="space-y-3">
                  {q.data!.map((item) => (
                    <li key={item.id} className="rounded-md border border-border p-3">
                      <p className="text-sm font-semibold">{item.question}</p>
                      {item.answerGiven && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">Library said: {item.answerGiven}</p>}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                        <Button size="sm" variant="outline" onClick={() => resolve.mutate(item.id)} disabled={resolve.isPending}>
                          <Check className="h-4 w-4" />
                          Done
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
