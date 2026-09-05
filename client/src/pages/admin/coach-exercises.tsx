import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { Copy, Users, Video, VideoOff } from "lucide-react";

type Match = { id: number; name: string; coachName?: string; score: number };

type CoachExercise = {
  id: number;
  name: string;
  category: string;
  equipment: string;
  movementType: string | null;
  muscleGroup: string;
  videoEligible: boolean | null;
  createdAt: string;
  coachId: number;
  coachName: string;
  matchesLibrary: Match[];
  matchesOtherCoaches: Match[];
};

type Response = {
  exercises: CoachExercise[];
  counts: {
    total: number;
    duplicatesOfLibrary: number;
    duplicatesOfEachOther: number;
    filmable: number;
  };
};

type Filter = "all" | "library_dupes" | "coach_dupes" | "original" | "filmable";

function MatchList({ label, matches }: { label: string; matches: Match[] }) {
  if (!matches.length) return null;
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
        {label}
      </p>
      <ul className="mt-1 space-y-0.5">
        {matches.map((m) => (
          <li key={m.id} className="text-sm">
            {m.name}
            {m.coachName ? <span className="text-muted-foreground"> · {m.coachName}</span> : null}
            <span className="ml-2 text-xs text-muted-foreground">
              {Math.round(m.score * 100)}% match
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What coaches are actually building, and how much of it Forge already has.
 *
 * Separate from /admin/review on purpose. That page answers "which exercise NAME did two or more
 * coaches type identically", which is the right question for promoting something into the Forge
 * library and the wrong one for seeing the shape of what coaches create: it never shows a
 * one-off, and it misses every rewording, which is most of them. Nobody retypes "Bench Press" --
 * they type "Flat BB Bench Press", and an exact-match group never sees the two together.
 *
 * Nothing here edits a coach's exercise. It is a read-only window, and the action it is meant to
 * prompt is off-page: adding a genuinely new movement to the Forge library, or telling a coach
 * the thing they built already exists. */
export default function AdminCoachExercisesPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading } = useQuery<Response>({
    queryKey: ["/api/admin/coach-exercises"],
    queryFn: () => getJson("/api/admin/coach-exercises"),
  });

  const visible = useMemo(() => {
    const all = data?.exercises ?? [];
    const term = search.trim().toLowerCase();
    return all.filter((ex) => {
      if (term && !ex.name.toLowerCase().includes(term) && !ex.coachName.toLowerCase().includes(term)) {
        return false;
      }
      if (filter === "library_dupes") return ex.matchesLibrary.length > 0;
      if (filter === "coach_dupes") return ex.matchesOtherCoaches.length > 0;
      if (filter === "original") return !ex.matchesLibrary.length && !ex.matchesOtherCoaches.length;
      if (filter === "filmable") return ex.videoEligible !== false;
      return true;
    });
  }, [data, search, filter]);

  const counts = data?.counts;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Coach-created exercises</h1>
        <p className="text-sm text-muted-foreground">
          Everything coaches have built outside the Forge library, with anything that looks like a
          duplicate flagged. Read-only.
        </p>
      </div>

      {counts && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["all", "Total", counts.total, Users],
              ["library_dupes", "Already in Forge", counts.duplicatesOfLibrary, Copy],
              ["coach_dupes", "Built twice", counts.duplicatesOfEachOther, Copy],
              ["filmable", "Filmable", counts.filmable, counts.filmable ? Video : VideoOff],
            ] as const
          ).map(([key, label, value, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(filter === key ? "all" : (key as Filter))}
              className={
                "rounded-lg border p-3 text-left transition-colors " +
                (filter === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")
              }
            >
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by exercise or coach name"
          className="max-w-xs"
        />
        {filter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>
            Clear filter
          </Button>
        )}
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/review">Reports & trending</Link>
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && !visible.length && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nothing matches that.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {visible.map((ex) => (
          <Card key={ex.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{ex.name}</CardTitle>
                  <CardDescription>
                    {ex.coachName} · {ex.muscleGroup} · {ex.equipment}
                    {ex.movementType ? ` · ${ex.movementType}` : ""} ·{" "}
                    {formatDistanceToNow(new Date(ex.createdAt), { addSuffix: true })}
                  </CardDescription>
                </div>
                <div className="flex gap-1.5">
                  <Badge variant="outline">{ex.category}</Badge>
                  {ex.videoEligible !== false && (
                    <Badge variant="destructive" className="gap-1">
                      <Video className="h-3 w-3" />
                      Filmable
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <MatchList label="Forge already has" matches={ex.matchesLibrary} />
              <MatchList label="Another coach built" matches={ex.matchesOtherCoaches} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
