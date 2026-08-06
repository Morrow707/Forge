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
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ShieldCheck, ClipboardPlus, AlertTriangle, Timer } from "lucide-react";

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
  const [logOpen, setLogOpen] = useState(false);
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
          <Button size="sm" variant="outline" onClick={() => saveCapMutation.mutate(null)}>
            Turn Off
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Weekly cap: {Math.round(settings.capMinutes / 60)} hours. Resets Sunday.
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
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {(a.minutes / 60).toFixed(1)}h / {(a.capMinutes / 60).toFixed(0)}h (
                  {a.percentUsed}%)
                </span>
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
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input
                  type="datetime-local"
                  value={logStart}
                  onChange={(e) => setLogStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input
                  type="datetime-local"
                  value={logEnd}
                  onChange={(e) => setLogEnd(e.target.value)}
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
    </Card>
  );
}
