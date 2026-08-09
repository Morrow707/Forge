import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/food-log-panel";
import { Search } from "lucide-react";

type RosterEntry = {
  id: number;
  name: string;
  email: string;
  sport?: string | null;
  position?: string | null;
};

type NutritionSummary = {
  athleteId: number;
  targets: { caloriesKcal: number | null; proteinG: number | null } | null;
  totals: { caloriesKcal: number; proteinG: number };
};

/** Dedicated Nutrition tab for a coach -- at-a-glance "goal vs hit today"
 * for the whole roster, so a coach doesn't have to open every athlete
 * individually just to see who's on track. Click an athlete to land on
 * their full nutrition tab (targets + food-log history) on their own
 * profile page -- see the ?tab=nutrition handling in athlete-detail.tsx. */
export default function CoachNutrition() {
  const [, navigate] = useLocation();
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });
  const { data: summaries = [] } = useQuery<NutritionSummary[]>({
    queryKey: ["/api/coach/nutrition-summary"],
  });
  const [search, setSearch] = useState("");

  const summaryByAthlete = new Map(summaries.map((s) => [s.athleteId, s]));

  const filtered = roster.filter((a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.sport ?? "").toLowerCase().includes(q) ||
      (a.position ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <AppShell title="Nutrition">
      <p className="mb-6 text-sm text-muted-foreground">
        Today's macro goals vs. what each athlete has actually logged. Click an athlete to see
        their full targets and food-log history -- set targets there too, ideally from a real
        nutritionist's plan. The AI never generates these numbers.
      </p>

      {roster.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No athletes on your roster yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search athletes by name, sport, position..."
              className="pl-8"
              aria-label="Search athletes"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No athletes match "{search}".
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((a) => {
                const summary = summaryByAthlete.get(a.id);
                const hasTargets =
                  summary?.targets &&
                  (summary.targets.caloriesKcal != null || summary.targets.proteinG != null);
                return (
                  <Card
                    key={a.id}
                    className="cursor-pointer transition-colors hover:border-primary/50"
                    onClick={() => navigate(`/coach/roster/${a.id}?tab=nutrition`)}
                  >
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{a.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                        {(a.sport || a.position) && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {a.sport && <Badge variant="secondary">{a.sport}</Badge>}
                            {a.position && <Badge variant="outline">{a.position}</Badge>}
                          </div>
                        )}
                      </div>
                      {hasTargets ? (
                        <div className="space-y-2 border-t border-border pt-3">
                          <ProgressBar
                            label="Calories"
                            value={summary!.totals.caloriesKcal}
                            target={summary!.targets!.caloriesKcal}
                            unit="kcal"
                          />
                          <ProgressBar
                            label="Protein"
                            value={summary!.totals.proteinG}
                            target={summary!.targets!.proteinG}
                            unit="g"
                          />
                        </div>
                      ) : (
                        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                          No targets set yet
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
