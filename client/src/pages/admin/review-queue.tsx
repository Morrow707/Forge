import { useState } from "react";
import { externalLinkClick } from "@/lib/open-external";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Check, X, Pencil, CheckCircle2, TrendingUp, Flag, Youtube, Users } from "lucide-react";

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
  broken_video: "Broken video link",
  wrong_info: "Wrong info",
  misspelling: "Misspelling",
  other: "Other",
};

function ExerciseSummaryLine({ exercise }: { exercise: ExerciseSummary }) {
  return (
    <div>
      <p className="font-semibold">{exercise.name}</p>
      <p className="text-xs text-muted-foreground">
        {exercise.muscleGroup} · {exercise.equipment}
        {exercise.movementType ? ` · ${exercise.movementType}` : ""}
        {exercise.laterality ? ` · ${exercise.laterality}` : ""}
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
          Video link
        </a>
      )}
    </div>
  );
}

export default function AdminReviewQueue() {
  const qc = useQueryClient();
  const { data: submissions = [] } = useQuery<PendingSubmission[]>({
    queryKey: ["/api/admin/submissions"],
  });
  const { data: reports = [] } = useQuery<OpenReport[]>({
    queryKey: ["/api/admin/reports"],
  });
  const [nameEdits, setNameEdits] = useState<Record<number, string>>({});

  const resolveSubmission = useMutation({
    mutationFn: async ({ id, approve, name }: { id: number; approve: boolean; name?: string }) => {
      await apiRequest("POST", `/api/admin/submissions/${id}/resolve`, { approve, name });
    },
    onSuccess: (_data, { approve }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/submissions"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/exercises"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/exercises"] });
      toast.success(approve ? "Approved — now official Forge content" : "Dismissed");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not resolve"),
  });

  const resolveReport = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/reports/${id}/resolve`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      toast.success("Marked resolved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not resolve report"),
  });

  return (
    <AppShell title="Review Queue">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Trending Across Coaches ({submissions.length})
            </CardTitle>
            <CardDescription>
              No one nominated these -- two or more coaches independently added an exercise
              with this exact name, which is its own signal. Approving adds it to the Forge
              library (give it a canonical name first if you want) and hands it the FORGE badge
              for every coach immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {submissions.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing trending right now.
              </p>
            )}
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
                    {s.exercise.muscleGroup} · {s.exercise.equipment}
                    {s.exercise.movementType ? ` · ${s.exercise.movementType}` : ""}
                    {s.exercise.laterality ? ` · ${s.exercise.laterality}` : ""}
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
                      Video link
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right text-xs text-muted-foreground">
                    <p className="flex items-center justify-end gap-1 font-semibold text-foreground">
                      <Users className="h-3 w-3" />
                      {s.coachCount} coaches
                    </p>
                    <p>{formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}</p>
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
                      Dismiss
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
                      Approve
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-destructive" />
              Reported Issues ({reports.length})
            </CardTitle>
            <CardDescription>
              Problems coaches have flagged on Forge exercises -- broken links, wrong info,
              typos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {reports.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No open reports.
              </p>
            )}
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <ExerciseSummaryLine exercise={r.exercise} />
                    <Badge variant="secondary">{issueLabels[r.issueType]}</Badge>
                  </div>
                  {r.note && <p className="text-sm text-muted-foreground">{r.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{r.reporter.name}</p>
                    <p>{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Link href={`/admin/exercises/${r.exercise.id}`}>
                      <Button size="sm" variant="outline">
                        <Pencil className="h-3.5 w-3.5" />
                        Fix
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      disabled={resolveReport.isPending}
                      onClick={() => resolveReport.mutate(r.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolve
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
