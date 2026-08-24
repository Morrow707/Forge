import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Users, ShieldAlert } from "lucide-react";

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
