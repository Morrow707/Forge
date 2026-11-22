/**
 * The two-sided check on a coach's view of one athlete's exercise history (2026-11-22,
 * shared/side-balance.ts). Shown only for an exercise tagged "return to training" whose sets were
 * logged one side at a time. Display only: it never gates, flags or clears anything.
 */
import { Scale } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SIDE_DIFFERENCE_GUIDE_SENTENCE, sideBalance, type SidedSet } from "@shared/side-balance";
import { useT } from "@/i18n";

export function SideBalanceNote({
  points,
  exercise,
}: {
  points: readonly SidedSet[];
  exercise: { purposes?: readonly string[] | null } | undefined;
}) {
  const t = useT();
  if (!exercise || !(exercise.purposes ?? []).includes("return_to_training")) return null;
  const balance = sideBalance(points);
  if (!balance) return null;
  return (
    <Card data-testid="side-balance-note">
      <CardContent className="flex items-start gap-3 p-4">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">{balance.sentence}</p>
          <p className="text-xs text-muted-foreground">
            {t("Best set each side across the sets shown (load x reps, or reps when no load was logged).")}
            {balance.setsWithoutSide > 0 ? ` ${t("{count} set(s) had no side recorded and are left out.", { count: balance.setsWithoutSide })}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{SIDE_DIFFERENCE_GUIDE_SENTENCE}</p>
        </div>
      </CardContent>
    </Card>
  );
}
