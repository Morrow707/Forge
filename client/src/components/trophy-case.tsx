import { Trophy } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TrophyCategory, TrophyTier } from "@shared/achievements";
import { TROPHY_CATEGORY_LABEL } from "@shared/achievements";

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
// accessibility pass. Trophies stack (Pokemon-Go style): every threshold
// ever crossed stays visible, sorted low-to-high within its category, not
// collapsed down to just the highest one reached.
const TIER_STYLES: Record<TrophyTier, string> = {
  gold: "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  silver: "border-slate-400/50 bg-slate-400/10 text-slate-600 dark:text-slate-300",
  bronze: "border-amber-700/50 bg-amber-700/10 text-amber-800 dark:text-amber-500",
};

const CATEGORY_ORDER: TrophyCategory[] = ["workout_count", "streak", "pr_count"];

export function TrophyCase({
  trophies,
  emptyHint,
}: {
  trophies: AthleteTrophyView[];
  emptyHint?: string;
}) {
  if (trophies.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyHint ?? "No trophies unlocked yet -- log workouts to start earning them."}
      </p>
    );
  }

  const byCategory = new Map<TrophyCategory, AthleteTrophyView[]>();
  for (const t of trophies) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => a.threshold - b.threshold);
  }

  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => (
        <div key={category}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {TROPHY_CATEGORY_LABEL[category]}
          </p>
          <div className="flex flex-wrap gap-2">
            {byCategory.get(category)!.map((t) => (
              <div
                key={t.id}
                title={`Unlocked ${format(parseISO(t.unlockedAt), "MMM d, yyyy")}`}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${TIER_STYLES[t.tier]}`}
              >
                <Trophy className="h-3.5 w-3.5" />
                {t.label}
                <span className="text-[10px] font-bold uppercase opacity-80">{t.tier}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
