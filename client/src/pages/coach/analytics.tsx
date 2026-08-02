import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { LineChart as LineChartIcon, Users, Gauge } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

type RosterEntry = { id: number; name: string; email: string };
type TrackedExercise = { id: number; name: string };
type AnalyticsPoint = {
  date: string;
  setNumber: number;
  peakVelocityMps: number | null;
  meanVelocityMps: number | null;
  concentricSeconds: number | null;
  eccentricSeconds: number | null;
  barPathDeviationCm: number | null;
};

/** Coach-only trend view of the video-tracking data (bar speed, tempo, bar
 * path) an athlete's sets have produced. Deliberately has no athlete-facing
 * equivalent -- athletes only see the live number during their own set,
 * this page is where the history/coaching value lives. */
export default function CoachAnalytics() {
  const [athleteId, setAthleteId] = useState<string>("");
  const [exerciseId, setExerciseId] = useState<string>("");

  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });

  const { data: exercises = [] } = useQuery<TrackedExercise[]>({
    queryKey: ["/api/coach/analytics/exercises", athleteId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/analytics/exercises?athleteId=${athleteId}`,
      );
      return res.json();
    },
    enabled: !!athleteId,
  });

  const { data: points = [], isLoading } = useQuery<AnalyticsPoint[]>({
    queryKey: ["/api/coach/analytics", athleteId, exerciseId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/analytics?athleteId=${athleteId}&exerciseId=${exerciseId}`,
      );
      return res.json();
    },
    enabled: !!athleteId && !!exerciseId,
  });

  const chartData = points.map((p) => ({
    ...p,
    label: `${format(parseISO(p.date), "MMM d")} · Set ${p.setNumber}`,
  }));

  const hasVelocity = chartData.some((p) => p.peakVelocityMps != null);
  const hasPath = chartData.some((p) => p.barPathDeviationCm != null);

  function handleAthleteChange(value: string) {
    setAthleteId(value);
    setExerciseId("");
  }

  return (
    <AppShell title="Analytics">
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Athlete</label>
          <Select value={athleteId} onValueChange={handleAthleteChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select an athlete" />
            </SelectTrigger>
            <SelectContent>
              {roster.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Exercise</label>
          <Select value={exerciseId} onValueChange={setExerciseId} disabled={!athleteId}>
            <SelectTrigger>
              <SelectValue
                placeholder={athleteId ? "Select a tracked exercise" : "Pick an athlete first"}
              />
            </SelectTrigger>
            <SelectContent>
              {exercises.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!athleteId && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Pick an athlete to see their bar speed and bar path trends.
            </p>
          </CardContent>
        </Card>
      )}

      {athleteId && exercises.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Gauge className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              No tracked exercises yet for this athlete — turn on Bar Path or Full tracking on an
              exercise in the program builder to start collecting data.
            </p>
          </CardContent>
        </Card>
      )}

      {athleteId && exercises.length > 0 && !exerciseId && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <LineChartIcon className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Select a tracked exercise to see its trend.</p>
          </CardContent>
        </Card>
      )}

      {athleteId && exerciseId && !isLoading && chartData.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Gauge className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              No tracked sets logged for this exercise yet.
            </p>
          </CardContent>
        </Card>
      )}

      {athleteId && exerciseId && chartData.length > 0 && (
        <div className="space-y-4">
          {hasVelocity && (
            <Card>
              <CardHeader>
                <CardTitle>Bar Speed</CardTitle>
                <CardDescription>Peak and mean concentric velocity per tracked set.</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="peakVelocityMps"
                      name="Peak velocity"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="meanVelocityMps"
                      name="Mean velocity"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasPath && (
            <Card>
              <CardHeader>
                <CardTitle>Bar Path Deviation</CardTitle>
                <CardDescription>
                  How far the bar drifted from a straight vertical line, per tracked set.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="barPathDeviationCm"
                      name="Deviation"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasVelocity && (
            <Card>
              <CardHeader>
                <CardTitle>Tempo</CardTitle>
                <CardDescription>Average concentric vs. eccentric duration per set.</CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="concentricSeconds"
                      name="Concentric"
                      stroke="hsl(var(--success))"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="eccentricSeconds"
                      name="Eccentric"
                      stroke="#a855f7"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}
