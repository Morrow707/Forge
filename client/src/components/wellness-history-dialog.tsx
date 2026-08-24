import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getJson } from "@/lib/queryClient";
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
import { HeartPulse } from "lucide-react";
import { READINESS_LABEL, BODY_PAIN_PARTS, type ReadinessLevel } from "@shared/wellness";
import { cn } from "@/lib/utils";

type WellnessEntry = {
  id: number;
  date: string;
  sleepHours: number;
  soreness: number;
  stress: number;
  hydration: number;
  mentalFocus: number;
  bodyPainMap: string[];
  restingHeartRate: number | null;
  hrv: number | null;
  score: number;
  level: ReadinessLevel;
};

export const READINESS_CLASSNAME: Record<ReadinessLevel, string> = {
  green: "bg-success/15 text-success",
  yellow: "bg-amber-400/20 text-amber-400",
  red: "bg-destructive/15 text-destructive",
};

/** Read-only -- entries are written by the athlete's own mandatory daily
 * check-in (see WellnessGate), never editable from the coach side. */
export function WellnessHistoryDialog({
  open,
  onOpenChange,
  athleteName,
  fetchUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteName: string;
  fetchUrl: string;
}) {
  const { data = [], isLoading } = useQuery<WellnessEntry[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
    enabled: open,
  });

  const chartData = [...data].reverse().map((e) => ({
    label: format(parseISO(e.date), "MMM d"),
    value: e.score,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            {athleteName}'s Wellness
          </DialogTitle>
          <DialogDescription>
            Self-reported every day before {athleteName.split(" ")[0]} can see their training.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No check-ins recorded yet.
          </p>
        ) : (
          <div className="space-y-4">
            {chartData.length >= 2 && (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={28} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                      }}
                      formatter={(value: unknown) => [`${value}`, "Readiness"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name="Readiness"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {data.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span
                      className={cn(
                        "mr-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        READINESS_CLASSNAME[e.level],
                      )}
                    >
                      {e.score}/100 · {READINESS_LABEL[e.level]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.sleepHours}h sleep
                      {e.restingHeartRate != null && ` · ${Math.round(e.restingHeartRate)}bpm RHR`}
                      {e.hrv != null && ` · ${Math.round(e.hrv)}ms HRV`} · Soreness {e.soreness}/5 ·
                      Stress {e.stress}/5 · Hydration {e.hydration}/5 · Focus {e.mentalFocus}/5
                      {e.bodyPainMap.length > 0 &&
                        ` · Pain: ${e.bodyPainMap
                          .map((k) => BODY_PAIN_PARTS.find((p) => p.key === k)?.label ?? k)
                          .join(", ")}`}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(parseISO(e.date), "MMM d")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
