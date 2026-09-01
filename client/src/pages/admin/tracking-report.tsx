import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { RefreshCw, FileText, Copy, ChevronDown, ChevronUp, BookOpen, AlertTriangle } from "lucide-react";

type ReportField = { label: string; value: string };
type TrackingReportEntry = {
  date: string;
  athleteName: string;
  exerciseName: string;
  setNumber: number;
  reps: string | null;
  weight: string | null;
  weightUnit: string | null;
  trackingMode: string;
  movementType: string | null;
  methodology: string | null;
  dataPoints: ReportField[];
  trust: ReportField[];
  device: ReportField[];
  diagnostics: ReportField[];
  flags: string[];
};

function trustBadgeClass(value: string): string {
  if (value.startsWith("high")) return "bg-success text-success-foreground";
  if (value.startsWith("low")) return "bg-destructive text-destructive-foreground";
  return "border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400";
}

function EntryCard({ entry }: { entry: TrackingReportEntry }) {
  const [showDevice, setShowDevice] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const failureReason = entry.diagnostics.find((f) => f.label === "Why this set has no data");
  const restOfDiagnostics = entry.diagnostics.filter((f) => f !== failureReason);
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{entry.date}</p>
          <p className="text-sm font-semibold">
            {entry.athleteName} <span className="text-muted-foreground">--</span> {entry.exerciseName}
          </p>
          <p className="text-xs text-muted-foreground">
            Set {entry.setNumber}
            {entry.reps ? `, ${entry.reps} reps` : ""}
            {entry.weight ? `, ${entry.weight}${entry.weightUnit ? ` ${entry.weightUnit}` : ""}` : ""}
          </p>
        </div>

        {/* Right under the header, ahead of everything else -- the whole point of a flag is
            that it's the first thing worth reading, not something to notice only after already
            scanning past the data points. Amber rather than the destructive red used for
            failureReason below: a flag means "this looks off," not "there's no data at all." */}
        {entry.flags.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-1.5">
            {entry.flags.map((f, i) => (
              <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{f}</span>
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {entry.trackingMode}
          </Badge>
          {entry.movementType && (
            <Badge variant="outline" className="text-[10px]">
              {entry.movementType}
            </Badge>
          )}
        </div>

        {entry.dataPoints.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No data points recorded for this set.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            {entry.dataPoints.map((f) => (
              <div
                key={f.label}
                className="flex items-baseline justify-between gap-2 border-b border-border/50 py-1 text-xs"
              >
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="text-right font-medium tabular-nums">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* The single most useful line on an empty set -- exactly which pipeline stage gave up
            and why (calibration never resolved, or no clean rep-phase in the trace), instead of
            leaving "no data points recorded" as the only signal. Surfaced unconditionally
            (not behind the Pipeline diagnostics toggle below) since this is normally the first
            thing worth reading on a failed set. */}
        {failureReason && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {failureReason.value}
          </p>
        )}

        {entry.trust.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.trust.map((t, i) => (
              <span
                key={i}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${trustBadgeClass(t.value)}`}
                title={`${t.label}: ${t.value}`}
              >
                {t.label}: {t.value.split(" ")[0]}
              </span>
            ))}
          </div>
        )}

        {entry.device.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowDevice((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              {showDevice ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Device &amp; capture info
            </button>
            {showDevice && (
              <dl className="mt-1.5 space-y-1 rounded-md bg-muted/30 p-2 text-[11px]">
                {entry.device.map((f) => (
                  <div key={f.label} className="flex justify-between gap-2">
                    <dt className="shrink-0 text-muted-foreground">{f.label}</dt>
                    <dd className="text-right">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        {restOfDiagnostics.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowDiagnostics((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Pipeline diagnostics
            </button>
            {showDiagnostics && (
              <dl className="mt-1.5 space-y-1 rounded-md bg-muted/30 p-2 text-[11px]">
                {restOfDiagnostics.map((f) => (
                  <div key={f.label} className="flex justify-between gap-2">
                    <dt className="shrink-0 text-muted-foreground">{f.label}</dt>
                    <dd className="text-right">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Structured viewer for GET /api/admin/tracking-report/entries -- the JSON counterpart of the
 * plain-text /api/admin/tracking-report route (see server/tracking-report.ts), which stays
 * plain text on purpose since a person or an agent reads that one directly. This page renders
 * the same underlying data as real cards instead of one long monospace blob, since that's what
 * a person scanning it on a browser actually wants; "Copy as text" below fetches the plain-text
 * version on demand for pasting elsewhere (e.g. to Claude) without needing to select across a
 * scrolling <pre> block. */
export default function AdminTrackingReport() {
  const [limit, setLimit] = useState("20");
  const [appliedLimit, setAppliedLimit] = useState("20");
  const [showGlossary, setShowGlossary] = useState(false);

  const { data: entries, isLoading, isError, error, refetch, isFetching } = useQuery<TrackingReportEntry[]>({
    queryKey: [`/api/admin/tracking-report/entries`, appliedLimit],
    queryFn: () => getJson(`/api/admin/tracking-report/entries?limit=${appliedLimit}`),
  });

  async function copyRawReport() {
    try {
      const res = await apiRequest("GET", `/api/admin/tracking-report?limit=${appliedLimit}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      toast.success("Copied -- paste it wherever you need it");
    } catch {
      toast.error("Couldn't copy the report");
    }
  }

  const glossary = new Map<string, string>();
  for (const e of entries ?? []) {
    if (e.methodology && !glossary.has(e.trackingMode)) glossary.set(e.trackingMode, e.methodology);
  }

  return (
    <AppShell title="AR Diagnosis">
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              AR Diagnosis
            </CardTitle>
            <CardDescription>
              Every camera-tracked set's data points, methodology, confidence, and the device/AI
              context that captured it -- most recent first.
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
              <Button variant="outline" onClick={copyRawReport}>
                <Copy className="h-4 w-4" />
                Copy as text
              </Button>
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Loading report...</p>}
            {isError && (
              <p className="text-sm text-destructive">
                Couldn't load the report: {error instanceof Error ? error.message : "unknown error"}
              </p>
            )}
          </CardContent>
        </Card>

        {glossary.size > 0 && (
          <Card>
            <CardHeader
              className="cursor-pointer flex-row items-center justify-between space-y-0 pb-2"
              onClick={() => setShowGlossary((v) => !v)}
            >
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen className="h-4 w-4" />
                How these {glossary.size} tracking method{glossary.size === 1 ? "" : "s"} work
              </CardTitle>
              <Button variant="ghost" size="sm">
                {showGlossary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CardHeader>
            {showGlossary && (
              <CardContent className="space-y-3 pt-0">
                {[...glossary.entries()].map(([mode, text]) => (
                  <div key={mode}>
                    <Badge variant="secondary" className="mb-1 text-[10px]">
                      {mode}
                    </Badge>
                    <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        )}

        {entries && entries.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No tracked sets yet -- nothing has been recorded with a camera tracking mode enabled.
          </p>
        )}

        {entries && entries.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {entries.map((entry, i) => (
              <EntryCard key={i} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
