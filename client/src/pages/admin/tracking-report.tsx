import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, FileText } from "lucide-react";

/** Thin viewer for GET /api/admin/tracking-report (see server/tracking-report.ts) -- the route
 * itself is deliberately plain text, not JSON, since it's meant to be read directly (by a
 * person or by an agent with its own admin login), not rendered into structured UI. This page
 * exists purely so it's actually discoverable from the admin nav instead of requiring someone
 * to know the raw URL -- it fetches that same text and displays it as-is, no reformatting. */
export default function AdminTrackingReport() {
  const [limit, setLimit] = useState("20");
  const [appliedLimit, setAppliedLimit] = useState("20");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [`/api/admin/tracking-report`, appliedLimit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/tracking-report?limit=${appliedLimit}`);
      return res.text();
    },
  });

  return (
    <AppShell title="Tracking Data">
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Tracking Data
            </CardTitle>
            <CardDescription>
              Every camera-tracked set's data points, methodology, confidence, and the
              device/AI context that captured it -- most recent first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="report-limit">Sets to show</Label>
                <Input
                  id="report-limit"
                  type="number"
                  min={1}
                  max={200}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="w-24"
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setAppliedLimit(limit);
                  refetch();
                }}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Loading report...</p>}
            {isError && (
              <p className="text-sm text-destructive">
                Couldn't load the report: {error instanceof Error ? error.message : "unknown error"}
              </p>
            )}
            {data != null && (
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-mono text-xs leading-relaxed">
                {data}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
