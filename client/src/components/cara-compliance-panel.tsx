import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ShieldCheck, ClipboardPlus, AlertTriangle, Timer, Download } from "lucide-react";
import { shareOrDownloadFile } from "@/lib/share-file";

type ComplianceRow = {
  athleteId: number;
  name: string;
  minutes: number;
  capMinutes: number;
  percentUsed: number;
  atRisk: boolean;
  overCap: boolean;
  currentlyTraining: boolean;
};

const ACTIVITY_TYPES = [
  { value: "meeting", label: "Team Meeting" },
  { value: "film_review", label: "Film Review" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Other" },
] as const;

/** NCAA-style weekly countable-hours compliance -- fully opt-in per coach.
 * Setting a cap turns on the athlete-side session timers (see cara-timer.tsx)
 * and this roster-wide weekly snapshot; clearing it (back to "off") stops
 * both immediately. */
export function CaraCompliancePanel({ roster }: { roster: { id: number; name: string }[] }) {
  const qc = useQueryClient();
  const [capInput, setCapInput] = useState("");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{ id: number; name: string } | null>(null);
  const [logAthleteId, setLogAthleteId] = useState<number | "">("");
  const [logActivityType, setLogActivityType] =
    useState<(typeof ACTIVITY_TYPES)[number]["value"]>("meeting");
  const [logStart, setLogStart] = useState("");
  const [logEnd, setLogEnd] = useState("");
  const [logNote, setLogNote] = useState("");

  const { data: settings } = useQuery<{ capMinutes: number | null }>({
    queryKey: ["/api/coach/cara/settings"],
    queryFn: () => getJson("/api/coach/cara/settings"),
  });

  const { data: compliance } = useQuery<{ capMinutes: number | null; athletes: ComplianceRow[] }>({
    queryKey: ["/api/coach/cara/compliance"],
    queryFn: () => getJson("/api/coach/cara/compliance"),
    refetchInterval: 60_000,
    enabled: !!settings?.capMinutes,
  });

  const saveCapMutation = useMutation({
    mutationFn: (capMinutes: number | null) =>
      apiRequest("POST", "/api/coach/cara/settings", { capMinutes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/cara/settings"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/cara/compliance"] });
      toast.success("CARA settings updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that"),
  });

  const logMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/coach/cara/manual-log", {
        athleteId: logAthleteId,
        activityType: logActivityType,
        startedAt: new Date(logStart).toISOString(),
        endedAt: new Date(logEnd).toISOString(),
        note: logNote || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/cara/compliance"] });
      toast.success("Activity logged");
      setLogOpen(false);
      setLogAthleteId("");
      setLogStart("");
      setLogEnd("");
      setLogNote("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't log that activity"),
  });

  async function handleExport(format: "csv" | "pdf") {
    setExporting(format);
    try {
      await shareOrDownloadFile(
        `/api/coach/cara/compliance-report.${format}`,
        `cara-compliance.${format}`,
        "CARA Compliance Report",
      );
    } catch {
      toast.error("Couldn't generate that export");
    } finally {
      setExporting(null);
    }
  }

  if (!settings?.capMinutes) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            CARA Time-Log Compliance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tracks countable athletically-related activity time against a weekly cap. Off by
            default -- turn it on only if your program needs it. Once set, each athlete's
            training session starts timing itself the moment they submit their daily check-in.
          </p>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cara-cap">Weekly cap (hours)</Label>
              <Input
                id="cara-cap"
                type="number"
                min={1}
                placeholder="e.g. 20"
                value={capInput}
                onChange={(e) => setCapInput(e.target.value)}
                className="w-32"
              />
            </div>
            <Button
              disabled={!capInput || saveCapMutation.isPending}
              onClick={() => saveCapMutation.mutate(Math.round(Number(capInput) * 60))}
            >
              Turn On
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          CARA Time-Log Compliance
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setLogOpen(true)}>
            <ClipboardPlus className="h-3.5 w-3.5" />
            Log Activity
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exporting !== null}
            onClick={() => handleExport("csv")}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting === "csv" ? "Exporting..." : "CSV"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exporting !== null}
            onClick={() => handleExport("pdf")}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting === "pdf" ? "Exporting..." : "PDF"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => saveCapMutation.mutate(null)}>
            Turn Off
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Weekly cap: {Math.round(settings.capMinutes / 60)} hours. Resets Sunday. Exports cover
          the last 12 weeks for an audit record.
        </p>
        {compliance?.athletes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No athletes yet.</p>
        ) : (
          <div className="space-y-1.5">
            {compliance?.athletes.map((a) => (
              <div
                key={a.athleteId}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                  a.overCap
                    ? "border-destructive/50 bg-destructive/5"
                    : a.atRisk
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-border",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {a.currentlyTraining && (
                    <Timer className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />
                  )}
                  <span className="truncate text-sm font-semibold">{a.name}</span>
                  {(a.atRisk || a.overCap) && (
                    <AlertTriangle
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        a.overCap ? "text-destructive" : "text-amber-500",
                      )}
                    />
                  )}
                </div>
                {/* The figure is now a button. GET /api/coach/cara/:athleteId/history
                    has always returned this week's session-by-session breakdown and
                    had no caller, so a coach seeing "19.4h / 20h" had no way to check
                    or correct it -- and a cap a coach cannot audit is one they will not
                    trust. The CSV/PDF export was the only route to the detail. */}
                <button
                  type="button"
                  onClick={() => setHistoryTarget({ id: a.athleteId, name: a.name })}
                  className="shrink-0 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                >
                  {(a.minutes / 60).toFixed(1)}h / {(a.capMinutes / 60).toFixed(0)}h (
                  {a.percentUsed}%)
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log a Team Activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Athlete</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={logAthleteId}
                onChange={(e) => setLogAthleteId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Select an athlete</option>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Activity type</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={logActivityType}
                onChange={(e) => setLogActivityType(e.target.value as typeof logActivityType)}
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label>Start</Label>
                <Input
                  type="datetime-local"
                  value={logStart}
                  onChange={(e) => setLogStart(e.target.value)}
                  className="w-full min-w-0"
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label>End</Label>
                <Input
                  type="datetime-local"
                  value={logEnd}
                  onChange={(e) => setLogEnd(e.target.value)}
                  className="w-full min-w-0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="e.g. Film review -- last week's game"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!logAthleteId || !logStart || !logEnd || logMutation.isPending}
              onClick={() => logMutation.mutate()}
            >
              Log Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CaraSessionHistoryDialog
        target={historyTarget}
        onOpenChange={(open) => !open && setHistoryTarget(null)}
      />
    </Card>
  );
}

