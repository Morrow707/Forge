import { Flame, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const MILESTONE_TIERS = [100, 50, 25, 10, 5];
const STREAK_TIERS = [20, 10, 5, 3];

/** Icon + text badges derived from workout counts/streaks -- never
 * color-only, and only the single highest tier reached is shown so a
 * veteran athlete's card doesn't get cluttered with every lower milestone
 * they've long since passed. */
export function StreakBadges({
  currentStreak,
  totalCompleted,
}: {
  currentStreak: number;
  totalCompleted: number;
}) {
  const milestone = MILESTONE_TIERS.find((t) => totalCompleted >= t);
  const streakTier = STREAK_TIERS.find((t) => currentStreak >= t);

  if (!milestone && !streakTier) return null;

  return (
    <>
      {streakTier && (
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Flame className="h-3 w-3" />
          {currentStreak} Streak
        </Badge>
      )}
      {milestone && (
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Award className="h-3 w-3" />
          {milestone}+ Workouts
        </Badge>
      )}
    </>
  );
}
