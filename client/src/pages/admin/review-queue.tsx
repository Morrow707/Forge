import { useState } from "react";
import { externalLinkClick } from "@/lib/open-external";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ReadFailed } from "@/components/read-failed";
import { Check, X, Pencil, CheckCircle2, TrendingUp, Flag, Youtube, Users } from "lucide-react";
import { msg, useT } from "@/i18n";

type ExerciseSummary = {
  id: number;
  name: string;
  category: string;
  muscleGroup: string;
  movementType: string | null;
  laterality: string | null;
  equipment: string;
  instructions: string | null;
  videoUrl: string | null;
};

type PendingSubmission = {
  id: number;
  createdAt: string;
  coachCount: number;
  exercise: ExerciseSummary;
};

type OpenReport = {
  id: number;
  issueType: "broken_video" | "wrong_info" | "misspelling" | "other";
  note: string | null;
  createdAt: string;
  exercise: ExerciseSummary;
  reporter: { id: number; name: string };
};

const issueLabels: Record<string, string> = {
  broken_video: msg("Broken video link"),
  wrong_info: msg("Wrong info"),
  misspelling: msg("Misspelling"),
  other: msg("Other"),
};

function ExerciseSummaryLine({ exercise }: { exercise: ExerciseSummary }) {
  const t = useT();
  return (
    <div>
      <p className="font-semibold">{exercise.name}</p>
      <p className="text-xs text-muted-foreground">
        {t.term("muscle group", exercise.muscleGroup)} · {t.term("equipment", exercise.equipment)}
        {exercise.movementType ? ` · ${t.term("movement type", exercise.movementType)}` : ""}
        {exercise.laterality ? ` · ${t.term("laterality", exercise.laterality)}` : ""}
      </p>
      {exercise.videoUrl && (
        <a
          href={exercise.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={externalLinkClick(exercise.videoUrl)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Youtube className="h-3 w-3" />
          {t("Video link")}
        </a>
      )}
    </div>
  );
}

const PAGE_SIZE = 100;

/** Exercise-catalog moderation: coach-submitted exercises trending across
 * multiple rosters (approve into the shared Forge library, or dismiss),
 * plus coach-flagged data problems on existing Forge exercises. Rendered as
 * a tab inside admin/reports.tsx alongside ProblemReportsContent -- a
 * different kind of report entirely (always tied to one exercise, with a
 * real approve/resolve workflow), just combined onto the same page so
 * "somewhere to review flagged things" isn't split across two nav entries. */
export function ReviewQueueContent() {
  const t = useT();
  const qc = useQueryClient();
  const [submissionsLoadedPages, setSubmissionsLoadedPages] = useState(1);
  const {
    data: submissionsResult,
    isError: submissionsFailed,
    refetch: refetchSubmissions,
  } = useQuery<{ rows: PendingSubmission[]; total: number }>({
    queryKey: ["/api/admin/submissions", submissionsLoadedPages],
    queryFn: () =>
      getJson(`/api/admin/submissions?limit=${submissionsLoadedPages * PAGE_SIZE}&offset=0`),
  });
  const submissions = submissionsResult?.rows ?? [];
  const submissionsTotal = submissionsResult?.total ?? 0;
  const submissionsHasMore = submissions.length < submissionsTotal;

  const [reportsLoadedPages, setReportsLoadedPages] = useState(1);
  const {
    data: reportsResult,
    isError: reportsFailed,
    refetch: refetchReports,
  } = useQuery<{ rows: OpenReport[]; total: number }>({
    queryKey: ["/api/admin/reports", reportsLoadedPages],
    queryFn: () => getJson(`/api/admin/reports?limit=${reportsLoadedPages * PAGE_SIZE}&offset=0`),
  });
  const reports = reportsResult?.rows ?? [];
  const reportsTotal = reportsResult?.total ?? 0;
  const reportsHasMore = reports.length < reportsTotal;

  const [nameEdits, setNameEdits] = useState<Record<number, string>>({});

  const resolveSubmission = useMutation({
    mutationFn: async ({ id, approve, name }: { id: number; approve: boolean; name?: string }) => {
      await apiRequest("POST", `/api/admin/submissions/${id}/resolve`, { approve, name });
    },
    onSuccess: (_data, { approve }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/submissions"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/exercises"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/exercises"] });
      toast.success(approve ? t("Approved — now official Forge content") : t("Dismissed"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Could not resolve")),
  });

  const resolveReport = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/reports/${id}/resolve`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      toast.success(t("Marked resolved"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Could not resolve report")),
  });

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {t("Trending Across Coaches ({count})", { count: submissionsTotal })}
            </CardTitle>
            <CardDescription>
              {t("No one nominated these, two or more coaches independently added an exercise with this exact name, which is its own signal. Approving adds it to the Forge library (give it a canonical name first if you want) and hands it the FORGE badge for every coach immediately.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {submissionsFailed ? (
              <ReadFailed
                what={t("the trending submissions")}
                onRetry={() => void refetchSubmissions()}
              />
            ) : submissions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("Nothing trending right now.")}
              </p>
            ) : null}
            {submissions.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Input
                    value={nameEdits[s.id] ?? s.exercise.name}
                    onChange={(e) =>
                      setNameEdits((prev) => ({ ...prev, [s.id]: e.target.value }))
                    }
                    className="h-8 max-w-xs font-semibold"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.term("muscle group", s.exercise.muscleGroup)} · {t.term("equipment", s.exercise.equipment)}
                    {s.exercise.movementType ? ` · ${t.term("movement type", s.exercise.movementType)}` : ""}
                    {s.exercise.laterality ? ` · ${t.term("laterality", s.exercise.laterality)}` : ""}
                  </p>
                  {s.exercise.videoUrl && (
                    <a
                      href={s.exercise.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={externalLinkClick(s.exercise.videoUrl)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Youtube className="h-3 w-3" />
                      {t("Video link")}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right text-xs text-muted-foreground">
                    <p className="flex items-center justify-end gap-1 font-semibold text-foreground">
                      <Users className="h-3 w-3" />
                      {t.plural(s.coachCount, "{count} coach", "{count} coaches")}
                    </p>
                    <p>{t.relative(new Date(s.createdAt))}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={resolveSubmission.isPending}
                      onClick={() => resolveSubmission.mutate({ id: s.id, approve: false })}
                    >
                      <X className="h-3.5 w-3.5" />
                      {t("Dismiss")}
                    </Button>
                    <Button
                      size="sm"
                      disabled={resolveSubmission.isPending}
                      onClick={() =>
                        resolveSubmission.mutate({
                          id: s.id,
                          approve: true,
                          name: nameEdits[s.id]?.trim() || undefined,
                        })
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t("Approve")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {submissionsHasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubmissionsLoadedPages((p) => p + 1)}
                >
                  {t("Load more ({count} remaining)", { count: submissionsTotal - submissions.length })}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-destructive" />
              {t("Reported Issues ({count})", { count: reportsTotal })}
            </CardTitle>
            <CardDescription>
              {t("Problems coaches have flagged on Forge exercises, broken links, wrong info, typos.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {reportsFailed ? (
              // Two lists, two reads, and they fail independently -- so each says whether it
              // loaded rather than one banner covering the page and leaving the other list
              // looking authoritative.
              <ReadFailed what={t("the open reports")} onRetry={() => void refetchReports()} />
            ) : reports.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("No open reports.")}
              </p>
            ) : null}
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <ExerciseSummaryLine exercise={r.exercise} />
                    <Badge variant="secondary">{issueLabels[r.issueType] ? t(issueLabels[r.issueType]) : r.issueType}</Badge>
                  </div>
                  {r.note && <p className="text-sm text-muted-foreground">{r.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{r.reporter.name}</p>
                    <p>{t.relative(new Date(r.createdAt))}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Link href={`/admin/exercises/${r.exercise.id}`}>
                      <Button size="sm" variant="outline">
                        <Pencil className="h-3.5 w-3.5" />
                        {t("Fix")}
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      disabled={resolveReport.isPending}
                      onClick={() => resolveReport.mutate(r.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t("Resolve")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {reportsHasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={() => setReportsLoadedPages((p) => p + 1)}>
                  {t("Load more ({count} remaining)", { count: reportsTotal - reports.length })}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