type CaraSession = {
  id: number;
  activityType: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  loggedByCoachId: number | null;
};

const ACTIVITY_LABEL: Record<string, string> = {
  training: "Training",
  meeting: "Team Meeting",
  film_review: "Film Review",
  travel: "Travel",
  other: "Other",
};

/** This week's countable time, session by session.
 *
 * The roster figure above it is a total, and a total is not auditable: a coach looking
 * at "19.4h / 20h" could neither see what made it up nor spot the session that should
 * not be in it. Every session's own end reason is shown, because an auto-closed idle
 * session and a session the athlete ended are different facts about the same row --
 * and a coach-logged meeting is a third.
 */
function CaraSessionHistoryDialog({
  target,
  onOpenChange,
}: {
  target: { id: number; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: sessions = [], isLoading } = useQuery<CaraSession[]>({
    queryKey: [`/api/coach/cara/${target?.id}/history`],
    queryFn: () => getJson(`/api/coach/cara/${target!.id}/history`),
    enabled: target != null,
  });

  const minutesOf = (s: CaraSession) =>
    Math.max(0, (new Date(s.endedAt ?? Date.now()).getTime() - new Date(s.startedAt).getTime()) / 60000);

  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{target?.name}: this week's sessions</DialogTitle>
          <DialogDescription>
            Every countable session since Sunday. An open session counts up to right now, which is
            why the total on the roster moves while someone is training.
          </DialogDescription>
        </DialogHeader>
        {isLoading && <div className="h-20 animate-pulse rounded-md bg-surface" />}
        {!isLoading && sessions.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No countable time recorded this week.
          </p>
        )}
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-md border border-border px-2.5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-semibold">
                  {ACTIVITY_LABEL[s.activityType] ?? s.activityType}
                </span>
                {s.loggedByCoachId != null && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    logged by a coach
                  </span>
                )}
                {s.endedAt == null && (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    open now
                  </span>
                )}
                <span className="ml-auto font-mono tabular-nums">
                  {(minutesOf(s) / 60).toFixed(2)}h
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground">
                {format(new Date(s.startedAt), "EEE d MMM, HH:mm")}
                {s.endedAt ? ` - ${format(new Date(s.endedAt), "HH:mm")}` : ""}
                {s.endReason ? ` · ended: ${s.endReason.replace(/_/g, " ")}` : ""}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
