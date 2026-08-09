import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { apiRequest, getJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { shareOrDownloadFile, shareOrDownloadBlob } from "@/lib/share-file";
import { renderPrShareCard } from "@/lib/share-card";
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
import {
  Crown,
  Dumbbell,
  CalendarCheck,
  Flame,
  Scale,
  Trash2,
  TrendingUp,
  Share2,
  Target,
  Trophy,
  FileDown,
  Sparkles,
} from "lucide-react";
import { GoalsPanel } from "@/components/goals-panel";
import { WeaknessReportPanel } from "@/components/weakness-report-panel";
import { StreakBadges } from "@/components/streak-badge";
import { DigestBanner } from "@/components/digest-banner";
import { TrophyCase, type AthleteTrophyView } from "@/components/trophy-case";
import { TrainingHistoryExportDialog } from "@/components/training-history-export-dialog";

type ProgressSummary = {
  totalWorkoutsCompleted: number;
  workoutsThisMonth: number;
  currentStreak: number;
  totalCompleted: number;
  recentPRs: {
    exerciseId: number;
    exerciseName: string;
    weight: number;
    unit: string;
    reps: string;
    date: string;
  }[];
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
  const [sharingProfile, setSharingProfile] = useState(false);
  const [sharingPrIndex, setSharingPrIndex] = useState<number | null>(null);
  const [trendExercise, setTrendExercise] = useState<{ id: number; name: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { data: coaches } = useQuery<{ id: number }[]>({
    queryKey: ["/api/athlete/coaches"],
    enabled: user?.role === "athlete",
  });
  const isFreeAgent = !!coaches && coaches.length === 0;

  async function handleSharePr(
    pr: {
      exerciseName: string;
      weight: number;
      unit: string;
      reps: string;
      date: string;
    },
    index: number,
  ) {
    setSharingPrIndex(index);
    try {
      const blob = await renderPrShareCard({
        athleteName: user?.name ?? "Athlete",
        exerciseName: pr.exerciseName,
        weight: pr.weight,
        unit: pr.unit,
        reps: pr.reps,
        dateLabel: format(parseISO(pr.date), "MMM d, yyyy"),
      });
      await shareOrDownloadBlob(blob, `${pr.exerciseName}-pr.png`, `New PR: ${pr.exerciseName}`);
    } catch {
      toast.error("Couldn't generate that share card");
    } finally {
      setSharingPrIndex(null);
    }
  }

  async function handleShareProfile() {
    setSharingProfile(true);
    try {
      await shareOrDownloadFile(
        "/api/athlete/recruiting-profile.pdf",
        `${user?.name ?? "athlete"}-recruiting-profile.pdf`,
        "My Forge Recruiting Profile",
      );
    } catch {
      toast.error("Couldn't generate your recruiting profile");
    } finally {
      setSharingProfile(false);
    }
  }

  const { data, isLoading } = useQuery<ProgressSummary>({
    queryKey: ["/api/athlete/progress"],
    queryFn: () => getJson("/api/athlete/progress"),
  });

  const { data: trophies } = useQuery<AthleteTrophyView[]>({
    queryKey: ["/api/athlete/trophies"],
    queryFn: () => getJson("/api/athlete/trophies"),
  });

  const { data: metrics } = useQuery<BodyMetric[]>({
    queryKey: ["/api/athlete/body-metrics"],
    queryFn: () => getJson("/api/athlete/body-metrics"),
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
    <AppShell
      title="My Progress"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <FileDown className="h-4 w-4" />
            Export History
          </Button>
          <Button variant="outline" size="sm" onClick={handleShareProfile} disabled={sharingProfile}>
            <Share2 className="h-4 w-4" />
            Share Recruiting Profile
          </Button>
        </div>
      }
    >
      <p className="mb-6 text-sm text-muted-foreground">
        A quick look at your own numbers -- for the full breakdown (velocity trends, bar path,
        team rankings), ask your coach.
      </p>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      ) : (
        <>
          <DigestBanner />

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
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
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">
                    {data?.workoutsThisMonth ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Workouts this month</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">{data?.currentStreak ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Current streak</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {(data?.currentStreak || data?.totalCompleted) && (
            <div className="mb-6 flex flex-wrap gap-2">
              <StreakBadges
                currentStreak={data?.currentStreak ?? 0}
                totalCompleted={data?.totalCompleted ?? 0}
              />
            </div>
          )}

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Trophy Case
              </CardTitle>
              <CardDescription>
                Every milestone you've ever unlocked -- they stack, and they're yours for good.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrophyCase trophies={trophies ?? []} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Recent PRs
                </CardTitle>
                <CardDescription>
                  Your current best on each lift, most recent first -- tap one to see the trend.
                </CardDescription>
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
                    className="flex items-center gap-1 rounded-md border border-border p-3 transition-colors hover:border-primary/50 hover:bg-surface"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setTrendExercise({ id: pr.exerciseId, name: pr.exerciseName })
                      }
                      className="flex flex-1 items-center justify-between text-left"
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
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      aria-label={`Share ${pr.exerciseName} PR`}
                      disabled={sharingPrIndex === i}
                      onClick={() => handleSharePr(pr, i)}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
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
                <Target className="h-5 w-5 text-primary" />
                Goals
              </CardTitle>
              <CardDescription>
                Set a target for a lift or testing metric and track progress toward it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GoalsPanel
                goalsUrl="/api/athlete/goals"
                exercisesUrl="/api/athlete/exercises-with-history"
                skillExercisesUrl="/api/athlete/skill-exercises-with-history"
              />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Weakness Report
              </CardTitle>
              <CardDescription>
                {isFreeAgent
                  ? "AI analysis of your ROM, asymmetry, load, wellness, and testing data."
                  : "AI analysis of your ROM, asymmetry, load, wellness, and testing data -- ask your coach to generate a new one."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WeaknessReportPanel
                fetchUrl="/api/athlete/weakness-reports"
                generateUrl="/api/athlete/weakness-report"
                canGenerate={isFreeAgent}
              />
            </CardContent>
          </Card>

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

      <ExerciseTrendDialog
        exercise={trendExercise}
        onOpenChange={(open) => {
          if (!open) setTrendExercise(null);
        }}
      />

      <TrainingHistoryExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        athleteName={user?.name ?? "Athlete"}
        csvUrl="/api/athlete/training-history.csv"
        pdfUrl="/api/athlete/training-history.pdf"
      />
    </AppShell>
  );
}

type ExerciseHistoryPoint = {
  date: string;
  weight: number;
  weightUnit: "lbs" | "kg";
  estimatedOneRm: number | null;
  isPR: boolean;
};

/** The one piece of "growth over time" this deliberately limited page shows --
 * just weight & est. 1RM for the exercise tapped in Recent PRs. Everything
 * else (velocity, bar path, tempo) stays coach-only in the full analytics
 * page. */
function ExerciseTrendDialog({
  exercise,
  onOpenChange,
}: {
  exercise: { id: number; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: history = [], isLoading } = useQuery<ExerciseHistoryPoint[]>({
    queryKey: ["/api/athlete/exercise-history", exercise?.id],
    queryFn: () => getJson(`/api/athlete/exercise-history?exerciseId=${exercise!.id}`),
    enabled: exercise != null,
  });

  const chartData = history.map((p) => ({
    label: format(parseISO(p.date), "MMM d"),
    weight: p.weight,
    estimatedOneRm: p.estimatedOneRm,
    isPR: p.isPR,
  }));
  const unit = history.find((p) => p.weightUnit)?.weightUnit ?? "lbs";

  return (
    <Dialog open={exercise != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{exercise?.name} — Growth Trend</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="h-64 animate-pulse rounded-md bg-surface" />
        ) : chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Not enough logged sets yet to show a trend.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                  formatter={(value: unknown, name: unknown, item: any) => [
                    `${value} ${unit}${item?.payload?.isPR ? " — PR!" : ""}`,
                    String(name),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  name="Weight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  connectNulls
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="estimatedOneRm"
                  name="Est. 1RM"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  connectNulls
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
