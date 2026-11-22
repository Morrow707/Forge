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
import { ReadFailed } from "@/components/read-failed";
import { useT } from "@/i18n";

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
  const t = useT();
  const { data = [], isLoading, isError, refetch } = useQuery<WellnessEntry[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
    enabled: open,
  });

  // The program's own check-in questions, answered beside Forge's five (coach view only):
  // "/api/coach/roster/7/wellness-history" becomes "/api/coach/roster/7/program-checkin-answers".
  const answersUrl = fetchUrl.endsWith("/wellness-history") ? fetchUrl.replace(/\/wellness-history$/, "/program-checkin-answers") : null;
  const { data: programAnswers = [] } = useQuery<{ id: number; date: string; questionText: string; value: string }[]>({
    queryKey: [answersUrl],
    queryFn: () => getJson(answersUrl!),
    enabled: open && answersUrl != null && answersUrl.startsWith("/api/coach/"),
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
            {t("{name}'s Wellness", { name: athleteName })}
          </DialogTitle>
          <DialogDescription>
            {t("Self-reported every day before {name} can see their training.", { name: athleteName.split(" ")[0] })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : isError ? (
          <ReadFailed what={t("these check-ins")} onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("No check-ins recorded yet.")}
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
                      {e.score}/100 · {t(READINESS_LABEL[e.level])}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("{hours}h sleep", { hours: e.sleepHours })}
                      {e.restingHeartRate != null && ` · ${t("{count}bpm RHR", { count: Math.round(e.restingHeartRate) })}`}
                      {e.hrv != null && ` · ${t("{count}ms HRV", { count: Math.round(e.hrv) })}`} ·{" "}
                      {t("Soreness {soreness}/5 · Stress {stress}/5 · Hydration {hydration}/5 · Focus {focus}/5", { soreness: e.soreness, stress: e.stress, hydration: e.hydration, focus: e.mentalFocus })}
                      {e.bodyPainMap.length > 0 &&
                        ` · ${t("Pain: {parts}", { parts: e.bodyPainMap
                          .map((k) => {
                            const label = BODY_PAIN_PARTS.find((p) => p.key === k)?.label;
                            return label ? t(label) : k;
                          })
                          .join(", ") })}`}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.date(parseISO(e.date), { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {programAnswers.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Your questions")}</p>
            {programAnswers.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-xs">
                <span>
                  <span className="text-muted-foreground">{a.questionText}</span> <span className="font-semibold">{a.value}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">{format(parseISO(a.date), "MMM d")}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
