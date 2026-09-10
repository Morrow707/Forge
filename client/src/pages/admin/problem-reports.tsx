import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError, resolveApiUrl } from "@/lib/queryClient";
import { toast } from "sonner";
import { Flag, Check } from "lucide-react";

type ProblemReport = {
  id: number;
  userId: number;
  userName: string | null;
  message: string;
  imageUrl: string | null;
  path: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

/** Admin-only inbox for "Report a problem" submissions (see ReportProblemDialog). Open reports
 * only by default; each one is cleared by hand and nothing ages out on its own. Rendered as a
 * tab inside admin/reports.tsx alongside ReviewQueueContent -- a general, not-tied-to-any-record
 * bug inbox, unlike that one's per-exercise moderation workflow. */
export function ProblemReportsContent() {
  const qc = useQueryClient();
  const [showCleared, setShowCleared] = useState(false);
  const { data, isLoading } = useQuery<ProblemReport[]>({
    queryKey: ["/api/admin/problem-reports", showCleared],
    queryFn: () =>
      fetch(resolveApiUrl(`/api/admin/problem-reports${showCleared ? "?includeResolved=1" : ""}`), {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/problem-reports/${id}/resolve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/problem-reports"] });
      toast.success("Cleared");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't clear that report"),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Reported problems
          </CardTitle>
          <CardDescription>
            Sent from any coach/athlete/admin's account menu -- newest first. Reports stay here
            until you clear them.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCleared((v) => !v)}>
          {showCleared ? "Open only" : "Show cleared"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {showCleared ? "No reports yet." : "Nothing open."}
          </p>
        ) : (
          data.map((report) => (
            <div key={report.id} className="rounded-md border border-border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {report.userName ?? "Unknown user"}
                </span>
                <span className="flex items-center gap-3">
                  <span>{new Date(report.createdAt).toLocaleString()}</span>
                  {report.resolvedAt ? (
                    <span className="font-semibold text-primary">Cleared</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resolveMutation.isPending}
                      onClick={() => resolveMutation.mutate(report.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Clear
                    </Button>
                  )}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{report.message}</p>
              {report.path && (
                <p className="mt-1.5 text-xs text-muted-foreground">On: {report.path}</p>
              )}
              {report.imageUrl && (
                // Screenshots are served through a signed, expiring URL, because a "here's
                // what's broken" screenshot can capture someone else's data as easily as
                // anything else in the app. That is worth keeping; what is not worth keeping is
                // an admin being told to reload the page by hand when one goes stale. A failed
                // load refetches the list, which mints a fresh signature, so the expiry stops
                // being something a person has to manage.
                <img
                  src={resolveApiUrl(report.imageUrl)}
                  alt="Reported screenshot"
                  onError={() => qc.invalidateQueries({ queryKey: ["/api/admin/problem-reports"] })}
                  className="mt-3 max-h-64 rounded-md border border-border object-contain"
                />
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
