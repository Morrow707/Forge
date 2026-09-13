import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
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
import { FileSearch, HardDrive, History, AlertTriangle } from "lucide-react";

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
  return (
    <AppShell title="Data & Diagnostics">
      <Tabs defaultValue="audit" className="mt-4">
        <TabsList>
          <TabsTrigger value="audit">Record access</TabsTrigger>
          <TabsTrigger value="jobs">Job runs</TabsTrigger>
          <TabsTrigger value="events">System events</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
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
      </Tabs>
    </AppShell>
  );
}

type AuditRow = {
  id: number;
  userId: number;
  userName: string | null;
  targetAthleteId: number | null;
  targetAthleteName: string | null;
  actionType: string;
  resourceType: string;
  resourceId: number | null;
  detail: string | null;
  justification: string | null;
  ipAddress: string | null;
  createdAt: string;
};

function RecordAccessTab() {
  const { data: rows = [], isLoading } = useQuery<AuditRow[]>({
    queryKey: ["/api/admin/audit-log"],
    queryFn: () => getJson("/api/admin/audit-log?limit=200"),
  });

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-4 w-4" />
            Record access
          </CardTitle>
          <CardDescription>
            Who opened whose record, newest first. Written whenever staff reach another person's
            data -- not every surface is instrumented yet, so read this as "what is covered", not
            "everything that ever happened".
          </CardDescription>
        </div>
        <DownloadButton
          url="/api/admin/audit-log.csv?limit=5000"
          filename="forge-audit-log.csv"
          shareTitle="Forge record-access log"
          label="Export CSV"
        />
      </CardHeader>
      <CardContent>
        {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
        {!isLoading && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing recorded yet.
          </p>
        )}
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border border-border/60 p-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">{r.userName ?? `user #${r.userId}`}</span>
                <Badge variant="outline" className="text-[10px]">
                  {r.actionType}
                </Badge>
                <span className="text-muted-foreground">{r.resourceType}</span>
                {r.targetAthleteId != null && (
                  <>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span>{r.targetAthleteName ?? `user #${r.targetAthleteId}`}</span>
                  </>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {format(new Date(r.createdAt), "d MMM yyyy HH:mm")}
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
  const { data: runs = [], isLoading } = useQuery<JobRun[]>({
    queryKey: ["/api/admin/job-runs"],
    queryFn: () => getJson("/api/admin/job-runs?limit=200"),
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Nightly job runs
        </CardTitle>
        <CardDescription>
          Every recorded run, not just the last one the dashboard shows -- this is what answers
          "when did the minor-athlete video purge last actually delete something".
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
        {!isLoading && runs.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No runs recorded yet.</p>
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
                <span className="text-muted-foreground">{Math.round(r.duration_ms)}ms</span>
              )}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {format(new Date(r.started_at), "d MMM yyyy HH:mm")}
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
  const [showCleared, setShowCleared] = useState(true);
  const { data: events = [], isLoading } = useQuery<SystemEvent[]>({
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
            System events
          </CardTitle>
          <CardDescription>
            The failure history behind the dashboard's badges, including events somebody has
            already cleared -- which the dashboard deliberately hides and which is exactly what a
            "has this happened before?" question needs.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCleared((v) => !v)}>
          {showCleared ? "Hide cleared" : "Show cleared"}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
        {!isLoading && shown.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded.</p>
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
                    cleared
                  </Badge>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {format(new Date(e.lastSeenAt), "d MMM yyyy HH:mm")}
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
    missingFiles: { path: string; uploadedAt: string }[];
    oldestPresentAt: string | null;
    newestMissingAt: string | null;
  } | null;
};

function mb(bytes: number | null | undefined) {
  return bytes == null ? "--" : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function StorageTab() {
  const { data, isLoading } = useQuery<StorageStatus>({
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
            Uploads disk
          </CardTitle>
          <CardDescription>
            Free space, and the file ledger reconciled against what is actually on disk. A disk
            reporting healthy while yesterday's uploads are gone is the case that needs both
            halves of this in one answer -- and is exactly what happened once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLoading && <div className="h-16 animate-pulse rounded-md bg-surface" />}
          {data && (
            <>
              <Row label="Uploads root" value={data.uploadsRoot} mono />
              <Row
                label="Persistent disk"
                value={data.usingPersistentDisk ? "yes" : "NO -- falling back to local"}
                warn={!data.usingPersistentDisk}
              />
              <Row
                label="Writable"
                value={data.writable ? "yes" : (data.writeError ?? "no")}
                warn={!data.writable}
              />
              <Row label="Files on disk" value={String(data.fileCount)} />
              <Row label="Bytes on disk" value={mb(data.totalBytes)} />
              <Row
                label="Newest file"
                value={
                  data.newestFileAt
                    ? format(new Date(data.newestFileAt), "d MMM yyyy HH:mm")
                    : "none"
                }
              />
              {data.ledger && (
                <>
                  <div className="border-t border-border pt-2" />
                  <Row
                    label="Ledger rows checked"
                    value={`${data.ledger.present} present of ${data.ledger.checked}`}
                  />
                  <Row
                    label="Missing from disk"
                    value={String(data.ledger.missing)}
                    warn={data.ledger.missing > 0}
                  />
                  {data.ledger.newestMissingAt && (
                    <Row
                      label="Most recent loss"
                      value={format(new Date(data.ledger.newestMissingAt), "d MMM yyyy HH:mm")}
                      warn
                    />
                  )}
                  {data.ledger.missingFiles.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-md bg-surface p-2">
                      {data.ledger.missingFiles.map((f) => (
                        <p key={f.path} className="font-mono text-[10px] text-muted-foreground">
                          {f.path} · uploaded {format(new Date(f.uploadedAt), "d MMM HH:mm")}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check one file</CardTitle>
          <CardDescription>
            Paste an upload path (a signed URL's query string is fine, it gets stripped) to ask
            whether that exact file is on the disk right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="storage-path" className="text-xs">
            Path
          </Label>
          <div className="flex gap-2">
            <Input
              id="storage-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/uploads/form-videos/abc123.mp4"
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={check} disabled={checking || !path.trim()}>
              {checking ? "Checking…" : "Check"}
            </Button>
          </div>
          {checked && (
            <p className="text-sm">
              <span className="font-mono text-xs">{checked.path}</span>{" "}
              {checked.exists ? (
                <span className="font-semibold text-success">
                  on disk ({mb(checked.sizeBytes)})
                </span>
              ) : (
                <span className="font-semibold text-destructive">not on disk</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
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
