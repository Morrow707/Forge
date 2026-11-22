import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DownloadButton } from "@/components/download-button";
import { getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { FileSearch, HardDrive, History, AlertTriangle, Video } from "lucide-react";
import { ReadFailed } from "@/components/read-failed";
import { useT } from "@/i18n";

/** "d MMM yyyy HH:mm", in the reader's language. */
const DATE_TIME: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false };

/**
 * Admin Data & Diagnostics.
 *
 * Four things the server has always been able to answer and no screen ever asked.
 * They are one page rather than four because they are all the same question --
 * "what has this platform actually been doing" -- and because four separate admin
 * pages for four read-only tables is how a nav menu stops being usable.
 *
 * The record-access log leads deliberately. Forge writes a row every time a coach or
 * admin opens another person's footage, with real names on both sides, and for a
 * while nothing in the app could read it back: an accountability log nobody can read
 * is not accountability. The CSV export beside it already existed too.
 */
export default function AdminDiagnostics() {
  const t = useT();
  return (
    <AppShell title={t("Data & Diagnostics")}>
      <Tabs defaultValue="audit" className="mt-4">
        <TabsList>
          <TabsTrigger value="audit">{t("Record access")}</TabsTrigger>
          <TabsTrigger value="jobs">{t("Job runs")}</TabsTrigger>
          <TabsTrigger value="events">{t("System events")}</TabsTrigger>
          <TabsTrigger value="storage">{t("Storage")}</TabsTrigger>
          <TabsTrigger value="captures">{t("Camera captures")}</TabsTrigger>
        </TabsList>

        <TabsContent value="audit">
          <RecordAccessTab />
        </TabsContent>
        <TabsContent value="jobs">
          <JobRunsTab />
        </TabsContent>
        <TabsContent value="events">
          <SystemEventsTab />
        </TabsContent>
        <TabsContent value="storage">
          <StorageTab />
        </TabsContent>
        <TabsContent value="captures">
          <CaptureTracesTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

type AuditRow = {
  id: number;
  userId: number;
  userRole: string | null;
  targetAthleteId: number | null;
  targetAthleteCode: string | null;
  actionType: string;
  resourceType: string;
  resourceId: number | null;
  detail: string | null;
  justification: string | null;
  ipAddress: string | null;
  createdAt: string;
};

function RecordAccessTab() {
  const t = useT();
  const { data: rows = [], isLoading, isError, refetch } = useQuery<AuditRow[]>({
    queryKey: ["/api/admin/audit-log"],
    queryFn: () => getJson("/api/admin/audit-log?limit=200"),
  });

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-4 w-4" />
            {t("Record access")}
          </CardTitle>
          <CardDescription>
            {t("Who opened whose record, newest first. Written whenever staff reach another person's data, not every surface is instrumented yet, so read this as \"what is covered\", not \"everything that ever happened\".")}
          </CardDescription>
        </div>
        <DownloadButton
          url="/api/admin/audit-log.csv?limit=5000"
          filename="forge-audit-log.csv"
          shareTitle={t("Forge record-access log")}
          label={t("Export CSV")}
        />
      </CardHeader>
      <CardContent>
        {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
        {/* THE ONE ON THIS PAGE THAT IS NOT JUST DIAGNOSTIC. This is the
            aggregate-data access log -- the record of who looked at athlete data
            and why, which storage.ts awaits precisely because a query that cannot
            be logged must not run. "Nothing recorded yet" off a failed read says
            nobody has ever looked, which is the single most misleading thing this
            page could say. */}
        {isError && (
          <ReadFailed
            what={t("the record-access log")}
            onRetry={() => void refetch()}
            className="flex flex-col items-start gap-2 py-6 text-left"
          />
        )}
        {!isError && !isLoading && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("Nothing recorded yet.")}
          </p>
        )}
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border border-border/60 p-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">{r.userRole ? `${t(r.userRole)} #${r.userId}` : t("user #{id}", { id: r.userId })}</span>
                <Badge variant="outline" className="text-[10px]">
                  {r.actionType}
                </Badge>
                <span className="text-muted-foreground">{r.resourceType}</span>
                {r.targetAthleteId != null && (
                  <>
                    <span className="text-muted-foreground">{"→"}</span>
                    <span>{r.targetAthleteCode ? t("athlete {code}", { code: r.targetAthleteCode.slice(0, 8) }) : "--"}</span>
                  </>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {t.date(r.createdAt, DATE_TIME)}
                </span>
              </div>
              {(r.detail || r.justification) && (
                <p className="mt-1 text-muted-foreground">
                  {r.detail}
                  {r.justification ? ` · "${r.justification}"` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type JobRun = {
  job_name: string;
  outcome: string;
  started_at: string;
  duration_ms: number | null;
  detail: string | null;
  error: string | null;
};

function JobRunsTab() {
  const t = useT();
  const { data: runs = [], isLoading, isError, refetch } = useQuery<JobRun[]>({
    queryKey: ["/api/admin/job-runs"],
    queryFn: () => getJson("/api/admin/job-runs?limit=200"),
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          {t("Nightly job runs")}
        </CardTitle>
        <CardDescription>
          {t("Every recorded run, not just the last one the dashboard shows, this is what answers \"when did the minor-athlete video purge last actually delete something\".")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
        {isError && (
          <ReadFailed
            what={t("job run history")}
            onRetry={() => void refetch()}
            className="flex flex-col items-start gap-2 py-6 text-left"
          />
        )}
        {!isError && !isLoading && runs.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("No runs recorded yet.")}</p>
        )}
        <div className="space-y-1.5">
          {runs.map((r, i) => (
            <div
              key={`${r.job_name}-${r.started_at}-${i}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/60 p-2.5 text-xs"
            >
              <span className="font-mono font-semibold">{r.job_name}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  r.outcome === "ok"
                    ? "border-success/40 text-success"
                    : "border-destructive/40 text-destructive",
                )}
              >
                {r.outcome}
              </Badge>
              {r.duration_ms != null && (
                <span className="text-muted-foreground">{t("{value}ms", { value: Math.round(r.duration_ms) })}</span>
              )}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {t.date(r.started_at, DATE_TIME)}
              </span>
              {(r.detail || r.error) && (
                <p className="w-full text-muted-foreground">{r.error ?? r.detail}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type SystemEvent = {
  id: number;
  source: string;
  severity: string;
  message: string;
  detail: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  clearedAt: string | null;
};

function SystemEventsTab() {
  const t = useT();
  const [showCleared, setShowCleared] = useState(true);
  const { data: events = [], isLoading, isError, refetch } = useQuery<SystemEvent[]>({
    queryKey: ["/api/admin/system-events"],
    queryFn: () => getJson("/api/admin/system-events?limit=200"),
  });
  const shown = showCleared ? events : events.filter((e) => !e.clearedAt);

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            {t("System events")}
          </CardTitle>
          <CardDescription>
            {t("The failure history behind the dashboard's badges, including events somebody has already cleared, which the dashboard deliberately hides and which is exactly what a \"has this happened before?\" question needs.")}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCleared((v) => !v)}>
          {showCleared ? t("Hide cleared") : t("Show cleared")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
        {/* An events panel reading "Nothing recorded" is how an operator concludes
            the platform is healthy. */}
        {isError && (
          <ReadFailed
            what={t("system events")}
            onRetry={() => void refetch()}
            className="flex flex-col items-start gap-2 py-6 text-left"
          />
        )}
        {!isError && !isLoading && shown.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("Nothing recorded.")}</p>
        )}
        <div className="space-y-1.5">
          {shown.map((e) => (
            <div key={e.id} className="rounded-md border border-border/60 p-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="outline" className="text-[10px]">
                  {e.source}
                </Badge>
                <span
                  className={cn(
                    "font-semibold",
                    e.severity === "error" ? "text-destructive" : "text-amber-500",
                  )}
                >
                  {e.message}
                </span>
                {e.count > 1 && <span className="text-muted-foreground">x{e.count}</span>}
                {e.clearedAt && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t("cleared")}
                  </Badge>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {t.date(e.lastSeenAt, DATE_TIME)}
                </span>
              </div>
              {e.detail && <p className="mt-1 text-muted-foreground">{e.detail}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type StorageStatus = {
  uploadsRoot: string;
  usingPersistentDisk: boolean;
  directoryExists: boolean;
  writable: boolean;
  writeError: string | null;
  fileCount: number;
  totalBytes: number;
  newestFileAt: string | null;
  ledger: {
    checked: number;
    present: number;
    missing: number;
    removedByForge: number;
    unexplained: number;
    unexplainedBeforeStamping: number;
    stampingBeganAt: string;
    missingFiles: { path: string; uploadedAt: string; removedByForgeAt: string | null }[];
    unexplainedFiles: { path: string; uploadedAt: string }[];
    oldestPresentAt: string | null;
    newestMissingAt: string | null;
    newestUnexplainedAt: string | null;
  } | null;
};

function mb(bytes: number | null | undefined) {
  return bytes == null ? "--" : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function StorageTab() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useQuery<StorageStatus>({
    queryKey: ["/api/admin/storage-status"],
    queryFn: () => getJson("/api/admin/storage-status"),
  });
  const [path, setPath] = useState("");
  const [checked, setChecked] = useState<{
    path: string;
    exists: boolean;
    sizeBytes: number | null;
  } | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      setChecked(await getJson(`/api/admin/storage-check?path=${encodeURIComponent(path.trim())}`));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4" />
            {t("Uploads disk")}
          </CardTitle>
          <CardDescription>
            {t("Free space, and the file ledger reconciled against what is actually on disk. A removal Forge made itself is separated from one nobody can account for, only the second is a loss. A disk reporting healthy while yesterday's uploads are gone is the case that needs both halves of this in one answer, and is exactly what happened once.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLoading && <div className="h-16 animate-pulse rounded-md bg-surface" />}
          {/* Renders as an empty card otherwise -- no rows, no error, nothing. This is
              the card that answers whether uploads are on a persistent disk, so a
              silent blank is the worst of both: it neither reassures nor warns. */}
          {isError && (
            <ReadFailed
              what={t("the uploads disk status")}
              onRetry={() => void refetch()}
              className="flex flex-col items-start gap-2 py-4 text-left"
            />
          )}
          {data && (
            <>
              <Row label={t("Uploads root")} value={data.uploadsRoot} mono />
              <Row
                label={t("Persistent disk")}
                value={data.usingPersistentDisk ? "yes" : "NO, falling back to local"}
                warn={!data.usingPersistentDisk}
              />
              <Row
                label={t("Writable")}
                value={data.writable ? t("yes") : (data.writeError ?? t("no"))}
                warn={!data.writable}
              />
              <Row label={t("Files on disk")} value={String(data.fileCount)} />
              <Row label={t("Bytes on disk")} value={mb(data.totalBytes)} />
              <Row
                label={t("Newest file")}
                value={
                  data.newestFileAt
                    ? t.date(data.newestFileAt, DATE_TIME)
                    : t("none")
                }
              />
              {data.ledger && (
                <>
                  <div className="border-t border-border pt-2" />
                  <Row
                    label={t("Ledger rows checked")}
                    value={t("{present} present of {checked}", { present: data.ledger.present, checked: data.ledger.checked })}
                  />
                  {/* THE ONE NUMBER THAT IS AN ALARM, AND IT IS NOT "missing".
                      uploaded_files is insert-only, so every deliberate removal -- the
                      retention purge, an account deletion, a retake, an athlete's Remove
                      button -- used to read as a loss. That put 84 of 100 in red on a
                      perfectly healthy disk, and a number that is red in normal operation is
                      one nobody believes the day it means something. */}
                  <Row
                    label={t("Unexplained losses")}
                    value={
                      data.ledger.unexplained === 0
                        ? t("none")
                        : t("{count} gone with no record of us removing them", { count: data.ledger.unexplained })
                    }
                    warn={data.ledger.unexplained > 0}
                  />
                  <Row
                    label={t("Removed by Forge")}
                    value={t("{count} (purge, deletion, retake, or Remove)", { count: data.ledger.removedByForge })}
                  />
                  {data.ledger.unexplainedBeforeStamping > 0 && (
                    <Row
                      label={t("Removed before we kept a record")}
                      value={t("{count} uploaded before {date}, nothing can say who removed these", { count: data.ledger.unexplainedBeforeStamping, date: t.date(data.ledger.stampingBeganAt, { day: "numeric", month: "short", year: "numeric" }) })}
                    />
                  )}
                  {data.ledger.newestUnexplainedAt && (
                    <Row
                      label={t("Most recent unexplained loss")}
                      value={t.date(data.ledger.newestUnexplainedAt, DATE_TIME)}
                      warn
                    />
                  )}
                  {data.ledger.unexplainedFiles.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-md bg-surface p-2">
                      {data.ledger.unexplainedFiles.map((f) => (
                        <p key={f.path} className="font-mono text-[10px] text-muted-foreground">
                          {f.path} · {t("uploaded {when}", { when: t.date(f.uploadedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) })}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="pt-1">
                    <DownloadButton
                      url="/api/admin/storage-report.json?limit=2000"
                      filename="forge-storage-report.json"
                      shareTitle={t("Forge storage report")}
                      label={t("Download storage report")}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Check one file")}</CardTitle>
          <CardDescription>
            {t("Paste an upload path (a signed URL's query string is fine, it gets stripped) to ask whether that exact file is on the disk right now.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="storage-path" className="text-xs">
            {t("Path")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="storage-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={t("/uploads/form-videos/abc123.mp4")}
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={check} disabled={checking || !path.trim()}>
              {checking ? t("Checking…") : t("Check")}
            </Button>
          </div>
          {checked && (
            <p className="text-sm">
              <span className="font-mono text-xs">{checked.path}</span>{" "}
              {checked.exists ? (
                <span className="font-semibold text-success">
                  {t("on disk ({size})", { size: mb(checked.sizeBytes) })}
                </span>
              ) : (
                <span className="font-semibold text-destructive">{t("not on disk")}</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * THE TRACE ITSELF, WHICH NOTHING HAS EVER LET OUT.
 *
 * Every other camera surface in Forge shows what the pipeline CONCLUDED about a set -- velocity,
 * range of motion, rep count, trust. This hands over what it concluded it FROM: the stored
 * bar-path trace, the per-frame point sequence the tracker produced live.
 *
 * capture-replay.ts re-runs segmentation, rep counting, velocity, range of motion and trust over
 * that trace with no device and no camera, which is the only way to see WHERE a rep boundary
 * landed rather than inferring it from the summary. Every threshold in that stage is a number
 * somebody picked rather than measured, and the traces sat in the database unreachable the whole
 * time -- so they could only ever be tuned against screenshots.
 *
 * A calibration run against a reference device is what forced this: three consecutive reps
 * matched to within 1% while the same set still miscounted at both ends. The summary can say a
 * boundary is wrong and cannot say where it is.
 *
 * Not the video. Apple's Vision framework has no way to re-run against a stored clip, so a
 * downloaded mp4 could never reproduce what the phone saw -- any re-derivation would be a
 * different model run with its own noise. The trace is the artifact that survives.
 */
function CaptureTracesTab() {
  const t = useT();
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-4 w-4" />
          {t("Camera captures")}
        </CardTitle>
        <CardDescription>
          {t("The raw bar-path trace behind each tracked set, as a file. This is the input the replay harness reads, it re-runs rep segmentation and every metric over a trace with no phone and no camera, so a miscount can be looked at instead of guessed at. Carries no names: sets are grouped under \"Athlete 1\", \"Athlete 2\", generated fresh for each download and mapped nowhere.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {t("Newest sets first. Only sets that actually ran through the camera pipeline appear, a hand-logged set has no trace to export.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            url="/api/admin/capture-export.json?limit=20"
            filename="forge-captures-recent.json"
            shareTitle={t("Forge camera captures")}
            label={t("Last 20 sets")}
          />
          <DownloadButton
            url="/api/admin/capture-export.json?limit=200"
            filename="forge-captures-full.json"
            shareTitle={t("Forge camera captures")}
            label={t("Last 200 sets")}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
  warn,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          mono && "font-mono text-xs",
          warn && "font-bold text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
