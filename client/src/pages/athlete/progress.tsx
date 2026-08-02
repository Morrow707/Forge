import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Crown, Dumbbell, CalendarCheck, Flame, Scale, Trash2 } from "lucide-react";

type ProgressSummary = {
  totalWorkoutsCompleted: number;
  workoutsThisMonth: number;
  recentPRs: { exerciseName: string; weight: number; unit: string; reps: string; date: string }[];
  currentLifts: { exerciseName: string; weight: string; unit: string; reps: string; date: string }[];
};

type BodyMetric = {
  id: number;
  date: string;
  weight: number;
  weightUnit: "lbs" | "kg";
  bodyFatPercent: number | null;
  notes: string | null;
};

export default function AthleteProgress() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ProgressSummary>({
    queryKey: ["/api/athlete/progress"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/athlete/progress");
      return res.json();
    },
  });

  const { data: metrics } = useQuery<BodyMetric[]>({
    queryKey: ["/api/athlete/body-metrics"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/athlete/body-metrics");
      return res.json();
    },
  });

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"lbs" | "kg">(user?.preferredWeightUnit ?? "lbs");
  const [bodyFatPercent, setBodyFatPercent] = useState("");

  const addMetric = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/athlete/body-metrics", {
        date,
        weight: Number(weight),
        weightUnit,
        bodyFatPercent: bodyFatPercent ? Number(bodyFatPercent) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/body-metrics"] });
      setWeight("");
      setBodyFatPercent("");
      toast.success("Logged");
    },
    onError: () => toast.error("Couldn't save that entry"),
  });

  const deleteMetric = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/athlete/body-metrics/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/athlete/body-metrics"] }),
  });

  const chartData = (metrics ?? []).map((m) => ({
    label: format(parseISO(m.date), "MMM d"),
    weight: m.weight,
  }));

  return (
    <AppShell title="My Progress">
      <p className="mb-6 text-sm text-muted-foreground">
        A quick look at your own numbers -- for the full breakdown (velocity trends, bar path,
        team rankings), ask your coach.
      </p>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">
                    {data?.totalWorkoutsCompleted ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Workouts completed all-time</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">
                    {data?.workoutsThisMonth ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Workouts this month</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Recent PRs
                </CardTitle>
                <CardDescription>Your latest personal records, most recent first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!data?.recentPRs.length && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Log some sets to start tracking PRs.
                  </p>
                )}
                {data?.recentPRs.map((pr, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="font-semibold">{pr.exerciseName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(pr.date), "MMM d, yyyy")}
                      </p>
                    </div>
                    <p className="font-display text-lg font-bold text-primary">
                      {pr.weight} {pr.unit} × {pr.reps}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Dumbbell className="h-5 w-5 text-primary" />
                  Your Lifts
                </CardTitle>
                <CardDescription>Most recently logged set for each exercise.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!data?.currentLifts.length && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nothing logged yet.
                  </p>
                )}
                {data?.currentLifts.map((lift, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="font-semibold">{lift.exerciseName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(lift.date), "MMM d, yyyy")}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-muted-foreground">
                      {lift.weight} {lift.unit} × {lift.reps}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                Body Metrics
              </CardTitle>
              <CardDescription>
                Track your weight over time. No photos -- just the numbers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!weight) {
                    toast.error("Enter a weight");
                    return;
                  }
                  addMetric.mutate();
                }}
                className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="metric-date">Date</Label>
                  <Input
                    id="metric-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="metric-weight">Weight</Label>
                  <Input
                    id="metric-weight"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="185"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="metric-unit">Unit</Label>
                  <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as "lbs" | "kg")}>
                    <SelectTrigger id="metric-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lbs">lbs</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="metric-bf">Body fat % (optional)</Label>
                  <Input
                    id="metric-bf"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    max="100"
                    value={bodyFatPercent}
                    onChange={(e) => setBodyFatPercent(e.target.value)}
                    placeholder="15"
                  />
                </div>
                <Button type="submit" disabled={addMetric.isPending}>
                  Log Entry
                </Button>
              </form>

              {chartData.length >= 2 && (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        width={40}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => `${v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        name="Weight"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="space-y-2">
                {!metrics?.length && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No entries yet -- log your first weigh-in above.
                  </p>
                )}
                {[...(metrics ?? [])]
                  .reverse()
                  .slice(0, 10)
                  .map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-md border border-border p-3"
                    >
                      <div>
                        <p className="font-semibold">
                          {m.weight} {m.weightUnit}
                          {m.bodyFatPercent != null && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                              {m.bodyFatPercent}% BF
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(m.date), "MMM d, yyyy")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Delete entry"
                        onClick={() => deleteMetric.mutate(m.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
