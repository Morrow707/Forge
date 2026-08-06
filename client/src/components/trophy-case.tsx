import {
  Flag,
  Dumbbell,
  Medal,
  Award,
  Star,
  Crown,
  Gem,
  CalendarCheck,
  Flame,
  Zap,
  Rocket,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TrophyCategory, TrophyTier, TrophyDefinition } from "@shared/achievements";
import { ALL_TROPHY_DEFINITIONS, TROPHY_CATEGORY_LABEL } from "@shared/achievements";
import { cn } from "@/lib/utils";

export type AthleteTrophyView = {
  id: number;
  key: string;
  category: TrophyCategory;
  tier: TrophyTier;
  label: string;
  threshold: number;
  unlockedAt: string;
};

// Bronze/silver/gold shown with distinct colors AND an explicit tier word on
// every badge -- never color-only, matching the rest of the app's
// accessibility pass.
const TIER_STYLES: Record<TrophyTier, { border: string; bg: string; text: string; icon: string }> = {
  gold: {
    border: "border-yellow-500/50",
    bg: "bg-yellow-500/10",
    text: "text-yellow-700 dark:text-yellow-400",
    icon: "text-yellow-600 dark:text-yellow-400",
  },
  silver: {
    border: "border-slate-400/50",
    bg: "bg-slate-400/10",
    text: "text-slate-600 dark:text-slate-300",
    icon: "text-slate-500 dark:text-slate-300",
  },
  bronze: {
    border: "border-amber-700/50",
    bg: "bg-amber-700/10",
    text: "text-amber-800 dark:text-amber-500",
    icon: "text-amber-700 dark:text-amber-500",
  },
};

const CATEGORY_ORDER: TrophyCategory[] = ["workout_count", "streak", "pr_count"];

// Deliberately varied per trophy instead of the same Trophy glyph repeated
// 18 times -- escalates in "weight" within each category (a flag for the
// very first milestone, up to a gem/crown at the top) so the case reads as
// a real progression at a glance, not a wall of identical icons with
// different numbers next to them.
const TROPHY_ICON_BY_KEY: Record<string, LucideIcon> = {
  workout_count_1: Flag,
  workout_count_10: Dumbbell,
  workout_count_25: Medal,
  workout_count_50: Award,
  workout_count_100: Star,
  workout_count_250: Crown,
  workout_count_500: Gem,
  streak_3: CalendarCheck,
  streak_5: Flame,
  streak_10: Zap,
  streak_20: Rocket,
  streak_50: Sparkles,
  streak_100: Crown,
  pr_count_1: TrendingUp,
  pr_count_10: Medal,
  pr_count_25: Award,
  pr_count_50: Star,
  pr_count_100: Crown,
};

function criteriaText(def: TrophyDefinition): string {
  switch (def.category) {
    case "workout_count":
      return `Complete ${def.threshold} workout${def.threshold === 1 ? "" : "s"}`;
    case "streak":
      return `Reach a ${def.threshold}-day training streak`;
    case "pr_count":
      return `Log ${def.threshold} personal record${def.threshold === 1 ? "" : "s"}`;
  }
}

/** Shows the FULL trophy catalog, not just what's been earned -- unearned
 * trophies stay visible, greyed out, with their unlock criteria as a
 * caption/tooltip, so an athlete can see what's still ahead instead of only
 * ever seeing their own current progress. Trophies stack (Pokemon-Go
 * style): every threshold ever crossed stays visible even after a later,
 * higher one unlocks. */
export function TrophyCase({
  trophies,
  emptyHint,
}: {
  trophies: AthleteTrophyView[];
  emptyHint?: string;
}) {
  const earnedByKey = new Map(trophies.map((t) => [t.key, t]));

  const byCategory = new Map<TrophyCategory, TrophyDefinition[]>();
  for (const def of ALL_TROPHY_DEFINITIONS) {
    const list = byCategory.get(def.category) ?? [];
    list.push(def);
    byCategory.set(def.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => a.threshold - b.threshold);
  }

  return (
    <div className="space-y-5">
      {trophies.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {emptyHint ?? "No trophies unlocked yet -- log workouts to start earning them."}
        </p>
      )}
      {CATEGORY_ORDER.map((category) => (
        <div key={category}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {TROPHY_CATEGORY_LABEL[category]}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
            {byCategory.get(category)!.map((def) => {
              const earned = earnedByKey.get(def.key);
              const Icon = TROPHY_ICON_BY_KEY[def.key] ?? Award;
              const style = TIER_STYLES[def.tier];
              return (
                <div
                  key={def.key}
                  title={
                    earned
                      ? `Unlocked ${format(parseISO(earned.unlockedAt), "MMM d, yyyy")}`
                      : criteriaText(def)
                  }
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-opacity",
                    earned ? cn(style.border, style.bg) : "border-border bg-surface opacity-45",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      earned ? style.bg : "bg-muted",
                    )}
                  >
                    <Icon className={cn("h-5 w-5", earned ? style.icon : "text-muted-foreground")} />
                  </div>
                  <p
                    className={cn(
                      "text-xs font-semibold leading-tight",
                      earned ? style.text : "text-muted-foreground",
                    )}
                  >
                    {def.label}
                  </p>
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase",
                      earned ? cn(style.text, "opacity-80") : "text-muted-foreground",
                    )}
                  >
                    {def.tier}
                  </span>
                  {!earned && (
                    <p className="text-[9px] leading-tight text-muted-foreground">{criteriaText(def)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
