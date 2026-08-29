import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Users, ShieldAlert, Sparkles, Lock, Search } from "lucide-react";

type Bucket = { bucket: string; count: number };
type SportRow = {
  sport: string;
  athleteCount: number;
  avgHeightIn: number | null;
  avgWeightLbs: number | null;
  avgFortyYardDash: number | null;
  avgVerticalJumpIn: number | null;
  avgBroadJumpIn: number | null;
  avgProAgilitySeconds: number | null;
  avgBenchMaxLbs: number | null;
  avgSquatMaxLbs: number | null;
  avgDeadliftMaxLbs: number | null;
  avgEstimatedOneRm: number | null;
  avgPeakVelocityMps: number | null;
  avgPeakPowerWatts: number | null;
  avgReadinessScore: number | null;
};
type PlatformTrends = {
  totalAthletes: number;
  minCohortSize: number;
  demographics: {
    byGender: Bucket[];
    byAgeBracket: Bucket[];
    bySport: Bucket[];
  };
  bySport: SportRow[];
  acwrTrackedCount: number;
  acwrDistribution: { level: "green" | "yellow" | "red"; count: number }[];
};

type CohortMetricResult = {
  key: string;
  label: string;
  unit: string;
  source: "profile" | "tracked";
  n: number;
  suppressed: boolean;
  mean?: number;
  p25?: number;
  p75?: number;
  min?: number;
  max?: number;
};
type CohortCrosstabRow = {
  label: string;
  n: number;
  suppressed: boolean;
  mean?: number;
  p25?: number;
  p75?: number;
  min?: number;
  max?: number;
};
type CohortQueryFilters = {
  ageMin?: number | null;
  ageMax?: number | null;
  genders?: string[];
  sports?: string[];
  positions?: string[];
  exerciseNames?: string[];
  metrics: string[];
  groupBy?: "sport" | "position" | "ageBracket" | "gender" | null;
};
type CohortQueryResult = {
  filters: CohortQueryFilters;
  cohortSize: number;
  minCohortSize: number;
  results: CohortMetricResult[];
  crosstab: CohortCrosstabRow[] | null;
};

const GENDER_DISPLAY: Record<string, string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

function describeFilters(f: CohortQueryFilters): string[] {
  const chips: string[] = [];
  if (f.ageMin != null || f.ageMax != null) chips.push(`Age ${f.ageMin ?? "any"}–${f.ageMax ?? "any"}`);
  f.genders?.forEach((g) => chips.push(GENDER_DISPLAY[g] ?? g));
  f.sports?.forEach((s) => chips.push(s));
  f.positions?.forEach((p) => chips.push(p));
  f.exerciseNames?.forEach((e) => chips.push(e));
  if (f.groupBy) chips.push(`broken down by ${f.groupBy === "ageBracket" ? "age bracket" : f.groupBy}`);
  return chips;
}

function formatMetricStat(v: number | undefined, unit: string) {
  if (v == null) return "–";
  return `${Math.round(v * 100) / 100}${unit}`;
}

