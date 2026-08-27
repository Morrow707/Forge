import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

type Report = {
  id: number;
  requestedByUserId: number | null;
  logText: string;
  diagnosis: string;
  createdAt: string;
};

/** Read-only history of every "Diagnose with AI" run against a native AR
 * tracker's diagLog buffer -- see storage.diagnoseTrackerLog and its
 * POST /api/admin/diagnose-tracker-log route. Any signed-in user can
 * trigger a diagnosis (whoever's actually reproducing the bug), but this
 * list itself stays admin-only -- it's the "send it in a report to the
 * admin, then you can read the report" half of that feature. */
export default function AdminTrackerDiagnosisReports() {
  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: ["/api/admin/tracker-diagnosis-reports"],
    queryFn: () => getJson("/api/admin/tracker-diagnosis-reports"),
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <AppShell title="AR Diagnosis Reports">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Every "Diagnose with AI" run against a native AR tracker's on-device log, newest first.
        </p>
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>}
        {reports?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing here yet -- tap "Diagnose with AI" on a tracker's diagnostic overlay to generate one.
          </p>
        )}
        {reports?.map((report) => {
          const expanded = expandedId === report.id;
          return (
            <Card key={report.id}>
              <CardHeader
                className="cursor-pointer flex-row items-center justify-between space-y-0 pb-2"
                onClick={() => setExpandedId(expanded ? null : report.id)}
              >
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {format(parseISO(report.createdAt), "MMM d, h:mm a")}
                </CardTitle>
                <Button variant="ghost" size="sm">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <p className="whitespace-pre-wrap text-sm">{report.diagnosis}</p>
                {expanded && (
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Raw diagLog</p>
                    <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-tight text-muted-foreground">
                      {report.logText}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
