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
  HeartPulse,
} from "lucide-react";
import { average } from "@/lib/wellness-metrics";
import { Link } from "wouter";
import { GoalsPanel } from "@/components/goals-panel";
import { WeaknessReportPanel } from "@/components/weakness-report-panel";
import { StreakBadges } from "@/components/streak-badge";
import { DigestBanner } from "@/components/digest-banner";
import { TrophyCase, type AthleteTrophyView } from "@/components/trophy-case";
import { TrainingHistoryExportDialog } from "@/components/training-history-export-dialog";
import { ExerciseTrendDialog } from "@/components/exercise-trend-dialog";
import { useIsFreeAgent } from "@/hooks/use-is-free-agent";

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
};

type BodyMetric = {
  id: number;
  date: string;
  weight: number;
  weightUnit: "lbs" | "kg";
  bodyFatPercent: number | null;
  notes: string | null;
};

type WellnessEntry = {
  restingHeartRate: number | null;
  hrv: number | null;
  vo2Max: number | null;
  respiratoryRate: number | null;
  heartRateRecovery: number | null;
};

const RECOVERY_HISTORY_DAYS = 90;

export default function AthleteProgress() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sharingProfile, setSharingProfile] = useState(false);
  const [sharingPrIndex, setSharingPrIndex] = useState<number | null>(null);
  const [trendExercise, setTrendExercise] = useState<{ id: number; name: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const isFreeAgent = useIsFreeAgent() === true;

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

  // Same 90-day window and queryKey as the Recovery & Vitals page (see
  // recovery.tsx) so the two share a react-query cache entry instead of
  // double-fetching. Averages here recompute from this raw data on every
  // render -- there's no stored running total to keep in sync.
  const { data: wellnessHistory } = useQuery<WellnessEntry[]>({
    queryKey: ["/api/athlete/wellness/history", RECOVERY_HISTORY_DAYS],
    queryFn: () => getJson(`/api/athlete/wellness/history?limit=${RECOVERY_HISTORY_DAYS}`),
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
      // On a phone-width screen, two full-text buttons crammed into the same
      // row as the title (AppShell's `actions` slot) squeezed "My Progress"
      // down to an unreadable "M...". They live in `subheader` instead --
      // its own row below the title, same pattern the Library tab strip
      // uses elsewhere -- so the title always renders in full.
      subheader={
        <div className="flex flex-wrap items-center gap-2">
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

          {!!(data?.currentStreak || data?.totalCompleted) && (
            <div className="mb-6 flex flex-wrap gap-2">
              <StreakBadges
                currentStreak={data?.currentStreak ?? 0}
                totalCompleted={data?.totalCompleted ?? 0}
              />
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Recent PRs
                </CardTitle>
                <CardDescription>
                  Your current best on each lift, most recent first -- tap one to see the trend.
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0">
                <Link href="/athlete/lift-history">View Full History</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data?.recentPRs.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Log some sets to start tracking PRs.
                </p>
              )}
              {data?.recentPRs.slice(0, 5).map((pr, i) => (
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
                canSuggest={isFreeAgent}
              />
            </CardContent>
          </Card>

          {!!wellnessHistory?.some(
            (w) =>
              w.restingHeartRate != null ||
              w.hrv != null ||
              w.vo2Max != null ||
              w.respiratoryRate != null ||
              w.heartRateRecovery != null,
          ) && (
            <Card className="mt-4">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <HeartPulse className="h-5 w-5 text-primary" />
                    Recovery & Vitals
                  </CardTitle>
                  <CardDescription>
                    {RECOVERY_HISTORY_DAYS}-day averages from your synced Apple Health data --
                    recalculated every time you check in.
                  </CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link href="/athlete/recovery">View Trends</Link>
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {(
                  [
                    { key: "restingHeartRate", label: "Resting HR", unit: "bpm", decimals: 0 },
                    { key: "hrv", label: "HRV", unit: "ms", decimals: 0 },
                    { key: "vo2Max", label: "VO2 Max", unit: "", decimals: 1 },
                    { key: "respiratoryRate", label: "Resp. Rate", unit: "br/min", decimals: 1 },
                    { key: "heartRateRecovery", label: "HRR", unit: "bpm", decimals: 0 },
                  ] as const
                ).map((m) => {
                  const avg = average((wellnessHistory ?? []).map((w) => w[m.key]));
                  return (
                    <div key={m.key}>
                      <p className="font-display text-xl font-bold">
                        {avg == null ? "--" : `${avg.toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ""}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Coach-only feature -- a Free Agent has no coach to read this
              PT/S&C deficit analysis alongside them, so it stays hidden
              entirely until they have one. See the /api/athlete/weakness-reports
              route comment for how visibility ties to the active coach link. */}
          {!isFreeAgent && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Weakness Report
                </CardTitle>
                <CardDescription>Generated by your coach -- ask them for a new one.</CardDescription>
              </CardHeader>
              <CardContent>
                <WeaknessReportPanel fetchUrl="/api/athlete/weakness-reports" canGenerate={false} />
              </CardContent>
            </Card>
          )}

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
                className="grid grid-cols-2 gap-3"
              >
                {/* Date gets its own row so iOS's native date picker (which
                    ignores the grid column's width and renders at its own
                    intrinsic size) can't overlap the Weight field beside
                    it -- capped to a sane max-width, though, so the box
                    itself doesn't balloon out to the full card width for
                    a value this short. */}
                <div className="col-span-2 min-w-0 space-y-1.5">
                  <Label htmlFor="metric-date">Date</Label>
                  <Input
                    id="metric-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full max-w-[200px] min-w-0"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
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
                <div className="min-w-0 space-y-1.5">
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
                <div className="col-span-2 min-w-0 space-y-1.5">
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
                <Button type="submit" disabled={addMetric.isPending} className="col-span-2 w-full">
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

          {/* Bottom of the page, deliberately -- cool to see, but it's a
              record of what's already been earned, not something the
              athlete needs to check regularly the way the cards above are. */}
          <Card className="mt-4">
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

