import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { resolveApiUrl } from "@/lib/queryClient";
import { Flag } from "lucide-react";

type ProblemReport = {
  id: number;
  userId: number;
  userName: string | null;
  message: string;
  imageUrl: string | null;
  path: string | null;
  createdAt: string;
};

/** Plain, admin-only inbox for "Report a problem" submissions (see
 * ReportProblemDialog) -- no status/priority workflow, just the raw list,
 * newest first. Screenshot URLs are already signed by the time they reach
 * here (server/media-url-signing.ts sweeps every JSON response), so
 * resolveApiUrl is the only client-side handling they need. Rendered as a
 * tab inside admin/reports.tsx alongside ReviewQueueContent -- a general,
 * not-tied-to-any-record bug inbox, unlike that one's per-exercise
 * moderation workflow; combined onto the same page purely to save a nav
 * slot, not because the two functions overlap. */
export function ProblemReportsContent() {
  const { data, isLoading } = useQuery<ProblemReport[]>({
    queryKey: ["/api/admin/problem-reports"],
  });

  return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Reported problems
          </CardTitle>
          <CardDescription>
            Sent from any coach/athlete/admin's account menu -- newest first. A screenshot's link
            expires a few hours after this page loads it; reload the page for a fresh one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-md bg-surface" />
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports yet.</p>
          ) : (
            data.map((report) => (
              <div key={report.id} className="rounded-md border border-border p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{report.userName ?? "Unknown user"}</span>
                  <span>{new Date(report.createdAt).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{report.message}</p>
                {report.path && (
                  <p className="mt-1.5 text-xs text-muted-foreground">On: {report.path}</p>
                )}
                {report.imageUrl && (
                  <img
                    src={resolveApiUrl(report.imageUrl)}
                    alt="Reported screenshot"
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
