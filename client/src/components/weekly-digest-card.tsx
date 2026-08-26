import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, AlertTriangle, HeartPulse, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type WeeklyDigest = {
  newPRs: number;
  missedWorkouts: number;
  wellnessFlags: number;
};

/** Roster-wide "what changed this week" counts, so a coach gets the
 * headline without a trip into Analytics. Its own query, same as the other
 * dashboard widgets, so a slow request never blocks the rest of the page.
 * Renders nothing while the first fetch is in flight (no data yet) and
 * collapses to a one-line "quiet week" state when every count is zero,
 * rather than a card full of zeros -- still present so the coach gets a
 * definite "nothing needs you" instead of the card just vanishing. */
export function WeeklyDigestCard() {
  const { data } = useQuery<WeeklyDigest>({
    queryKey: ["/api/coach/weekly-digest"],
    queryFn: () => getJson("/api/coach/weekly-digest"),
    staleTime: 5 * 60 * 1000,
  });

  if (!data) return null;

  const { newPRs, missedWorkouts, wellnessFlags } = data;
  const isQuiet = newPRs === 0 && missedWorkouts === 0 && wellnessFlags === 0;

  return (
    <Card className="shrink-0">
      <CardHeader className="p-3 md:p-4">
        <CardTitle className="text-base md:text-lg">This Week</CardTitle>
        <CardDescription>What changed across your roster this week.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 md:p-4 md:pt-0">
        {isQuiet ? (
          <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            Quiet week -- no new PRs, missed workouts, or wellness flags.
          </p>
        ) : (
          <>
            <DigestRow
              icon={Trophy}
              label="New PRs this week"
              value={newPRs}
              tone="success"
            />
            <DigestRow
              icon={AlertTriangle}
              label="Missed workouts this week"
              value={missedWorkouts}
              tone="primary"
            />
            <DigestRow
              icon={HeartPulse}
              label="Wellness flags this week"
              value={wellnessFlags}
              tone="destructive"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

const TONE_CLASSES = {
  success: "bg-success/15 text-success",
  primary: "bg-primary/15 text-primary",
  destructive: "bg-destructive/15 text-destructive",
} as const;

function DigestRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-2.5">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          TONE_CLASSES[tone],
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="flex-1 truncate text-sm font-medium text-foreground">{label}</p>
      <p className="font-display text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
