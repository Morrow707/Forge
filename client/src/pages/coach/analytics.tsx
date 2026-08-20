import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioChipGroup } from "@/components/filter-chip-group";
import { PinnedExercisePicker, MAJOR_LIFTS } from "@/components/pinned-exercise-picker";
import { apiRequest, getJson } from "@/lib/queryClient";
import { useDistanceUnit, cmToDisplayUnit, type DistanceUnit } from "@/lib/distance-unit";
import { DistanceUnitToggle } from "@/components/distance-unit-toggle";
import {
  Users,
  Gauge,
  Crown,
  CalendarDays,
  TrendingUp,
  Activity,
  SlidersHorizontal,
  Weight,
  Video,
  ThumbsUp,
  ThumbsDown,
  Target,
  Search,
  Wand2,
  GraduationCap,
  Trophy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { VideoAnalysisDialog } from "@/components/video-analysis-dialog";
import { SkillsTrendsPanel } from "@/components/skills-trends-panel";
import {
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { TESTING_METRICS, type TestingMetricKey } from "@shared/testing-metrics";
import { ACWR_RISK_LABEL, type AcwrRiskLevel } from "@shared/load";
import { ACWR_RISK_CLASSNAME } from "@/components/acwr-history-dialog";
import { MuscleHeatMap } from "@/components/muscle-heat-map";
import { GoalsPanel } from "@/components/goals-panel";

type RosterEntry = { id: number; name: string; email: string };
type TrackedExercise = { id: number; name: string };
type AnalyticsPoint = {
  date: string;
  setNumber: number;
  reps: string | null;
  weight: string | null;
  weightUnit: "lbs" | "kg" | null;
  bandColor: string | null;
  boxHeight: string | null;
  boxHeightUnit: "in" | "m" | null;
  weightMode: "numeric" | "bodyweight" | "band" | "box";
  rpe: number | null;
  estimatedOneRm: number | null;
  isPR: boolean;
  peakVelocityMps: number | null;
  meanVelocityMps: number | null;
  concentricSeconds: number | null;
  eccentricSeconds: number | null;
  barPathDeviationCm: number | null;
  barPathTrace: { t: number; x: number; y: number }[] | null;
  formFaults: { code: string; label: string }[] | null;
  repBreakdown:
    | {
        repNumber: number;
        peakVelocityMps: number;
        meanVelocityMps?: number;
        romCm?: number | null;
        peakPowerWatts?: number | null;
        meanPowerWatts?: number | null;
        depthDeg?: number | null;
        timeToPeakVelocitySeconds?: number;
      }[]
    | null;
  armPathTrace: {
    left: { t: number; x: number; y: number }[];
    right: { t: number; x: number; y: number }[];
  } | null;
  peakPowerWatts: number | null;
  meanPowerWatts: number | null;
  eccentricMeanVelocityMps: number | null;
  romCm: number | null;
  velocityLossPercent: number | null;
  jumpHeightCm: number | null;
  jumpDistanceCm: number | null;
  groundContactSeconds: number | null;
  reactiveStrengthIndex: number | null;
  jumpBreakdown: {
    repNumber: number;
    jumpHeightCm: number;
    groundContactSeconds: number | null;
  }[] | null;
  legDriveAsymmetry: {
    repNumber: number;
    leftDriveDegPerSec: number;
    rightDriveDegPerSec: number;
    asymmetryPercent: number;
    dominantSide: "left" | "right";
  }[] | null;
  armDriveAsymmetry: {
    repNumber: number;
    leftVelocityMps: number;
    rightVelocityMps: number;
    asymmetryPercent: number;
    dominantSide: "left" | "right";
  }[] | null;
  formCheckVideoUrl: string | null;
  formCheckFlag: "best" | "worst" | null;
};

const FAULT_NAMES: Record<string, string> = {
  shallow_depth: "Shallow depth",
  knee_valgus: "Knee valgus",
  forward_lean: "Forward lean",
  bar_path_drift: "Bar path drift",
  bar_tilt: "Bar tilt",
  grip_shift: "Grip shift",
  pelvic_drop: "Pelvic drop",
  ankle_mobility_limit: "Ankle mobility limit",
  arm_fallout: "Arm fallout",
  thoracic_extension_loss: "Thoracic extension loss",
  lockout_symmetry: "Lockout symmetry",
  lockout_lean: "Lockout lean",
};
type RecentSession = {
  date: string;
  dayTitle: string;
  completed: boolean;
  exercises: string[];
  totalReps: number;
  totalVolume: number;
};

// Every chart a coach can turn off in the exercise-detail view below. Keyed
// so hidden choices persist in localStorage as a plain string[] -- a global
// display preference, not tied to any one athlete/exercise.
const CHART_OPTIONS = [
  { key: "weight", label: "Weight & Est. 1RM" },
  { key: "velocity", label: "Bar Speed" },
  { key: "forceVelocity", label: "Force-Velocity Profile" },
  { key: "power", label: "Power Output" },
  { key: "velocityLoss", label: "Velocity Loss" },
  { key: "path", label: "Bar Path Deviation" },
  { key: "jump", label: "Jump Height & Distance" },
  { key: "groundContact", label: "Ground Contact & RSI" },
  { key: "pathShape", label: "Bar Path Shape" },
  { key: "armSymmetry", label: "Arm Symmetry" },
  { key: "legAsymmetry", label: "Leg Drive Asymmetry" },
  { key: "repDecay", label: "Rep-by-Rep Velocity Decay" },
  { key: "tempo", label: "Tempo" },
  { key: "rom", label: "Range of Motion" },
  { key: "faultTrend", label: "Form Fault Trend" },
  { key: "asymmetryTrend", label: "Asymmetry Trend" },
] as const;
type ChartKey = (typeof CHART_OPTIONS)[number]["key"];
const HIDDEN_CHARTS_STORAGE_KEY = "forge-analytics-hidden-charts";
const CHART_TYPE_STORAGE_KEY = "forge-analytics-chart-type";

function loadHiddenCharts(): Set<ChartKey> {
  try {
    const raw = localStorage.getItem(HIDDEN_CHARTS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as ChartKey[]) : new Set();
  } catch {
    return new Set();
  }
}

/** Popover of checkboxes letting a coach hide charts they don't care about
 * for a given exercise -- everything's visible by default, this is purely
 * an opt-out so nothing new here requires the coach to go find a setting. */
function ChartVisibilityMenu({
  hidden,
  onChange,
}: {
  hidden: Set<ChartKey>;
  onChange: (next: Set<ChartKey>) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(key: ChartKey) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
    localStorage.setItem(HIDDEN_CHARTS_STORAGE_KEY, JSON.stringify(Array.from(next)));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Customize charts
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Show / hide charts
        </p>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {CHART_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className="flex items-center gap-2 text-sm hover:cursor-pointer"
            >
              <Checkbox checked={!hidden.has(opt.key)} onCheckedChange={() => toggle(opt.key)} />
              {opt.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Week-bucketed average for a continuous per-rep asymmetry reading (leg or
// arm drive). A set only contributes when one side dominated at least 70% of
// its reps (the same consistency gate storage.ts's
// evaluateLegDriveAsymmetryFlags uses to decide whether to notify the coach)
// -- a set with no clear dominant side isn't a "leans right" data point,
// it's noise.
function bucketAsymmetryByWeek(
  rows: {
    date: string;
    reps: { asymmetryPercent: number; dominantSide: "left" | "right" }[] | null;
  }[],
) {
  const buckets = new Map<string, { sum: number; count: number; leftCount: number; rightCount: number }>();
  for (const row of rows) {
    const reps = row.reps;
    if (!reps || reps.length < 2) continue;
    const leftCount = reps.filter((r) => r.dominantSide === "left").length;
    const rightCount = reps.length - leftCount;
    const consistency = Math.max(leftCount, rightCount) / reps.length;
    if (consistency < 0.7) continue;
    const avgAsymmetryPercent = reps.reduce((sum, r) => sum + r.asymmetryPercent, 0) / reps.length;
    const weekKey = format(startOfWeek(parseISO(row.date), { weekStartsOn: 0 }), "yyyy-MM-dd");
    const bucket = buckets.get(weekKey) ?? { sum: 0, count: 0, leftCount: 0, rightCount: 0 };
    bucket.sum += avgAsymmetryPercent;
    bucket.count += 1;
    if (leftCount >= rightCount) bucket.leftCount += 1;
    else bucket.rightCount += 1;
    buckets.set(weekKey, bucket);
  }
  return buckets;
}

// Same "one continuous percentage per exercise, worth trending across
// weeks" longitudinal view the skills side already has for sprint/mechanics
// (skills-trends-panel.tsx), but for the strength side's leg/arm-drive
// asymmetry -- a single lopsided set is a data point, six straight weeks of
// favoring the same side is an injury-risk flag. Leg and arm buckets are
// computed and merged separately since a given exercise is rarely tracked
// for both at once (legDriveAsymmetry needs a lower-body bilateral lift,
// armDriveAsymmetry needs a shared-bar press/pull).
function weeklyAsymmetryTrend(
  legRows: { date: string; reps: { asymmetryPercent: number; dominantSide: "left" | "right" }[] | null }[],
  armRows: { date: string; reps: { asymmetryPercent: number; dominantSide: "left" | "right" }[] | null }[],
) {
  const legBuckets = bucketAsymmetryByWeek(legRows);
  const armBuckets = bucketAsymmetryByWeek(armRows);
  const weekKeys = Array.from(new Set([...legBuckets.keys(), ...armBuckets.keys()])).sort();
  return weekKeys.map((weekKey) => {
    const leg = legBuckets.get(weekKey);
    const arm = armBuckets.get(weekKey);
    return {
      label: format(parseISO(weekKey), "MMM d"),
      legAsymmetryPercent: leg ? Math.round((leg.sum / leg.count) * 10) / 10 : null,
      legDominantSide: leg ? (leg.leftCount >= leg.rightCount ? "left" : "right") : null,
      armAsymmetryPercent: arm ? Math.round((arm.sum / arm.count) * 10) / 10 : null,
      armDominantSide: arm ? (arm.leftCount >= arm.rightCount ? "left" : "right") : null,
    };
  });
}

function formatSetWeight(p: {
  weightMode: "numeric" | "bodyweight" | "band" | "box";
  weight: string | null;
  weightUnit: "lbs" | "kg" | null;
  bandColor: string | null;
  boxHeight: string | null;
  boxHeightUnit: "in" | "m" | null;
}): string {
  if (p.weightMode === "numeric") return `${p.weight ?? "-"} ${p.weightUnit ?? ""}`;
  if (p.weightMode === "band") return p.bandColor ?? p.weight ?? "Band";
  if (p.weightMode === "box") return `${p.boxHeight ?? "-"} ${p.boxHeightUnit ?? ""}`;
  return "Bodyweight";
}

function fmtNum(value: number | null | undefined, decimals: number): string {
  return value == null ? "-" : value.toFixed(decimals);
}

/** One data series in a trend chart, rendered as either a line or a bar
 * depending on the coach's Line/Bar toggle -- lets every chart below stay a
 * single ComposedChart (which supports both) instead of branching between
 * two whole chart components. */
function TrendSeries({
  chartType,
  dataKey,
  name,
  color,
  strokeWidth = 2,
  strokeDasharray,
  dot = { r: 3 },
  yAxisId,
}: {
  chartType: "line" | "bar";
  dataKey: string;
  name: string;
  color: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  dot?: object | boolean;
  yAxisId?: string;
}) {
  if (chartType === "bar") {
    return <Bar yAxisId={yAxisId} dataKey={dataKey} name={name} fill={color} radius={[3, 3, 0, 0]} />;
  }
  return (
    <Line
      yAxisId={yAxisId}
      type="monotone"
      dataKey={dataKey}
      name={name}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      connectNulls
      dot={dot}
    />
  );
}

function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

type RepRow = NonNullable<AnalyticsPoint["repBreakdown"]>[number];

/** One set's per-rep breakdown, laid out like a VBT app's at-a-glance
 * summary (avg/peak velocity, ROM, avg/peak power, time-to-peak-velocity
 * per rep, plus an averaged row) rather than a line graph -- see
 * RepBreakdownByDate below for why this is the default view. */
function SetRepTable({
  point: p,
  distanceUnit,
  onWatchVideo,
}: {
  point: AnalyticsPoint;
  distanceUnit: DistanceUnit;
  onWatchVideo: (preview: { url: string; flag: "best" | "worst" | null; label: string }) => void;
}) {
  const reps = p.repBreakdown;
  const romInUnit = (r: RepRow) => (r.romCm != null ? cmToDisplayUnit(r.romCm, distanceUnit) : null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">
            Set {p.setNumber}
            {p.isPR && (
              <Badge className="ml-2 gap-1 bg-amber-400 text-black hover:bg-amber-400">
                <Crown className="h-3 w-3" />
                PR
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {formatSetWeight(p)}
            {p.reps ? ` × ${p.reps}` : ""}
            {p.rpe != null ? ` · RPE ${p.rpe}` : ""}
          </CardDescription>
        </div>
        {p.formCheckVideoUrl && (
          <button
            type="button"
            onClick={() =>
              onWatchVideo({
                url: p.formCheckVideoUrl!,
                flag: p.formCheckFlag,
                label: `${format(parseISO(p.date), "MMM d")} · Set ${p.setNumber}`,
              })
            }
            className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Video className="h-3.5 w-3.5" />
            Watch
            {p.formCheckFlag === "best" && <ThumbsUp className="h-3 w-3 text-success" />}
            {p.formCheckFlag === "worst" && <ThumbsDown className="h-3 w-3 text-destructive" />}
          </button>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!reps || reps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not camera-tracked -- no per-rep data.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                <th className="py-1.5 pr-3">Rep</th>
                <th className="py-1.5 pr-3">Avg [m/s]</th>
                <th className="py-1.5 pr-3">Peak [m/s]</th>
                <th className="py-1.5 pr-3">ROM [{distanceUnit}]</th>
                <th className="py-1.5 pr-3">Avg [W]</th>
                <th className="py-1.5 pr-3">Peak [W]</th>
                <th className="py-1.5">TPV [s]</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.repNumber} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 font-semibold">{r.repNumber}</td>
                  <td className="py-1.5 pr-3">{fmtNum(r.meanVelocityMps, 2)}</td>
                  <td className="py-1.5 pr-3">{fmtNum(r.peakVelocityMps, 2)}</td>
                  <td className="py-1.5 pr-3">{fmtNum(romInUnit(r), 1)}</td>
                  <td className="py-1.5 pr-3">{fmtNum(r.meanPowerWatts, 0)}</td>
                  <td className="py-1.5 pr-3">{fmtNum(r.peakPowerWatts, 0)}</td>
                  <td className="py-1.5">{fmtNum(r.timeToPeakVelocitySeconds, 2)}</td>
                </tr>
              ))}
              <tr className="bg-secondary/40 font-semibold">
                <td className="py-1.5 pr-3">Avg</td>
                <td className="py-1.5 pr-3">{fmtNum(average(reps.map((r) => r.meanVelocityMps)), 2)}</td>
                <td className="py-1.5 pr-3">{fmtNum(average(reps.map((r) => r.peakVelocityMps)), 2)}</td>
                <td className="py-1.5 pr-3">{fmtNum(average(reps.map(romInUnit)), 1)}</td>
                <td className="py-1.5 pr-3">{fmtNum(average(reps.map((r) => r.meanPowerWatts)), 0)}</td>
                <td className="py-1.5 pr-3">{fmtNum(average(reps.map((r) => r.peakPowerWatts)), 0)}</td>
                <td className="py-1.5">
                  {fmtNum(average(reps.map((r) => r.timeToPeakVelocitySeconds)), 2)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/** Default exercise-history view: pick one workout date, see every set
 * logged that day as its own per-rep table -- the "how did today go"
 * question a coach actually opens this page to answer, without reading a
 * line graph to get there. Line Graph and All Trends (see CoachAnalytics)
 * cover the longer-arc questions instead. */
function RepBreakdownByDate({
  chartData,
  selectedDate,
  onSelectDate,
  distanceUnit,
  onWatchVideo,
}: {
  chartData: AnalyticsPoint[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  distanceUnit: DistanceUnit;
  onWatchVideo: (preview: { url: string; flag: "best" | "worst" | null; label: string }) => void;
}) {
  const dates = Array.from(new Set(chartData.map((p) => p.date))).sort().reverse();
  const effectiveDate = dates.includes(selectedDate) ? selectedDate : dates[0];
  const setsForDate = chartData
    .filter((p) => p.date === effectiveDate)
    .sort((a, b) => a.setNumber - b.setNumber);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Select value={effectiveDate} onValueChange={onSelectDate}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dates.map((d) => (
              <SelectItem key={d} value={d}>
                {format(parseISO(d), "EEE, MMM d, yyyy")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {setsForDate.map((p) => (
        <SetRepTable
          key={p.setNumber}
          point={p}
          distanceUnit={distanceUnit}
          onWatchVideo={onWatchVideo}
        />
      ))}
    </div>
  );
}

/** Coach-only performance history -- weight, PRs, and (when tracked)
 * velocity/bar-path/tempo for one athlete's exercise. Deliberately has no
 * athlete-facing equivalent -- athletes only see the live number during
 * their own set, this page is where the history/coaching value lives. */
export default function CoachAnalytics() {
  const [distanceUnit] = useDistanceUnit();
  // A "View Analytics" link elsewhere (e.g. the day-edit dialog, or a
  // video/comment notification) can deep-link straight to a specific
  // athlete + exercise via these params instead of requiring the coach to
  // reselect both from the dropdowns below every time -- read once on
  // mount; the dropdowns own the state from here.
  const initialParams = new URLSearchParams(useSearch());
  const [athleteId, setAthleteId] = useState<string>(initialParams.get("athleteId") ?? "");
  const [athleteSearch, setAthleteSearch] = useState("");
  const [exerciseId, setExerciseId] = useState<string>(initialParams.get("exerciseId") ?? "");
  const [hiddenCharts, setHiddenCharts] = useState<Set<ChartKey>>(() => loadHiddenCharts());
  // Three ways to look at the same exercise history: a quick per-set,
  // per-rep breakdown for one workout ("byDate", the default -- a coach
  // opening this page wants to see today's numbers at a glance, not parse a
  // line graph), a raw table across every date ("trends"), or the original
  // suite of line graphs for spotting a longer trend visually ("chart").
  const [viewMode, setViewMode] = useState<"byDate" | "trends" | "chart">("byDate");
  const [selectedDate, setSelectedDate] = useState("");
  // Line vs. bar rendering for the Line Graph mode's trend charts -- purely
  // a display preference, so it lives alongside the other localStorage'd
  // chart prefs rather than resetting every time the coach switches athlete
  // or exercise.
  const [chartType, setChartType] = useState<"line" | "bar">(
    () => (localStorage.getItem(CHART_TYPE_STORAGE_KEY) === "bar" ? "bar" : "line"),
  );
  function handleChartTypeChange(next: "line" | "bar") {
    setChartType(next);
    localStorage.setItem(CHART_TYPE_STORAGE_KEY, next);
  }
  // Read-only preview of an athlete's per-set form-check clip from the raw
  // table below -- unlike the comment-thread video annotation flow, a coach
  // can't retake/remove/re-flag from here, this is just "watch what they
  // tagged," same data the athlete already saw when they recorded it.
  const [videoPreview, setVideoPreview] = useState<{
    url: string;
    flag: "best" | "worst" | null;
    label: string;
  } | null>(null);
  const [videoPreviewError, setVideoPreviewError] = useState(false);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);

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

  // The full exercise bank (not scoped to this athlete's history) -- lets a
  // pinned major-lift tab resolve to a real exercise id even for an athlete
  // who's never logged it, so tapping it still drives the same "no sets
  // logged yet" empty state below instead of doing nothing.
  const { data: allExercises = [] } = useQuery<TrackedExercise[]>({
    queryKey: ["/api/coach/exercises"],
    queryFn: () => getJson("/api/coach/exercises"),
  });

  const { data: overview = [], isLoading: overviewLoading } = useQuery<RecentSession[]>({
    queryKey: ["/api/coach/analytics/overview", athleteId],
    queryFn: () => getJson(`/api/coach/analytics/overview?athleteId=${athleteId}&limit=100`),
    enabled: !!athleteId && !exerciseId,
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

  const { data: fvData } = useQuery<{
    points: { date: string; loadKg: number; meanVelocityMps: number }[];
    profile: { slope: number; intercept: number; v0: number; rSquared: number } | null;
  }>({
    queryKey: ["/api/coach/force-velocity", athleteId, exerciseId],
    queryFn: () => getJson(`/api/coach/force-velocity?athleteId=${athleteId}&exerciseId=${exerciseId}`),
    enabled: !!athleteId && !!exerciseId,
  });

  const chartData = points.map((p) => ({
    ...p,
    label: `${format(parseISO(p.date), "MMM d")} · Set ${p.setNumber}`,
    jumpHeightCm:
      p.jumpHeightCm != null ? Math.round(cmToDisplayUnit(p.jumpHeightCm, distanceUnit) * 10) / 10 : p.jumpHeightCm,
    jumpDistanceCm:
      p.jumpDistanceCm != null
        ? Math.round(cmToDisplayUnit(p.jumpDistanceCm, distanceUnit) * 10) / 10
        : p.jumpDistanceCm,
  }));

  const hasNumericWeight = chartData.some((p) => p.weightMode === "numeric" && p.weight != null);
  const hasVelocity = chartData.some((p) => p.peakVelocityMps != null);
  const hasPath = chartData.some((p) => p.barPathDeviationCm != null);
  const hasPower = chartData.some((p) => p.peakPowerWatts != null || p.meanPowerWatts != null);
  const hasRom = chartData.some((p) => p.romCm != null);
  const hasVelocityLoss = chartData.some((p) => p.velocityLossPercent != null);
  const hasJumpHeight = chartData.some((p) => p.jumpHeightCm != null || p.jumpDistanceCm != null);
  const hasGroundContact = chartData.some(
    (p) => p.groundContactSeconds != null || p.reactiveStrengthIndex != null,
  );
  // The actual x/y shape of the bar's path, not just the scalar deviation
  // number above -- capped to the 5 most recent tracked sets so overlaying
  // them stays readable instead of an unreadable tangle.
  const pathTraceSets = chartData
    .filter((p) => p.barPathTrace && p.barPathTrace.length > 1)
    .slice(-5);
  // Independent left/right wrist paths for the most recent tracked set --
  // just one set (not overlaid like the bar-path-shape chart above) since
  // it's already two lines per set and more would be unreadable.
  const armPathSets = chartData.filter(
    (p) => p.armPathTrace && p.armPathTrace.left.length > 1 && p.armPathTrace.right.length > 1,
  );
  const latestArmPathSet = armPathSets[armPathSets.length - 1];
  // Rep-by-rep left/right knee-drive rate for the most recent set with a
  // detected bilateral lower-body lift -- same "latest set only" treatment
  // as arm symmetry above, since averaging across sets would wash out which
  // specific reps skewed one-sided.
  const legDriveSets = chartData.filter(
    (p) => p.legDriveAsymmetry && p.legDriveAsymmetry.length > 0,
  );
  const latestLegDriveSet = legDriveSets[legDriveSets.length - 1];
  // Velocity decay across reps within the most recent multi-rep tracked set.
  const repDecaySets = chartData.filter(
    (p) => p.repBreakdown && p.repBreakdown.length > 1 && p.repBreakdown.some((r) => r.peakVelocityMps > 0),
  );
  const latestRepDecaySet = repDecaySets[repDecaySets.length - 1];
  // Form-fault frequency by week, from the same tracked-set history already
  // fetched above -- no separate query needed. Turns one-off in-session
  // flags into a trend a coach can actually program around.
  const trackedPoints = chartData.filter(
    (p) => p.peakVelocityMps != null || p.barPathDeviationCm != null || p.jumpHeightCm != null,
  );
  const faultCodesSeen = Array.from(
    new Set(trackedPoints.flatMap((p) => (p.formFaults ?? []).map((f) => f.code))),
  );
  const faultWeekBuckets = new Map<string, { total: number; counts: Record<string, number> }>();
  for (const p of trackedPoints) {
    const weekKey = format(startOfWeek(parseISO(p.date), { weekStartsOn: 0 }), "yyyy-MM-dd");
    const bucket = faultWeekBuckets.get(weekKey) ?? { total: 0, counts: {} };
    bucket.total += 1;
    for (const f of p.formFaults ?? []) {
      bucket.counts[f.code] = (bucket.counts[f.code] ?? 0) + 1;
    }
    faultWeekBuckets.set(weekKey, bucket);
  }
  const faultTrendData = Array.from(faultWeekBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, bucket]) => {
      const row: Record<string, string | number> = { label: format(parseISO(weekKey), "MMM d") };
      for (const code of faultCodesSeen) {
        row[code] = Math.round(((bucket.counts[code] ?? 0) / bucket.total) * 100);
      }
      return row;
    });
  const asymmetryTrendData = weeklyAsymmetryTrend(
    chartData.map((p) => ({ date: p.date, reps: p.legDriveAsymmetry })),
    chartData.map((p) => ({ date: p.date, reps: p.armDriveAsymmetry })),
  );
  const hasAsymmetryTrend = asymmetryTrendData.some(
    (r) => r.legAsymmetryPercent != null || r.armAsymmetryPercent != null,
  );
  const prCount = chartData.filter((p) => p.isPR).length;
  const unit = chartData.find((p) => p.weightUnit)?.weightUnit ?? "lbs";
  const selectedExerciseName =
    exercises.find((e) => String(e.id) === exerciseId)?.name ??
    allExercises.find((e) => String(e.id) === exerciseId)?.name;
  function handleAthleteChange(value: string) {
    setAthleteId(value);
    setExerciseId("");
  }

  return (
    <AppShell title="Analytics">
      <Tabs defaultValue="performance">
        <TabsList className="mb-6">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="videos">Videos</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="trends">Team Trends</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
        </TabsList>

        <TabsContent value="performance">
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <AthletePickerField
          roster={roster}
          athleteId={athleteId}
          onChange={handleAthleteChange}
          search={athleteSearch}
          onSearchChange={setAthleteSearch}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase text-muted-foreground">
            Exercise (optional)
          </label>
          {athleteId ? (
            <PinnedExercisePicker
              options={exercises.map((e) => e.name)}
              value={selectedExerciseName ?? ""}
              onChange={(name) => {
                if (!name) {
                  setExerciseId("");
                  return;
                }
                const trackedMatch = exercises.find((e) => e.name === name);
                const bankMatch = allExercises.find((e) => e.name === name);
                setExerciseId(trackedMatch ? String(trackedMatch.id) : bankMatch ? String(bankMatch.id) : "");
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Pick an athlete first</p>
          )}
        </div>
      </div>

      {!athleteId && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Pick an athlete to see their training history and PRs.
            </p>
          </CardContent>
        </Card>
      )}

      {athleteId && !exerciseId && (
        <div className="space-y-4">
          <AcwrTrendCard athleteId={athleteId} />
          <WeeklyLoadTrendCard athleteId={athleteId} />
          <MuscleHeatMap athleteId={athleteId} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Goals
              </CardTitle>
              <CardDescription>
                Set a target lift or testing metric for this athlete and track their progress
                toward it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GoalsPanel
                goalsUrl={`/api/coach/roster/${athleteId}/goals`}
                exercisesUrl={`/api/coach/analytics/exercises?athleteId=${athleteId}`}
                skillExercisesUrl={`/api/coach/analytics/skill-exercises?athleteId=${athleteId}`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription>
                Every exercise this athlete has logged. Pick one above for full history, PRs, and
                (if tracked) bar speed and path.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!overviewLoading && overview.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <CalendarDays className="h-10 w-10 text-muted-foreground" />
                  <p className="text-muted-foreground">No workouts logged yet.</p>
                </div>
              )}
              <div className="space-y-2">
                {overview.map((s) => (
                  <div
                    key={s.date}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {format(parseISO(s.date), "EEE, MMM d")} — {s.dayTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.exercises.join(", ") || "No exercises logged"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      <span>{s.totalReps} reps</span>
                      {s.totalVolume > 0 && <span>{s.totalVolume.toLocaleString()} vol.</span>}
                      <Badge variant={s.completed ? "success" : "outline"}>
                        {s.completed ? "Completed" : "In progress"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {athleteId && exerciseId && !isLoading && chartData.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Gauge className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              No sets logged for {selectedExerciseName ?? "this exercise"} yet.
            </p>
          </CardContent>
        </Card>
      )}

      {athleteId && exerciseId && chartData.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl font-bold uppercase">{selectedExerciseName}</h2>
              {prCount > 0 && (
                <Badge className="gap-1 bg-amber-400 text-black hover:bg-amber-400">
                  <Crown className="h-3.5 w-3.5" />
                  {prCount} PR{prCount === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-border p-0.5">
                {(
                  [
                    ["byDate", "By Date"],
                    ["trends", "All Trends"],
                    ["chart", "Line Graph"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    aria-pressed={viewMode === mode}
                    className={cn(
                      "rounded px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      viewMode === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {viewMode === "chart" && (
                <>
                  <div className="flex rounded-md border border-border p-0.5">
                    {(
                      [
                        ["line", "Line"],
                        ["bar", "Bar"],
                      ] as const
                    ).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleChartTypeChange(type)}
                        aria-pressed={chartType === type}
                        className={cn(
                          "rounded px-2.5 py-1.5 text-xs font-semibold transition-colors",
                          chartType === type
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <ChartVisibilityMenu hidden={hiddenCharts} onChange={setHiddenCharts} />
                </>
              )}
            </div>
          </div>

          {viewMode === "byDate" && (
            <RepBreakdownByDate
              chartData={chartData}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              distanceUnit={distanceUnit}
              onWatchVideo={(preview) => {
                setVideoPreviewError(false);
                setVideoPreview(preview);
              }}
            />
          )}

          {viewMode === "chart" && (
          <>
          {hasNumericWeight && !hiddenCharts.has("weight") && (
            <Card>
              <CardHeader>
                <CardTitle>Weight &amp; Estimated 1RM</CardTitle>
                <CardDescription>
                  Weight lifted per set ({unit}), with an Epley-estimated 1RM. Crowned points are
                  PRs for that exact rep count.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData.filter((p) => p.weightMode === "numeric")}
                    margin={{ left: 4, right: 12 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => `${v}`} />
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
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {chartType === "line" ? (
                      <>
                        <Line
                          type="monotone"
                          dataKey="weight"
                          name="Weight"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          connectNulls
                          dot={(props: any) =>
                            props.payload.isPR ? (
                              <svg
                                key={props.key}
                                x={props.cx - 7}
                                y={props.cy - 7}
                                width={14}
                                height={14}
                                viewBox="0 0 24 24"
                                fill="#fbbf24"
                                stroke="#000"
                              >
                                <path d="M2 20h20v2H2zM3 8l4 4 5-8 5 8 4-4v10H3z" />
                              </svg>
                            ) : (
                              <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="hsl(var(--primary))" />
                            )
                          }
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
                      </>
                    ) : (
                      <>
                        <Bar dataKey="weight" name="Weight" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="estimatedOneRm" name="Est. 1RM" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasVelocity && !hiddenCharts.has("velocity") && (
            <Card>
              <CardHeader>
                <CardTitle>Bar Speed</CardTitle>
                <CardDescription>
                  Peak and mean concentric velocity, plus mean eccentric (lowering) velocity, per
                  tracked set.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="peakVelocityMps"
                      name="Peak velocity"
                      color="hsl(var(--primary))"
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="meanVelocityMps"
                      name="Mean velocity"
                      color="#3b82f6"
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="eccentricMeanVelocityMps"
                      name="Eccentric velocity"
                      color="#a855f7"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {!!fvData && fvData.points.length > 0 && !hiddenCharts.has("forceVelocity") && (
            <Card>
              <CardHeader>
                <CardTitle>Force-Velocity Profile</CardTitle>
                <CardDescription>
                  Load vs. mean concentric velocity across every tracked set -- the standard
                  barbell proxy for a force-velocity relationship, fit from at least 3 tracked
                  sets at different loads.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {fvData.profile ? (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">Est. 1RM (velocity-based)</p>
                      <p className="font-semibold">
                        {Math.round(
                          unit === "kg"
                            ? fvData.profile.intercept
                            : fvData.profile.intercept * 2.20462,
                        )}{" "}
                        {unit}
                      </p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">V0 (max velocity)</p>
                      <p className="font-semibold">{fvData.profile.v0.toFixed(2)} m/s</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">Fit quality (R²)</p>
                      <p className="font-semibold">{Math.round(fvData.profile.rSquared * 100)}%</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Not enough tracked sets at different loads yet to fit a profile -- keep logging
                    velocity-tracked sets across a range of weights.
                  </p>
                )}
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart margin={{ left: 4, right: 12, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        type="number"
                        dataKey="meanVelocityMps"
                        name="Velocity"
                        unit=" m/s"
                        tick={{ fontSize: 11 }}
                        domain={[0, "dataMax"]}
                      />
                      <YAxis
                        type="number"
                        dataKey="loadKg"
                        name="Load"
                        unit=" kg"
                        tick={{ fontSize: 11 }}
                        width={48}
                        domain={[0, "dataMax"]}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                        }}
                      />
                      <Scatter
                        name="Tracked sets"
                        data={fvData.points}
                        dataKey="loadKg"
                        fill="hsl(var(--primary))"
                      />
                      {fvData.profile && (
                        <Line
                          name="Fitted profile"
                          type="linear"
                          data={[
                            { meanVelocityMps: 0, loadKg: fvData.profile.intercept },
                            { meanVelocityMps: fvData.profile.v0, loadKg: 0 },
                          ]}
                          dataKey="loadKg"
                          stroke="hsl(var(--muted-foreground))"
                          strokeWidth={2}
                          strokeDasharray="4 3"
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {hasPower && !hiddenCharts.has("power") && (
            <Card>
              <CardHeader>
                <CardTitle>Power Output</CardTitle>
                <CardDescription>
                  Estimated power (load × gravity × concentric velocity) per tracked set --
                  requires a numeric weight to have been entered for the tracker to estimate
                  from.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} unit="W" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="peakPowerWatts"
                      name="Peak power"
                      color="hsl(var(--primary))"
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="meanPowerWatts"
                      name="Mean power"
                      color="#3b82f6"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasVelocityLoss && !hiddenCharts.has("velocityLoss") && (
            <Card>
              <CardHeader>
                <CardTitle>Velocity Loss (Fatigue)</CardTitle>
                <CardDescription>
                  How much peak concentric velocity dropped from the first rep to the last, per
                  tracked set -- the standard within-set fatigue signal in velocity-based
                  training. Negative means the last rep was actually faster.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} unit="%" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="velocityLossPercent"
                      name="Velocity loss"
                      color="#ef4444"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasPath && !hiddenCharts.has("path") && (
            <Card>
              <CardHeader>
                <CardTitle>Bar Path Deviation</CardTitle>
                <CardDescription>
                  How far the bar drifted from a straight vertical line, per tracked set.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="barPathDeviationCm"
                      name="Deviation"
                      color="#f59e0b"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasJumpHeight && !hiddenCharts.has("jump") && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle>Jump Height &amp; Distance</CardTitle>
                  <CardDescription>
                    Flight-time-derived jump height, and horizontal distance for broad jumps, per
                    tracked set.
                  </CardDescription>
                </div>
                <DistanceUnitToggle />
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} unit={distanceUnit} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="jumpHeightCm"
                      name="Jump height"
                      color="hsl(var(--primary))"
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="jumpDistanceCm"
                      name="Broad jump distance"
                      color="#3b82f6"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasGroundContact && !hiddenCharts.has("groundContact") && (
            <Card>
              <CardHeader>
                <CardTitle>Ground Contact &amp; Reactive Strength</CardTitle>
                <CardDescription>
                  Time on the ground between jumps, and Reactive Strength Index (jump height ÷
                  ground contact time) -- the standard power/reactivity metric for repeated
                  jumps.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} unit="s" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={40} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <TrendSeries
                      chartType={chartType}
                      yAxisId="left"
                      dataKey="groundContactSeconds"
                      name="Ground contact"
                      color="#f59e0b"
                    />
                    <TrendSeries
                      chartType={chartType}
                      yAxisId="right"
                      dataKey="reactiveStrengthIndex"
                      name="RSI"
                      color="#a855f7"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {pathTraceSets.length > 0 && !hiddenCharts.has("pathShape") && (
            <Card>
              <CardHeader>
                <CardTitle>Bar Path Shape</CardTitle>
                <CardDescription>
                  The actual path traced during each set (not just the deviation number) --
                  horizontal drift vs. vertical position, both in cm from where tracking started.
                  Overlaying recent sets shows whether the path is repeatable rep to rep.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Horizontal drift"
                      unit="cm"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Vertical position"
                      unit="cm"
                      tick={{ fontSize: 11 }}
                      width={48}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {pathTraceSets.map((p, i) => (
                      <Scatter
                        key={`${p.date}-${p.setNumber}`}
                        name={`${format(parseISO(p.date), "MMM d")} · Set ${p.setNumber}`}
                        data={p.barPathTrace!}
                        fill={TREND_COLORS[i % TREND_COLORS.length]}
                        line={{ stroke: TREND_COLORS[i % TREND_COLORS.length] }}
                        lineType="joint"
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {latestArmPathSet && !hiddenCharts.has("armSymmetry") && (
            <Card>
              <CardHeader>
                <CardTitle>Arm Symmetry</CardTitle>
                <CardDescription>
                  Left vs. right wrist path for the most recent tracked set (
                  {format(parseISO(latestArmPathSet.date), "MMM d")} · Set {latestArmPathSet.setNumber}) --
                  the averaged bar path above can hide one side lagging or drifting differently; this
                  can't.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" dataKey="x" name="Horizontal drift" unit="cm" tick={{ fontSize: 11 }} />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Vertical position"
                      unit="cm"
                      tick={{ fontSize: 11 }}
                      width={48}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Scatter
                      name="Left wrist"
                      data={latestArmPathSet.armPathTrace!.left}
                      fill={TREND_COLORS[0]}
                      line={{ stroke: TREND_COLORS[0] }}
                      lineType="joint"
                    />
                    <Scatter
                      name="Right wrist"
                      data={latestArmPathSet.armPathTrace!.right}
                      fill={TREND_COLORS[1]}
                      line={{ stroke: TREND_COLORS[1] }}
                      lineType="joint"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {latestLegDriveSet && !hiddenCharts.has("legAsymmetry") && (
            <Card>
              <CardHeader>
                <CardTitle>Leg Drive Asymmetry</CardTitle>
                <CardDescription>
                  Left vs. right knee extension rate during the drive phase, rep by rep, for the
                  most recent bilateral lift with a detected asymmetry (
                  {format(parseISO(latestLegDriveSet.date), "MMM d")} · Set{" "}
                  {latestLegDriveSet.setNumber}) -- a consistent lean to one side across reps is
                  the load-management signal, not any single rep.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={latestLegDriveSet.legDriveAsymmetry!} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="repNumber" tick={{ fontSize: 11 }} tickFormatter={(v) => `Rep ${v}`} />
                    <YAxis tick={{ fontSize: 11 }} width={48} unit="°/s" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="leftDriveDegPerSec"
                      name="Left leg"
                      color={TREND_COLORS[0]}
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="rightDriveDegPerSec"
                      name="Right leg"
                      color={TREND_COLORS[1]}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {latestRepDecaySet && !hiddenCharts.has("repDecay") && (
            <Card>
              <CardHeader>
                <CardTitle>Rep-by-Rep Velocity Decay</CardTitle>
                <CardDescription>
                  Peak concentric velocity, rep by rep, for the most recent multi-rep tracked set (
                  {format(parseISO(latestRepDecaySet.date), "MMM d")} · Set {latestRepDecaySet.setNumber}) --
                  the drop-off across a set is the actual autoregulation signal, not just the set's
                  best rep. Time to peak velocity is how long into each rep that peak was reached --
                  a rep still accelerating right up to lockout reads very differently from one that
                  peaked early and decelerated the rest of the way, even at the same total duration.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={latestRepDecaySet.repBreakdown!} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="repNumber" tick={{ fontSize: 11 }} tickFormatter={(v) => `Rep ${v}`} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={48} unit=" m/s" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={40} unit="s" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <TrendSeries
                      chartType={chartType}
                      yAxisId="left"
                      dataKey="peakVelocityMps"
                      name="Peak velocity"
                      color="hsl(var(--primary))"
                    />
                    <TrendSeries
                      chartType={chartType}
                      yAxisId="right"
                      dataKey="timeToPeakVelocitySeconds"
                      name="Time to peak velocity"
                      color="#f59e0b"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasVelocity && !hiddenCharts.has("tempo") && (
            <Card>
              <CardHeader>
                <CardTitle>Tempo</CardTitle>
                <CardDescription>Average concentric vs. eccentric duration per set.</CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="concentricSeconds"
                      name="Concentric"
                      color="hsl(var(--success))"
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="eccentricSeconds"
                      name="Eccentric"
                      color="#a855f7"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasRom && !hiddenCharts.has("rom") && (
            <Card>
              <CardHeader>
                <CardTitle>Range of Motion</CardTitle>
                <CardDescription>
                  Average per-rep vertical travel during the concentric (lifting) phase, per
                  tracked set -- a shrinking number over time can mean the depth is creeping up
                  even while the weight goes up too.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} unit="cm" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="romCm"
                      name="Avg. ROM"
                      color="hsl(var(--success))"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {faultCodesSeen.length > 0 && !hiddenCharts.has("faultTrend") && (
            <Card>
              <CardHeader>
                <CardTitle>Form Fault Trend</CardTitle>
                <CardDescription>
                  Share of tracked sets flagging each fault, by week -- turns a one-off in-session
                  flag into something to actually program around: is it improving, or is it stuck?
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={faultTrendData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} unit="%" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {faultCodesSeen.map((code, i) => (
                      <TrendSeries
                        key={code}
                        chartType={chartType}
                        dataKey={code}
                        name={FAULT_NAMES[code] ?? code}
                        color={TREND_COLORS[i % TREND_COLORS.length]}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {hasAsymmetryTrend && !hiddenCharts.has("asymmetryTrend") && (
            <Card>
              <CardHeader>
                <CardTitle>Asymmetry Trend</CardTitle>
                <CardDescription>
                  Average left/right drive imbalance by week, for sets where one side clearly
                  dominated the reps -- a single lopsided set is a data point, favoring the same
                  side for weeks in a row is a load-management flag worth programming around.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={asymmetryTrendData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} unit="%" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      formatter={(value, name, item) => {
                        const side =
                          item.dataKey === "legAsymmetryPercent"
                            ? item.payload.legDominantSide
                            : item.payload.armDominantSide;
                        return [`${value}% favoring ${side ?? "?"}`, name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="legAsymmetryPercent"
                      name="Leg drive"
                      color={TREND_COLORS[0]}
                    />
                    <TrendSeries
                      chartType={chartType}
                      dataKey="armAsymmetryPercent"
                      name="Arm drive"
                      color={TREND_COLORS[1]}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          </>
          )}

          {viewMode === "trends" && (
          <Card>
            <CardHeader>
              <CardTitle>Every Data Point</CardTitle>
              <CardDescription>The complete raw history across every logged date.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                    <th className="py-1.5 pr-3">Date</th>
                    <th className="py-1.5 pr-3">Set</th>
                    <th className="py-1.5 pr-3">Reps</th>
                    <th className="py-1.5 pr-3">Weight</th>
                    <th className="py-1.5 pr-3">Est. 1RM</th>
                    <th className="py-1.5 pr-3">RPE</th>
                    <th className="py-1.5 pr-3">Peak m/s</th>
                    <th className="py-1.5 pr-3">Power (W)</th>
                    <th className="py-1.5 pr-3">Path (cm)</th>
                    <th className="py-1.5 pr-3">Jump ({distanceUnit})</th>
                    <th className="py-1.5 pr-3">Form notes</th>
                    <th className="py-1.5 pr-3">Video</th>
                    <th className="py-1.5">PR</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((p, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-border/50",
                        p.isPR && "bg-amber-400/10",
                      )}
                    >
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {format(parseISO(p.date), "MMM d")}
                      </td>
                      <td className="py-1.5 pr-3">{p.setNumber}</td>
                      <td className="py-1.5 pr-3">{p.reps ?? "-"}</td>
                      <td className="py-1.5 pr-3">{formatSetWeight(p)}</td>
                      <td className="py-1.5 pr-3">{p.estimatedOneRm ?? "-"}</td>
                      <td className="py-1.5 pr-3">{p.rpe ?? "-"}</td>
                      <td className="py-1.5 pr-3">{p.peakVelocityMps ?? "-"}</td>
                      <td className="py-1.5 pr-3">{p.peakPowerWatts ?? "-"}</td>
                      <td className="py-1.5 pr-3">{p.barPathDeviationCm ?? "-"}</td>
                      <td className="py-1.5 pr-3">{p.jumpHeightCm ?? "-"}</td>
                      <td className="py-1.5 pr-3">
                        {p.formFaults && p.formFaults.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {p.formFaults.map((f) => (
                              <Badge key={f.code} variant="secondary" className="text-[9px] font-normal">
                                {f.label}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-1.5 pr-3">
                        {p.formCheckVideoUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              setVideoPreviewError(false);
                              setVideoPreview({
                                url: p.formCheckVideoUrl!,
                                flag: p.formCheckFlag,
                                label: `${format(parseISO(p.date), "MMM d")} · Set ${p.setNumber}`,
                              });
                            }}
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Video className="h-3.5 w-3.5" />
                            Watch
                            {p.formCheckFlag === "best" && <ThumbsUp className="h-3 w-3 text-success" />}
                            {p.formCheckFlag === "worst" && <ThumbsDown className="h-3 w-3 text-destructive" />}
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-1.5">
                        {p.isPR && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          )}

          <Dialog open={!!videoPreview} onOpenChange={(o) => !o && setVideoPreview(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {videoPreview?.label}
                  {videoPreview?.flag === "best" && (
                    <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15">
                      <ThumbsUp className="h-3 w-3" />
                      Best
                    </Badge>
                  )}
                  {videoPreview?.flag === "worst" && (
                    <Badge className="gap-1 bg-destructive/15 text-destructive hover:bg-destructive/15">
                      <ThumbsDown className="h-3 w-3" />
                      Worst
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
              {videoPreview && videoPreviewError && (
                <div className="rounded-md border border-border bg-secondary/30 p-4 text-center text-sm text-muted-foreground">
                  This video couldn't be loaded -- it may not have finished uploading, or the file is missing.
                </div>
              )}
              {videoPreview && !videoPreviewError && (
                <>
                  <video
                    src={videoPreview.url}
                    controls
                    playsInline
                    className="w-full rounded-md bg-black"
                    onError={() => setVideoPreviewError(true)}
                  />
                  <Button variant="outline" onClick={() => setAnalyzingVideo(true)}>
                    <Wand2 className="h-4 w-4" />
                    Analysis Tools
                  </Button>
                </>
              )}
            </DialogContent>
          </Dialog>
          {videoPreview && (
            <VideoAnalysisDialog
              open={analyzingVideo}
              onOpenChange={setAnalyzingVideo}
              videoUrl={videoPreview.url}
              title={videoPreview.label}
            />
          )}
        </div>
      )}
        </TabsContent>

        <TabsContent value="videos">
          <VideosTab
            roster={roster}
            athleteId={athleteId}
            onAthleteChange={handleAthleteChange}
            athleteSearch={athleteSearch}
            onAthleteSearchChange={setAthleteSearch}
          />
        </TabsContent>

        <TabsContent value="skills">
          <SkillsTab
            roster={roster}
            athleteId={athleteId}
            onAthleteChange={handleAthleteChange}
            athleteSearch={athleteSearch}
            onAthleteSearchChange={setAthleteSearch}
          />
        </TabsContent>

        <TabsContent value="trends">
          <TeamTrends />
        </TabsContent>

        <TabsContent value="classes">
          <CoachClassAnalyticsTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

/** Wrapper around SkillsTrendsPanel that handles athlete selection and the
 * empty states -- same split VideosTab uses (this file owns picking who,
 * the imported panel owns what to show once someone's picked), so
 * SkillsTrendsPanel itself stays reusable without knowing about the
 * roster/search plumbing this page already lifts. */
function SkillsTab({
  roster,
  athleteId,
  onAthleteChange,
  athleteSearch,
  onAthleteSearchChange,
}: {
  roster: RosterEntry[];
  athleteId: string;
  onAthleteChange: (id: string) => void;
  athleteSearch: string;
  onAthleteSearchChange: (value: string) => void;
}) {
  const athleteName = roster.find((a) => String(a.id) === athleteId)?.name;
  return (
    <div className="space-y-4">
      <AthletePickerField
        roster={roster}
        athleteId={athleteId}
        onChange={onAthleteChange}
        search={athleteSearch}
        onSearchChange={onAthleteSearchChange}
      />

      {!athleteId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Pick an athlete to see their Skills tracking history.</p>
          </CardContent>
        </Card>
      ) : (
        <SkillsTrendsPanel athleteId={athleteId} athleteName={athleteName} />
      )}
    </div>
  );
}

/** Athlete search + select, shared by the Performance and Videos tabs so
 * picking an athlete on one carries over to the other (both tabs read the
 * same lifted athleteId state in CoachAnalytics). */
function AthletePickerField({
  roster,
  athleteId,
  onChange,
  search,
  onSearchChange,
}: {
  roster: RosterEntry[];
  athleteId: string;
  onChange: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const filtered = search.trim()
    ? roster.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase()))
    : roster;
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase text-muted-foreground">Athlete</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search athletes…"
          className="mb-1.5 h-8 pl-8 text-sm"
        />
      </div>
      <Select value={athleteId} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an athlete" />
        </SelectTrigger>
        <SelectContent>
          {filtered.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No athletes match</p>
          )}
          {filtered.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type FormCheckVideoRow = {
  id: number;
  date: string;
  setNumber: number;
  videoUrl: string;
  flag: "best" | "worst" | null;
  exerciseName: string;
};

type SkillSessionVideoRow = {
  id: number;
  trackingLevel: string;
  videoUrl: string;
  coachAnnotationUrl: string | null;
  createdAt: string;
  skillExerciseName: string;
};

type VideoItem = {
  key: string;
  kind: "lift" | "skill";
  exerciseName: string;
  date: string;
  label: string;
  videoUrl: string;
  flag: "best" | "worst" | null;
};

/** Every recorded video for one athlete in one place -- form-check clips
 * from strength sets and Skills clips both, which otherwise only ever
 * surfaced buried inside a specific exercise's raw data table (strength) or
 * a wholly separate roster dialog (Skills). Filtering follows the same
 * "player, then lift" flow as the Performance tab, sharing its athlete
 * selection and its pinned-lift picker. */
function VideosTab({
  roster,
  athleteId,
  onAthleteChange,
  athleteSearch,
  onAthleteSearchChange,
}: {
  roster: RosterEntry[];
  athleteId: string;
  onAthleteChange: (id: string) => void;
  athleteSearch: string;
  onAthleteSearchChange: (value: string) => void;
}) {
  const [liftFilter, setLiftFilter] = useState("");
  const [watching, setWatching] = useState<{ url: string; title: string } | null>(null);

  const { data: liftVideos = [], isLoading: liftLoading } = useQuery<FormCheckVideoRow[]>({
    queryKey: ["/api/coach/roster", athleteId, "form-check-videos"],
    queryFn: () => getJson(`/api/coach/roster/${athleteId}/form-check-videos`),
    enabled: !!athleteId,
  });

  const { data: skillVideos = [], isLoading: skillLoading } = useQuery<SkillSessionVideoRow[]>({
    queryKey: ["/api/coach/roster", athleteId, "skill-sessions"],
    queryFn: () => getJson(`/api/coach/roster/${athleteId}/skill-sessions`),
    enabled: !!athleteId,
  });

  const allVideos: VideoItem[] = [
    ...liftVideos.map((v) => ({
      key: `lift-${v.id}`,
      kind: "lift" as const,
      exerciseName: v.exerciseName,
      date: v.date,
      label: `${format(parseISO(v.date), "MMM d, yyyy")} · Set ${v.setNumber}`,
      videoUrl: v.videoUrl,
      flag: v.flag,
    })),
    ...skillVideos.map((v) => ({
      key: `skill-${v.id}`,
      kind: "skill" as const,
      exerciseName: v.skillExerciseName,
      date: v.createdAt,
      label: format(parseISO(v.createdAt), "MMM d, yyyy"),
      videoUrl: v.videoUrl,
      flag: null,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const availableLiftNames = Array.from(new Set(allVideos.map((v) => v.exerciseName))).sort();
  const filteredVideos = liftFilter ? allVideos.filter((v) => v.exerciseName === liftFilter) : allVideos;
  const athleteName = roster.find((a) => String(a.id) === athleteId)?.name;
  const loading = liftLoading || skillLoading;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AthletePickerField
          roster={roster}
          athleteId={athleteId}
          onChange={(id) => {
            onAthleteChange(id);
            setLiftFilter("");
          }}
          search={athleteSearch}
          onSearchChange={onAthleteSearchChange}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase text-muted-foreground">
            Lift (optional)
          </label>
          {athleteId ? (
            <PinnedExercisePicker options={availableLiftNames} value={liftFilter} onChange={setLiftFilter} />
          ) : (
            <p className="text-sm text-muted-foreground">Pick an athlete first</p>
          )}
        </div>
      </div>

      {!athleteId && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Pick an athlete to see every video they've recorded.</p>
          </CardContent>
        </Card>
      )}

      {athleteId && !loading && allVideos.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Video className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No videos recorded yet for {athleteName ?? "this athlete"}.</p>
          </CardContent>
        </Card>
      )}

      {athleteId && !loading && allVideos.length > 0 && filteredVideos.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Video className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No {liftFilter} videos yet for {athleteName ?? "this athlete"}.</p>
          </CardContent>
        </Card>
      )}

      {athleteId && filteredVideos.length > 0 && (
        <div className="divide-y divide-border rounded-md border border-border">
          {filteredVideos.map((v) => (
            <div key={v.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                    v.kind === "skill" ? "bg-teal-500/15 text-teal-400" : "bg-primary/15 text-primary",
                  )}
                >
                  {v.kind === "skill" ? <Activity className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{v.exerciseName}</p>
                  <p className="text-xs text-muted-foreground">{v.label}</p>
                </div>
                {v.flag === "best" && (
                  <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15">
                    <ThumbsUp className="h-3 w-3" />
                    Best
                  </Badge>
                )}
                {v.flag === "worst" && (
                  <Badge className="gap-1 bg-destructive/15 text-destructive hover:bg-destructive/15">
                    <ThumbsDown className="h-3 w-3" />
                    Worst
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setWatching({ url: v.videoUrl, title: `${v.exerciseName} — ${v.label}` })}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Watch
              </Button>
            </div>
          ))}
        </div>
      )}

      {watching && (
        <VideoAnalysisDialog
          open={!!watching}
          onOpenChange={(o) => !o && setWatching(null)}
          videoUrl={watching.url}
          title={watching.title}
        />
      )}
    </div>
  );
}

type AcwrPoint = {
  date: string;
  acuteLoad: number;
  chronicLoad: number;
  ratio: number | null;
  level: AcwrRiskLevel;
};

/** Acute:chronic training-load ratio for the selected athlete -- a general
 * injury-risk-management signal (see shared/load.ts), not exercise-specific,
 * so it lives at the whole-athlete overview level rather than inside a
 * single exercise's chart. Absent/flat when there isn't enough logged
 * training yet for a real ratio, same convention as the rest of this page. */
const ACWR_WINDOW_OPTIONS = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
  { label: "180d", days: 180 },
];

function AcwrTrendCard({ athleteId }: { athleteId: string }) {
  const [windowDays, setWindowDays] = useState(60);
  const { data: history = [], isLoading } = useQuery<AcwrPoint[]>({
    queryKey: ["/api/coach/roster", athleteId, "acwr-history", windowDays],
    queryFn: () => getJson(`/api/coach/roster/${athleteId}/acwr-history?days=${windowDays}`),
    enabled: !!athleteId,
  });

  const chartData = history.map((p) => ({
    label: format(parseISO(p.date), "MMM d"),
    acute: Math.round(p.acuteLoad),
    chronic: Math.round(p.chronicLoad),
  }));
  const latest = history[history.length - 1];
  const hasEnoughData = history.some((p) => p.acuteLoad > 0 || p.chronicLoad > 0);

  if (isLoading && history.length === 0) {
    return <div className="h-24 animate-pulse rounded-md bg-surface" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Training Load (ACWR)
            </CardTitle>
            <CardDescription>
              Acute (7-day) vs. chronic (28-day average) load, from logged volume. A general
              load-management guideline, not a medical diagnosis.
            </CardDescription>
          </div>
          <RadioChipGroup
            label=""
            className="[&>p]:hidden"
            options={ACWR_WINDOW_OPTIONS.map((o) => o.label)}
            value={ACWR_WINDOW_OPTIONS.find((o) => o.days === windowDays)?.label ?? "60d"}
            onChange={(label) => {
              const match = ACWR_WINDOW_OPTIONS.find((o) => o.label === label);
              if (match) setWindowDays(match.days);
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasEnoughData ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No training load logged in the last {windowDays} days -- try a wider window.
          </p>
        ) : (
          <>
            {latest?.ratio != null && (
              <div className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <span className="text-muted-foreground">Current ratio</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{latest.ratio.toFixed(2)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      ACWR_RISK_CLASSNAME[latest.level],
                    )}
                  >
                    {ACWR_RISK_LABEL[latest.level]}
                  </span>
                </div>
              </div>
            )}
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="acute"
                    name="Acute (7d)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="chronic"
                    name="Chronic (28d avg)"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type WeeklyLoadPoint = { weekStart: string; totalVolume: number; totalSets: number; avgIntensity: number };

/** Week-by-week volume (total load lifted) and intensity (average load per
 * rep) for the selected athlete -- whole-athlete like the ACWR chart above,
 * not exercise-specific, since it's meant to answer "is this athlete's
 * overall training getting heavier/lighter over time," not one lift's
 * progression (that's what the per-exercise chart further down is for). */
const WEEKLY_LOAD_WINDOW_OPTIONS = [
  { label: "8wk", weeks: 8 },
  { label: "12wk", weeks: 12 },
  { label: "26wk", weeks: 26 },
  { label: "52wk", weeks: 52 },
];

function WeeklyLoadTrendCard({ athleteId }: { athleteId: string }) {
  const [windowWeeks, setWindowWeeks] = useState(12);
  const { data: series = [], isLoading } = useQuery<WeeklyLoadPoint[]>({
    queryKey: ["/api/coach/roster", athleteId, "weekly-load", windowWeeks],
    queryFn: () => getJson(`/api/coach/roster/${athleteId}/weekly-load?weeks=${windowWeeks}`),
    enabled: !!athleteId,
  });

  const chartData = series.map((p) => ({
    label: format(parseISO(p.weekStart), "MMM d"),
    volume: Math.round(p.totalVolume),
    intensity: Math.round(p.avgIntensity),
    sets: p.totalSets,
  }));
  const hasEnoughData = series.some((p) => p.totalVolume > 0);

  if (isLoading && series.length === 0) {
    return <div className="h-24 animate-pulse rounded-md bg-surface" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Weight className="h-5 w-5" />
              Volume & Intensity
            </CardTitle>
            <CardDescription>
              Weekly training load -- total volume lifted (bars) vs. average weight per rep
              (line). Only counts sets logged with a numeric weight.
            </CardDescription>
          </div>
          <RadioChipGroup
            label=""
            className="[&>p]:hidden"
            options={WEEKLY_LOAD_WINDOW_OPTIONS.map((o) => o.label)}
            value={WEEKLY_LOAD_WINDOW_OPTIONS.find((o) => o.weeks === windowWeeks)?.label ?? "12wk"}
            onChange={(label) => {
              const match = WEEKLY_LOAD_WINDOW_OPTIONS.find((o) => o.label === label);
              if (match) setWindowWeeks(match.weeks);
            }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {!hasEnoughData ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No training load logged in the last {windowWeeks} weeks -- try a wider window.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="volume" tick={{ fontSize: 11 }} width={50} />
                <YAxis yAxisId="intensity" orientation="right" tick={{ fontSize: 11 }} width={50} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="volume"
                  dataKey="volume"
                  name="Total Volume"
                  fill="hsl(var(--primary))"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="intensity"
                  type="monotone"
                  dataKey="intensity"
                  name="Avg Load/Rep"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type TrendPoint = { athleteId: number; athleteName: string; date: string; value: number };

const TREND_COLORS = [
  "hsl(var(--primary))",
  "#3b82f6",
  "#f59e0b",
  "#a855f7",
  "#22c55e",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
];

/** One line per athlete for a chosen testing metric, so a coach can see team-wide
 * trends rather than just one athlete at a time. Reuses the automatic snapshot
 * history built from profile-edit testing fields -- no separate data entry. */
function TeamTrends() {
  const [metric, setMetric] = useState<TestingMetricKey>("fortyYardDash");

  const { data: points = [], isLoading } = useQuery<TrendPoint[]>({
    queryKey: ["/api/coach/testing-trends", metric],
    queryFn: () => getJson(`/api/coach/testing-trends?metric=${metric}`),
  });

  const activeMetric = TESTING_METRICS.find((m) => m.key === metric)!;
  const athletes = Array.from(new Set(points.map((p) => p.athleteName))).sort();
  const dates = Array.from(new Set(points.map((p) => p.date))).sort();

  const chartData = dates.map((date) => {
    const row: Record<string, string | number> = { label: format(parseISO(date), "MMM d") };
    for (const p of points.filter((pt) => pt.date === date)) {
      row[p.athleteName] = p.value;
    }
    return row;
  });

  return (
    <div className="space-y-4">
      <RadioChipGroup
        label="Metric"
        options={TESTING_METRICS.map((m) => m.label)}
        value={activeMetric.label}
        onChange={(label) => {
          const match = TESTING_METRICS.find((m) => m.label === label);
          if (match) setMetric(match.key);
        }}
      />

      {!isLoading && athletes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              No {activeMetric.label.toLowerCase()} entries recorded for your team yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{activeMetric.label} — Team Trend</CardTitle>
            <CardDescription>
              Every athlete with a recorded {activeMetric.label.toLowerCase()} ({activeMetric.unit}
              ), over time.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {athletes.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={TREND_COLORS[i % TREND_COLORS.length]}
                    strokeWidth={2}
                    connectNulls
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type CoachClassLessonFunnelRow = { lessonNumber: number; title: string; started: number; passed: number };
type CoachClassAnalyticsRow = {
  id: number;
  name: string;
  isForgeOfficial: boolean;
  lessonCount: number;
  enrolledCount: number;
  completedCount: number;
  completionRate: number;
  lessons: CoachClassLessonFunnelRow[];
};
type CoachClassAnalytics = {
  totalClasses: number;
  totalEnrollments: number;
  totalCompletions: number;
  classes: CoachClassAnalyticsRow[];
};

function coachClassPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function CoachClassFunnelRow({ row }: { row: CoachClassAnalyticsRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {row.name}
            {row.isForgeOfficial && (
              <Badge variant="outline" className="text-[10px]">
                FORGE
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.lessonCount} lesson{row.lessonCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {row.enrolledCount}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" />
            {row.enrolledCount > 0 ? coachClassPct(row.completionRate) : "–"}
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-border p-3">
          {row.enrolledCount === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">No enrollments yet.</p>
          ) : (
            <div className="space-y-1.5">
              {row.lessons.map((l) => {
                const startedPct = row.enrolledCount > 0 ? l.started / row.enrolledCount : 0;
                const passedPct = row.enrolledCount > 0 ? l.passed / row.enrolledCount : 0;
                return (
                  <div key={l.lessonNumber} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 truncate text-muted-foreground">
                      L{l.lessonNumber}: {l.title}
                    </span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-secondary">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/25"
                        style={{ width: `${startedPct * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 bg-primary"
                        style={{ width: `${passedPct * 100}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-muted-foreground">
                      {l.started} read / {l.passed} passed
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Lighter bar = read the content, solid bar = passed the quiz -- out of{" "}
                {row.enrolledCount} of your enrolled athletes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A coach's own version of the admin platform-wide Class Analytics page --
 * same per-lesson drop-off funnel, but scoped to classes this coach has
 * actually enrolled athletes into (their own, or a Forge class they've
 * assigned), and only counting their own enrollments within a shared Forge
 * class rather than every coach's on the platform. */
function CoachClassAnalyticsTab() {
  const { data, isLoading } = useQuery<CoachClassAnalytics>({
    queryKey: ["/api/coach/classes/analytics"],
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!data || data.totalClasses === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <GraduationCap className="h-8 w-8" />
          <p className="text-sm">
            Enroll an athlete in a Class to see enrollment, completion, and per-lesson drop-off here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-3xl font-bold">{data.totalClasses}</p>
              <p className="text-sm text-muted-foreground">Classes you run</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-3xl font-bold">{data.totalEnrollments}</p>
              <p className="text-sm text-muted-foreground">Your enrollments</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-3xl font-bold">
                {data.totalEnrollments > 0
                  ? coachClassPct(data.totalCompletions / data.totalEnrollments)
                  : "–"}
              </p>
              <p className="text-sm text-muted-foreground">
                Completion rate ({data.totalCompletions} finished)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enrollment &amp; Drop-off</CardTitle>
          <CardDescription>Expand a class to see where your athletes stall lesson by lesson.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.classes.map((row) => (
              <CoachClassFunnelRow key={row.id} row={row} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
