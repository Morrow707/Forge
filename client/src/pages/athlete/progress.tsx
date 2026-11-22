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
import { shareCardBrandFromCache } from "@/lib/share-card";
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
import { VideoReviewList } from "@/components/video-review-list";
import { AskCoachForReview } from "@/components/ask-coach-for-review";
import { StrengthProfileCard } from "@/components/strength-profile-card";
import { StandingHeightPanel } from "@/components/standing-height-panel";
import { VideoWorkbenchCard } from "@/components/video-workbench";
import { ReadFailed } from "@/components/read-failed";
import { WeaknessReportPanel } from "@/components/weakness-report-panel";
import { StreakBadges } from "@/components/streak-badge";
import { DigestBanner } from "@/components/digest-banner";
import { TrophyCase, type AthleteTrophyView } from "@/components/trophy-case";
import type { TrophyDefinition } from "@shared/achievements";
import { TrainingHistoryExportDialog } from "@/components/training-history-export-dialog";
import { ExerciseTrendDialog } from "@/components/exercise-trend-dialog";
import { MuscleHeatMap } from "@/components/muscle-heat-map";
import { useIsFreeAgent } from "@/hooks/use-is-free-agent";
import { todayIso } from "@/lib/local-date";

import { formatDate, msg, useT } from "@/i18n";
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
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sharingProfile, setSharingProfile] = useState(false);
  const [sharingPrIndex, setSharingPrIndex] = useState<number | null>(null);
  const [trendExercise, setTrendExercise] = useState<{ id: number; name: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  /* THE HOOK IS TRI-STATE AND ONE BOOLEAN CANNOT BE SAFE IN BOTH POLARITIES (2026-10-24).
   *
   * `useIsFreeAgent` returns `boolean | undefined` and its own doc says callers "should treat
   * [undefined] as 'not yet', not as 'no', so an AI control never flickers into view for a
   * coached athlete during the first load". `=== true` honours that for the `isFreeAgent` reads
   * -- which is what it was written for -- and inverts it for the `!isFreeAgent` ones: while the
   * answer is unknown, `!isFreeAgent` is TRUE, so a Free Agent was shown the coach cards
   * ("Coach reviews", "Ask your coach to check a lift") until /api/athlete/coaches landed. The
   * cards this repo removed in 2026-09-22 on the grounds that they "described something that
   * could not happen" came back for the length of one request.
   *
   * So the two polarities are two names. `coachKnown` is the "not yet" the hook asks for, and a
   * coach-only block takes both: nothing about a coach is drawn until there is an answer. */
  const freeAgentAnswer = useIsFreeAgent();
  const isFreeAgent = freeAgentAnswer === true;
  const coachKnown = freeAgentAnswer !== undefined;
  const hasCoach = coachKnown && !isFreeAgent;

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
        brand: shareCardBrandFromCache(),
        athleteName: user?.name ?? "Athlete",
        exerciseName: pr.exerciseName,
        weight: pr.weight,
        unit: pr.unit,
        reps: pr.reps,
        dateLabel: format(parseISO(pr.date), "MMM d, yyyy"),
      });
      await shareOrDownloadBlob(blob, `${pr.exerciseName}-pr.png`, `New PR: ${pr.exerciseName}`);
    } catch {
      toast.error(t("Couldn't generate that share card"));
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
      toast.error(t("Couldn't generate your recruiting profile"));
    } finally {
      setSharingProfile(false);
    }
  }

  const { data, isLoading, isError, refetch } = useQuery<ProgressSummary>({
    queryKey: ["/api/athlete/progress"],
    queryFn: () => getJson("/api/athlete/progress"),
  });

  const { data: trophies } = useQuery<AthleteTrophyView[]>({
    queryKey: ["/api/athlete/trophies"],
    queryFn: () => getJson("/api/athlete/trophies"),
  });
  const { data: programTrophies } = useQuery<TrophyDefinition[]>({
    queryKey: ["/api/athlete/program-trophies"],
    queryFn: () => getJson("/api/athlete/program-trophies"),
  });

  const {
    data: metrics,
    isError: metricsFailed,
    refetch: refetchMetrics,
  } = useQuery<BodyMetric[]>({
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

  const [date, setDate] = useState(() => todayIso());
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
      toast.success(t("Logged"));
    },
    onError: () => toast.error(t("Couldn't save that entry")),
  });

  const deleteMetric = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/athlete/body-metrics/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/athlete/body-metrics"] }),
    // Without this a failed delete is completely silent: the row stays on screen
    // with no toast, which reads as the button doing nothing.
    onError: () => toast.error(t("Couldn't delete that entry")),
  });

  const chartData = (metrics ?? []).map((m) => ({
    label: formatDate(parseISO(m.date), { month: "short", day: "numeric" }),
    weight: m.weight,
  }));

  return (
    <AppShell
      title={t("My Progress")}
      // On a phone-width screen, two full-text buttons crammed into the same
      // row as the title (AppShell's `actions` slot) squeezed "My Progress"
      // down to an unreadable "M...". They live in `subheader` instead --
      // its own row below the title, same pattern the Library tab strip
      // uses elsewhere -- so the title always renders in full.
      subheader={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <FileDown className="h-4 w-4" />
            {t("Export History")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleShareProfile} disabled={sharingProfile}>
            <Share2 className="h-4 w-4" />
            {t("Share Recruiting Profile")}
          </Button>
        </div>
      }
    >
      <p className="mb-6 text-sm text-muted-foreground">
        {t("A quick look at your own numbers, for the full breakdown (velocity trends, bar path, team rankings), ask your coach.")}
      </p>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      ) : (
        // SPACING BELONGS TO THE COLUMN, NOT TO EACH CARD.
        //
        // Every card here carried its own mb-6, and StrengthProfileCard -- which renders a bare
        // Card, as a shared component should -- carried none, so it sat flush against the card
        // below it while everything else had a gap. Reported as "the spacing is wrong and
        // different on this page". A rule each child has to remember is a rule the next shared
        // component will not know about; a gap owned by the parent applies to whatever is
        // dropped into it.
        <div className="space-y-6">
          <DigestBanner />

          {/* Without this the three tiles below read 0 / 0 / 0 and the PR card says
              "log some sets to start tracking PRs" -- a failed read stated as fact
              about an athlete who may have years of them. The rest of the page is
              backed by its own queries, so it still renders. */}
          {isError && (
            <Card>
              <CardContent className="py-8">
                <ReadFailed what={t("your training summary")} onRetry={() => void refetch()} />
              </CardContent>
            </Card>
          )}

          {/* EVERY CARD THAT NEEDS A COACH IS HIDDEN FROM SOMEONE WHO HAS NONE.
              A Free Agent has no coach by definition, so all three of these described something
              that could not happen: a list that can never fill, a breakdown whose whole purpose
              is sending it to somebody, and a request with no recipient. Reported 2026-09-22 --
              "what the does ask a coach do? What coach? The free agent doesn't have one".
              A coached athlete keeps all three unchanged. */}
          {hasCoach && (
            <>
              {/* Reviews the coach has SHARED. The route returns only those, so nothing here
                  has to filter -- and nothing here can accidentally stop filtering. */}
              <Card>
                <CardContent className="space-y-3 p-5">
                  <p className="font-semibold">{t("Coach reviews")}</p>
                  <VideoReviewList
                    mode="read-only"
                    fetchUrl="/api/athlete/video-reviews"
                    reviewUrl={(id) => `/api/athlete/video-reviews/${id}`}
                    emptyHint={t("When your coach breaks down one of your lifts, it shows up here.")}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {/* WHAT REPLACES THE COACH CARDS FOR A FREE AGENT. They lost three cards that all
              ended at a coach who does not exist; this is the one that ends somewhere real --
              their own footage, their own phone. Gated on the add-on by the server, so it is
              simply absent for anybody without it. */}
          {isFreeAgent && <VideoWorkbenchCard />}

          {/* Where each movement sits against athletes the same age. Percentile only, never a
              rank, and never a name -- see getStrengthPercentilesForAthlete. */}
          <StrengthProfileCard fetchUrl="/api/athlete/strength-profile" />

          {/* The athlete's OWN breakdowns of their own lifts. Kept apart from "Coach reviews"
              above on purpose: one list mixing the two would leave an athlete unable to tell
              their own notes from their coach's.

              SHOWN TO A FREE AGENT TOO, SINCE 2026-10-24, BECAUSE THEY CAN ALREADY MAKE THESE.
              This card was inside the `!isFreeAgent` block, on the argument that "the sending is
              the point -- a self-review with nowhere to send it is a feature that stops halfway",
              and that was true when it was written. The Video workbench above (line ~295) is what
              changed it: `VideoWorkbenchCard` passes `subject={{ kind: "self" }}`, video-compare's
              "Save as review" button is drawn for every subject except a guardian, and for a self
              subject it POSTs to /api/athlete/self-reviews -- which is `requireRole("athlete")`
              with no requireFreeAgent, so it succeeds. So a Free Agent on AI Coach + Video could
              save a review, edit it in that one dialog, and never see it again: this list is the
              ONLY surface in the client that renders `mode="self"` (one hit, grep it).

              That is the exact inverse of the bug video-compare's own comment records fixing --
              "both saved-review lists promised something no button could produce" -- and nothing
              said it had happened, because a persisted row and a row that was never saved look
              the same from the screen.

              `canSend` is what keeps the original argument honest: with no coach there is no
              "Send to coach" button in the editor and the empty hint does not promise one. It
              takes `hasCoach`, not `!isFreeAgent`, for the tri-state reason above -- the button
              must not flash while the answer is unknown. The empty HINT may read off
              `isFreeAgent` because both of its sentences are about this athlete's own footage
              and neither offers anything a Free Agent cannot do. */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="font-semibold">{t("Your own reviews")}</p>
              <VideoReviewList
                mode="self"
                fetchUrl="/api/athlete/self-reviews"
                reviewUrl={(id) => `/api/athlete/self-reviews/${id}`}
                canSend={hasCoach}
                emptyHint={
                  isFreeAgent
                    ? t("Break down one of your own lifts from the compare tool above and it will be saved here.")
                    : t("Break down one of your own lifts from the compare tool, then send it to your coach.")
                }
              />
            </CardContent>
          </Card>

          {hasCoach && (
            <>
              {/* The other direction: what the athlete has ASKED for, and whether it came back.
                  A button that fires and forgets would leave them exactly where they started --
                  which is the failure the queue exists for. Still coach-only, and correctly so:
                  unlike the list above, this one has no recipient at all without a coach. */}
              <Card>
                <CardContent className="space-y-3 p-5">
                  <p className="font-semibold">{t("Ask your coach to check a lift")}</p>
                  <AskCoachForReview />
                </CardContent>
              </Card>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">
                    {data?.totalWorkoutsCompleted ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">{t("Workouts completed all-time")}</p>
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
                  <p className="text-sm text-muted-foreground">{t("Workouts this month")}</p>
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
                  <p className="text-sm text-muted-foreground">{t("Current streak")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {!!(data?.currentStreak || data?.totalCompleted) && (
            <div className="flex flex-wrap gap-2">
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
                  {t("Recent PRs")}
                </CardTitle>
                <CardDescription>
                  {t("Your current best on each lift, most recent first, tap one to see the trend.")}
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0">
                <Link href="/athlete/lift-history">{t("View Full History")}</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!isError && !data?.recentPRs.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("Log some sets to start tracking PRs.")}
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
                        {t.date(parseISO(pr.date), { month: "short", day: "numeric", year: "numeric" })}
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
                    aria-label={t("Share {exerciseName} PR", { exerciseName: t.exercise(pr.exerciseName) })}
                    disabled={sharingPrIndex === i}
                    onClick={() => handleSharePr(pr, i)}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="mt-4">
            <MuscleHeatMap />
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {t("Goals")}
              </CardTitle>
              <CardDescription>
                {t("Set a target for a lift or testing metric and track progress toward it.")}
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
                    {t("Recovery & Vitals")}
                  </CardTitle>
                  <CardDescription>
                    {t("{RECOVERYHISTORYDAYS}-day averages from your synced Apple Health data, recalculated every time you check in.", { RECOVERYHISTORYDAYS: RECOVERY_HISTORY_DAYS })}</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link href="/athlete/recovery">{t("View Trends")}</Link>
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {(
                  [
                    { key: "restingHeartRate", label: msg("Resting HR"), unit: "bpm", decimals: 0 },
                    { key: "hrv", label: "HRV", unit: "ms", decimals: 0 },
                    { key: "vo2Max", label: "VO2 Max", unit: "", decimals: 1 },
                    { key: "respiratoryRate", label: msg("Resp. Rate"), unit: "br/min", decimals: 1 },
                    { key: "heartRateRecovery", label: "HRR", unit: "bpm", decimals: 0 },
                  ] as const
                ).map((m) => {
                  const avg = average((wellnessHistory ?? []).map((w) => w[m.key]));
                  return (
                    <div key={m.key}>
                      <p className="font-display text-xl font-bold">
                        {avg == null ? "--" : `${avg.toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ""}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{t(m.label)}</p>
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
          {hasCoach && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {t("Weakness Report")}
                </CardTitle>
                <CardDescription>{t("Generated by your coach, ask them for a new one.")}</CardDescription>
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
                {t("Body Metrics")}
              </CardTitle>
              <CardDescription>
                {t("Track your weight over time. No photos, just the numbers.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!weight) {
                    toast.error(t("Enter a weight"));
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
                  <Label htmlFor="metric-date">{t("Date")}</Label>
                  <Input
                    id="metric-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={todayIso()}
                    className="w-full max-w-[200px] min-w-0"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="metric-weight">{t("Weight")}</Label>
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
                  <Label htmlFor="metric-unit">{t("Unit")}</Label>
                  <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as "lbs" | "kg")}>
                    <SelectTrigger id="metric-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lbs">{t("lbs")}</SelectItem>
                      <SelectItem value="kg">{t("kg")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 min-w-0 space-y-1.5">
                  <Label htmlFor="metric-bf">{t("Body fat % (optional)")}</Label>
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
                  {t("Log Entry")}
                </Button>
              </form>

              {/* The same component the coach's metrics tab uses, so the prompt and the cadence
                  cannot diverge between the two surfaces that type a body measurement. */}
              <div className="border-t pt-4">
                <StandingHeightPanel fetchUrl="/api/athlete/heights" />
              </div>

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
                {metricsFailed && (
                  <ReadFailed
                    what={t("your body metrics")}
                    onRetry={() => void refetchMetrics()}
                  />
                )}
                {!metricsFailed && !metrics?.length && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t("No entries yet, log your first weigh-in above.")}
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
                              {t("{bodyFatPercent}% BF", { bodyFatPercent: m.bodyFatPercent })}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.date(parseISO(m.date), { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("Delete entry")}
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
                {t("Trophy Case")}
              </CardTitle>
              <CardDescription>
                {t("Every milestone you've ever unlocked, they stack, and they're yours for good.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrophyCase trophies={trophies ?? []} programTrophies={programTrophies ?? []} />
            </CardContent>
          </Card>
        </div>
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

