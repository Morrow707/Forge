import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type WeaknessDeficit = {
  title: string;
  category: string;
  evidence: string;
  whyItMatters: string;
  suggestedFocus: string;
};

type WeaknessReport = {
  id: number;
  summary: string;
  deficits: WeaknessDeficit[];
  createdAt: string;
};

/** Shared by the coach's roster view (generateUrl points at their
 * roster route, ungated) and a Free Agent's own self-service view
 * (generateUrl points at the paywalled athlete route) -- same read
 * history either way, just a different write endpoint and whether
 * `canGenerate` is even shown. Each report is a point-in-time snapshot,
 * not a live dashboard -- see the comment on weaknessReports in
 * shared/schema.ts for why re-generating makes a new row instead of
 * updating the last one. */
export function WeaknessReportPanel({
  fetchUrl,
  generateUrl,
  canGenerate = true,
}: {
  fetchUrl: string;
  generateUrl: string;
  canGenerate?: boolean;
}) {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: reports = [], isLoading } = useQuery<WeaknessReport[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", generateUrl, {});
      return res.json();
    },
    onSuccess: (report: WeaknessReport) => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      setExpandedId(report.id);
      toast.success("Report generated");
    },
    onError: (err: ApiError) => {
      if (err.status === 402) {
        toast.info(err.message || "Not available on this plan yet.");
      } else if (err.status === 422) {
        toast.info(err.message || "Not enough data logged yet to generate a report.");
      } else {
        toast.error(err.message || "Could not generate report");
      }
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        AI analysis of goniometer, asymmetry, load-management, wellness, and testing data on
        file, identifying specific deficits and why they matter -- a starting signal, not a
        diagnosis. Each report is a snapshot; generate a new one later to see what's changed.
      </p>

      {canGenerate && (
        <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
          <Sparkles className="h-4 w-4" />
          {generateMutation.isPending ? "Analyzing…" : "Generate Report"}
        </Button>
      )}

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-surface" />
      ) : reports.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No weakness reports generated yet.
        </p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const isOpen = expandedId === r.id;
            return (
              <div key={r.id} className="overflow-hidden rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : r.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-surface-elevated"
                >
                  <div>
                    <p className="text-sm font-semibold">{r.summary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(parseISO(r.createdAt), "MMM d, yyyy 'at' h:mm a")} &middot;{" "}
                      {r.deficits.length} {r.deficits.length === 1 ? "deficit" : "deficits"} flagged
                    </p>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-border p-4">
                    {r.deficits.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No concerning deficits found in this analysis.
                      </p>
                    ) : (
                      r.deficits.map((d, i) => (
                        <div key={i} className="space-y-2 rounded-md border border-border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="flex items-center gap-1.5 font-semibold">
                              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                              {d.title}
                            </p>
                            <Badge variant="secondary">{d.category}</Badge>
                          </div>
                          <div className="space-y-1.5 text-sm">
                            <p>
                              <span className="font-semibold text-muted-foreground">
                                Evidence:{" "}
                              </span>
                              {d.evidence}
                            </p>
                            <p>
                              <span className="font-semibold text-muted-foreground">
                                Why it matters:{" "}
                              </span>
                              {d.whyItMatters}
                            </p>
                            <p>
                              <span className="font-semibold text-muted-foreground">
                                Suggested focus:{" "}
                              </span>
                              {d.suggestedFocus}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
