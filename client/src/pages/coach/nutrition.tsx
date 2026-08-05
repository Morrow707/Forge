import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NutritionDialog } from "@/components/nutrition-dialog";
import { Apple, Search } from "lucide-react";

type RosterEntry = {
  id: number;
  name: string;
  email: string;
  sport?: string | null;
  position?: string | null;
};

/** Dedicated Nutrition tab for a coach -- the roster page still has its own
 * quick-access Nutrition icon button per athlete, this just gives coaches a
 * top-level home for the same NutritionDialog when nutrition (not workouts)
 * is what they're there to manage. Full read-write, same as the roster
 * entry point -- see NutritionDialog's own comment on why the AI never
 * touches these numbers. */
export default function CoachNutrition() {
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });
  const [search, setSearch] = useState("");
  const [nutritionAthlete, setNutritionAthlete] = useState<RosterEntry | null>(null);

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
        Set macro and micro targets for each athlete on your roster -- ideally from a real
        nutritionist's plan. The AI never generates these numbers, it only answers general
        questions for athletes managing their own.
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
              {filtered.map((a) => (
                <Card key={a.id}>
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setNutritionAthlete(a)}
                    >
                      <Apple className="h-4 w-4" />
                      Nutrition Targets
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {nutritionAthlete && (
        <NutritionDialog
          open={nutritionAthlete !== null}
          onOpenChange={(open) => !open && setNutritionAthlete(null)}
          athleteName={nutritionAthlete.name}
          nutritionUrl={`/api/coach/roster/${nutritionAthlete.id}/nutrition`}
        />
      )}
    </AppShell>
  );
}
