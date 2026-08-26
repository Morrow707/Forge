import { useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

/** Counts `value` up from its previous value (0 on first render) over
 * `duration`ms using requestAnimationFrame with an ease-out curve -- no
 * animation library needed for something this simple. Skips straight to
 * the final value under prefers-reduced-motion (checked directly via
 * matchMedia -- there's no JS-level reduced-motion hook elsewhere in the
 * codebase yet; existing usages, e.g. App.tsx's route transition and
 * index.css's skeleton shimmer, gate purely-CSS animations with
 * motion-safe:/an @media block instead). useLayoutEffect (not useEffect)
 * so the reduced-motion jump-to-final and the animation's first frame
 * both land before paint, avoiding a one-frame flash of a stale value. */
function useCountUp(value: number, duration = 600) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useLayoutEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration]);

  return display;
}

/** Tiny inline trend line for a stat tile -- same gradient-fill-under-a-line
 * language as the full analytics charts (see coach/analytics.tsx's
 * AcwrTrendCard/WeeklyLoadTrendCard: hsl(var(--primary)) stroke, a
 * linearGradient fading from ~0.35 to 0 opacity), just hand-rolled as plain
 * SVG instead of a Recharts <AreaChart> since there's no room here for
 * axes/tooltips/margins on a ~56x20 sparkline. Renders nothing for fewer
 * than 2 points -- a single value has no trend to show. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const gradientId = useId();
  const width = 56;
  const height = 20;
  const pad = 2;
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    // A flat series (range === 0, e.g. all zeros) draws as a flat mid-height
    // line rather than dividing by zero -- still an honest picture ("nothing
    // happened"), not a fabricated slope.
    const y =
      range === 0 ? height / 2 : height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${width - pad},${height} L${pad},${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One clickable stat card on a dashboard's stat-tile row -- identical
 * between the coach and athlete dashboards (they were two hand-duplicated
 * copies of the exact same markup before this was pulled out), so both now
 * render from this single implementation.
 *
 * `trend`, when given, is a real last-7-days series (oldest to newest) --
 * only wired in on the dashboards for stats with genuine daily-granularity
 * history behind them (see each dashboard file for which and why). Never
 * pass a fabricated/placeholder series just to fill the space. */
export function StatTile({
  icon: Icon,
  label,
  value,
  href,
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
  trend?: number[];
}) {
  const displayValue = useCountUp(value);
  return (
    <Link href={href}>
      <Card className="cursor-pointer transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-3 md:p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-display text-2xl font-bold tabular-nums md:text-3xl">
                {displayValue}
              </p>
              {trend && <Sparkline values={trend} className="mb-1 shrink-0" />}
            </div>
            <p className="truncate text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