function CohortQueryCard() {
  const [text, setText] = useState("");
  const mutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/admin/cohort-query", { text: q });
      return (await res.json()) as CohortQueryResult;
    },
  });

  const run = () => {
    if (!text.trim() || mutation.isPending) return;
    mutation.mutate(text.trim());
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Ask for a data cut
        </CardTitle>
        <CardDescription>
          Describe the cohort in plain English -- age, gender, sport, position, a specific lift.
          Same anonymity floor as everything else on this page: an answer with fewer than{" "}
          {mutation.data?.minCohortSize ?? 5} matching athletes is withheld, never shown small.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="e.g. 15-17 year old female track athletes, bar velocity on back squats"
            className="flex-1"
          />
          <Button onClick={run} disabled={!text.trim() || mutation.isPending}>
            <Search className="h-4 w-4" />
            {mutation.isPending ? "Asking..." : "Ask"}
          </Button>
        </div>

        {mutation.isError && (
          <p className="text-sm text-destructive">
            {(mutation.error as any)?.message || "Couldn't run that query -- try again."}
          </p>
        )}

        {mutation.data && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Understood as:
              </span>
              {describeFilters(mutation.data.filters).length === 0 ? (
                <Badge variant="secondary" className="font-normal">
                  whole platform
                </Badge>
              ) : (
                describeFilters(mutation.data.filters).map((c) => (
                  <Badge key={c} variant="secondary" className="font-normal">
                    {c}
                  </Badge>
                ))
              )}
              <span className="ml-1 text-xs text-muted-foreground">
                &middot; {mutation.data.cohortSize} athlete{mutation.data.cohortSize === 1 ? "" : "s"} matched
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {mutation.data.results.map((r) => (
                <div key={r.key} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                  {r.suppressed ? (
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      Only {r.n} athlete{r.n === 1 ? "" : "s"} match -- below the anonymity floor,
                      suppressed.
                    </div>
                  ) : (
                    <>
                      <p className="font-display text-2xl font-bold">
                        {formatMetricStat(r.mean, r.unit)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          mean, n={r.n}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        P25 {formatMetricStat(r.p25, r.unit)} &middot; P75{" "}
                        {formatMetricStat(r.p75, r.unit)} &middot; range {formatMetricStat(r.min, r.unit)}
                        {"–"}
                        {formatMetricStat(r.max, r.unit)}
                      </p>
                      {r.source === "tracked" && !mutation.data!.filters.exerciseNames?.length && (
                        <p className="mt-1 text-[11px] italic text-muted-foreground">
                          No specific lift named -- pooled across every tracked exercise for this
                          metric.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {mutation.data.crosstab && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                      <th className="py-1.5 pr-3">{mutation.data.filters.groupBy === "ageBracket" ? "Age bracket" : mutation.data.filters.groupBy}</th>
                      <th className="py-1.5 pr-3">Athletes</th>
                      <th className="py-1.5 pr-3">Mean</th>
                      <th className="py-1.5 pr-3">P25</th>
                      <th className="py-1.5 pr-3">P75</th>
                      <th className="py-1.5">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mutation.data.crosstab.map((row) => {
                      const unit = mutation.data!.results[0]?.unit ?? "";
                      return (
                        <tr key={row.label} className="border-b border-border/50">
                          <td className="py-1.5 pr-3 font-semibold">{row.label}</td>
                          <td className="py-1.5 pr-3">{row.n}</td>
                          {row.suppressed ? (
                            <td className="py-1.5 text-muted-foreground italic" colSpan={4}>
                              below floor -- suppressed
                            </td>
                          ) : (
                            <>
                              <td className="py-1.5 pr-3">{formatMetricStat(row.mean, unit)}</td>
                              <td className="py-1.5 pr-3">{formatMetricStat(row.p25, unit)}</td>
                              <td className="py-1.5 pr-3">{formatMetricStat(row.p75, unit)}</td>
                              <td className="py-1.5">
                                {formatMetricStat(row.min, unit)}–{formatMetricStat(row.max, unit)}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ACWR_COLOR: Record<string, string> = {
  green: "hsl(var(--success))",
  yellow: "#eab308",
  red: "hsl(var(--destructive))",
};

const ACWR_LABEL: Record<string, string> = {
  green: "Low risk",
  yellow: "Watch",
  red: "High risk",
};

function stat(value: number | null | undefined, unit = "") {
  return value == null ? "–" : `${value}${unit}`;
}

function BucketBarChart({ data, unit = "" }: { data: Bucket[]; unit?: string }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Not enough athletes in any single group yet to show this without risking identifying
        someone.
      </p>
    );
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 12 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={32} unit={unit} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
          />
          <Bar dataKey="count" name="Athletes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AdminPlatformTrends() {
  const { data, isLoading } = useQuery<PlatformTrends>({
    queryKey: ["/api/admin/platform-trends"],
  });

  return (
    <AppShell title="Platform Trends">
      <div className="space-y-6">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              Anonymized and aggregated across every athlete on Forge -- no names, emails, or
              individual records ever appear here. Any group smaller than{" "}
              {data?.minCohortSize ?? 5} athletes is left out of a breakdown entirely rather than
              shown small, so no single athlete's data is ever isolable from these numbers.
            </p>
          </CardContent>
        </Card>

        <CohortQueryCard />

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {data && (
          <>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">{data.totalAthletes}</p>
                  <p className="text-sm text-muted-foreground">Total athletes on Forge</p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>By Sport</CardTitle>
                  <CardDescription>Self-reported, grouped case-insensitively.</CardDescription>
                </CardHeader>
                <CardContent>
                  <BucketBarChart data={data.demographics.bySport} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>By Age</CardTitle>
                  <CardDescription>Bracketed, not exact ages.</CardDescription>
                </CardHeader>
                <CardContent>
                  <BucketBarChart data={data.demographics.byAgeBracket} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>By Gender</CardTitle>
                  <CardDescription>Self-reported.</CardDescription>
                </CardHeader>
                <CardContent>
                  <BucketBarChart data={data.demographics.byGender} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Training Load Risk (ACWR)</CardTitle>
                <CardDescription>
                  Acute:chronic workload ratio band, snapshotted across every athlete with logged
                  training in the last 28 days -- not broken out by sport, since that would shrink
                  the "high risk" count small enough to risk pointing at one athlete.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.acwrDistribution.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Fewer than {data.minCohortSize} athletes have logged training in the last 28
                    days -- not enough for a platform-wide risk snapshot yet.
                  </p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.acwrDistribution.map((d) => ({
                          label: ACWR_LABEL[d.level],
                          count: d.count,
                          level: d.level,
                        }))}
                        margin={{ left: 4, right: 12 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                          }}
                        />
                        <Bar dataKey="count" name="Athletes" radius={[4, 4, 0, 0]}>
                          {data.acwrDistribution.map((d) => (
                            <Cell key={d.level} fill={ACWR_COLOR[d.level]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Benchmarks by Sport</CardTitle>
                <CardDescription>
                  Group averages only -- each column requires at least {data.minCohortSize}{" "}
                  athletes contributing a value for that specific field, so some cells show a dash
                  even for an otherwise-eligible sport.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {data.bySport.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No sport has {data.minCohortSize}+ athletes yet -- this table fills in as the
                    roster grows.
                  </p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                        <th className="py-1.5 pr-3">Sport</th>
                        <th className="py-1.5 pr-3"># Athletes</th>
                        <th className="py-1.5 pr-3">Height</th>
                        <th className="py-1.5 pr-3">Weight</th>
                        <th className="py-1.5 pr-3">40-Yd</th>
                        <th className="py-1.5 pr-3">Vertical</th>
                        <th className="py-1.5 pr-3">Broad</th>
                        <th className="py-1.5 pr-3">Agility</th>
                        <th className="py-1.5 pr-3">Bench</th>
                        <th className="py-1.5 pr-3">Squat</th>
                        <th className="py-1.5 pr-3">Deadlift</th>
                        <th className="py-1.5 pr-3">Est. 1RM</th>
                        <th className="py-1.5 pr-3">Peak m/s</th>
                        <th className="py-1.5 pr-3">Power (W)</th>
                        <th className="py-1.5">Readiness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bySport.map((row) => (
                        <tr key={row.sport} className="border-b border-border/50">
                          <td className="py-1.5 pr-3 font-semibold">{row.sport}</td>
                          <td className="py-1.5 pr-3">
                            <Badge variant="secondary" className="font-normal">
                              {row.athleteCount}
                            </Badge>
                          </td>
                          <td className="py-1.5 pr-3">{stat(row.avgHeightIn, " in")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgWeightLbs, " lbs")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgFortyYardDash, "s")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgVerticalJumpIn, " in")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgBroadJumpIn, " in")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgProAgilitySeconds, "s")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgBenchMaxLbs, " lbs")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgSquatMaxLbs, " lbs")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgDeadliftMaxLbs, " lbs")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgEstimatedOneRm, " lbs")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgPeakVelocityMps, " m/s")}</td>
                          <td className="py-1.5 pr-3">{stat(row.avgPeakPowerWatts, " W")}</td>
                          <td className="py-1.5">{stat(row.avgReadinessScore, "/100")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
