import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getJson } from "@/lib/queryClient";
import { Trophy, Medal, Timer } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatHeight } from "@/components/profile-fields-form";
import { StreakBadges } from "@/components/streak-badge";
import { cn } from "@/lib/utils";

type LeaderboardExercise = { id: number; name: string };
type LeaderboardEntry = {
  id: number;
  name: string;
  sport: string | null;
  position: string | null;
  age: number | null;
  heightIn: number | null;
  bodyWeightLbs: number | null;
  estimatedOneRm: number;
  weight: number;
  reps: number;
  date: string;
  weightUnit: string;
  currentStreak: number;
  totalCompleted: number;
};

type SpeedLeaderboardEntry = {
  id: number;
  name: string;
  sport: string | null;
  position: string | null;
  age: number | null;
  heightIn: number | null;
  bodyWeightLbs: number | null;
  elapsedSeconds: number;
  distanceYards: number | null;
  date: string;
  currentStreak: number;
  totalCompleted: number;
};

const RANK_STYLES = [
  "bg-amber-400 text-black",
  "bg-slate-300 text-black",
  "bg-amber-700 text-white",
];

function RosterRow({
  rank,
  name,
  sport,
  position,
  age,
  heightIn,
  bodyWeightLbs,
  currentStreak,
  totalCompleted,
  statValue,
  statCaption,
}: {
  rank: number;
  name: string;
  sport: string | null;
  position: string | null;
  age: number | null;
  heightIn: number | null;
  bodyWeightLbs: number | null;
  currentStreak: number;
  totalCompleted: number;
  statValue: string;
  statCaption: string;
}) {
  return (
    <div className="flex items-center gap-4 p-4">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          RANK_STYLES[rank] ?? "bg-surface-elevated text-muted-foreground",
        )}
      >
        {rank < 3 ? <Medal className="h-4 w-4" /> : rank + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {sport && (
            <Badge variant="secondary" className="text-[10px]">
              {sport}
            </Badge>
          )}
          {position && (
            <Badge variant="outline" className="text-[10px]">
              {position}
            </Badge>
          )}
          {age != null && <span className="text-[10px] text-muted-foreground">{age}y</span>}
          {heightIn != null && (
            <span className="text-[10px] text-muted-foreground">{formatHeight(heightIn)}</span>
          )}
          {bodyWeightLbs != null && (
            <span className="text-[10px] text-muted-foreground">{bodyWeightLbs} lbs bw</span>
          )}
          <StreakBadges currentStreak={currentStreak} totalCompleted={totalCompleted} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-lg font-bold tabular-nums">{statValue}</p>
        <p className="text-xs text-muted-foreground">{statCaption}</p>
      </div>
    </div>
  );
}

function StrengthLeaderboard() {
  const [exerciseId, setExerciseId] = useState<string>("");

  const { data: exercises = [] } = useQuery<LeaderboardExercise[]>({
    queryKey: ["/api/coach/leaderboard/exercises"],
  });

  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/coach/leaderboard", exerciseId],
    queryFn: () => getJson(`/api/coach/leaderboard?exerciseId=${exerciseId}`),
    enabled: !!exerciseId,
  });

  const selectedName = exercises.find((e) => String(e.id) === exerciseId)?.name;

  return (
    <>
      <div className="mb-6 max-w-xs space-y-1.5">
        <label className="text-xs font-semibold uppercase text-muted-foreground">Exercise</label>
        <Select value={exerciseId} onValueChange={setExerciseId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick an exercise" />
          </SelectTrigger>
          <SelectContent>
            {exercises.length === 0 ? (
              <SelectItem value="_none" disabled>
                No exercises assigned yet
              </SelectItem>
            ) : (
              exercises.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {!exerciseId && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Pick an exercise to rank your roster by best estimated 1RM.
            </p>
          </CardContent>
        </Card>
      )}

      {exerciseId && !isLoading && entries.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              No numeric-weight sets logged for {selectedName} yet.
            </p>
          </CardContent>
        </Card>
      )}

      {exerciseId && entries.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {entries.map((entry, i) => (
              <RosterRow
                key={entry.id}
                rank={i}
                name={entry.name}
                sport={entry.sport}
                position={entry.position}
                age={entry.age}
                heightIn={entry.heightIn}
                bodyWeightLbs={entry.bodyWeightLbs}
                currentStreak={entry.currentStreak}
                totalCompleted={entry.totalCompleted}
                statValue={`${entry.estimatedOneRm} ${entry.weightUnit}`}
                statCaption={`${entry.weight} ${entry.weightUnit} × ${entry.reps} on ${format(parseISO(entry.date), "MMM d")}`}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

// Entirely separate data path from the strength tab above -- ranks by best
// (lowest) camera-timed sprint for one skill drill, never touching
// workoutSetEntries/exercises, matching Skills' data-isolation rule.
function SpeedLeaderboard() {
  const [skillExerciseId, setSkillExerciseId] = useState<string>("");

  const { data: exercises = [] } = useQuery<LeaderboardExercise[]>({
    queryKey: ["/api/coach/leaderboard/skill-exercises"],
  });

  const { data: entries = [], isLoading } = useQuery<SpeedLeaderboardEntry[]>({
    queryKey: ["/api/coach/leaderboard/speed", skillExerciseId],
    queryFn: () => getJson(`/api/coach/leaderboard/speed?skillExerciseId=${skillExerciseId}`),
    enabled: !!skillExerciseId,
  });

  const selectedName = exercises.find((e) => String(e.id) === skillExerciseId)?.name;

  return (
    <>
      <div className="mb-6 max-w-xs space-y-1.5">
        <label className="text-xs font-semibold uppercase text-muted-foreground">
          Drill
        </label>
        <Select value={skillExerciseId} onValueChange={setSkillExerciseId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a timed drill" />
          </SelectTrigger>
          <SelectContent>
            {exercises.length === 0 ? (
              <SelectItem value="_none" disabled>
                No timed drills assigned yet
              </SelectItem>
            ) : (
              exercises.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {!skillExerciseId && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Timer className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Pick a drill to rank your roster by best camera-timed sprint.
            </p>
          </CardContent>
        </Card>
      )}

      {skillExerciseId && !isLoading && entries.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Timer className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              No camera-timed sprints recorded for {selectedName} yet.
            </p>
          </CardContent>
        </Card>
      )}

      {skillExerciseId && entries.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {entries.map((entry, i) => (
              <RosterRow
                key={entry.id}
                rank={i}
                name={entry.name}
                sport={entry.sport}
                position={entry.position}
                age={entry.age}
                heightIn={entry.heightIn}
                bodyWeightLbs={entry.bodyWeightLbs}
                currentStreak={entry.currentStreak}
                totalCompleted={entry.totalCompleted}
                statValue={`${entry.elapsedSeconds.toFixed(2)}s`}
                statCaption={`${entry.distanceYards != null ? `${entry.distanceYards} yd on ` : ""}${format(parseISO(entry.date), "MMM d")}`}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** Coach-only. Two fully separate leaderboards, matching the rest of
 * Skills' data-isolation rule: strength (best estimated 1RM per lift) and
 * Speed & Agility (best camera-timed sprint per drill) never share a query
 * or a tab -- a coach with no Skills players just sees an empty Speed &
 * Agility tab, never strength data bleeding in or vice versa. */
export default function CoachLeaderboard() {
  return (
    <AppShell title="Leaderboard">
      <Tabs defaultValue="strength">
        <TabsList className="mb-6">
          <TabsTrigger value="strength">Strength</TabsTrigger>
          <TabsTrigger value="speed">Speed & Agility</TabsTrigger>
        </TabsList>
        <TabsContent value="strength">
          <StrengthLeaderboard />
        </TabsContent>
        <TabsContent value="speed">
          <SpeedLeaderboard />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
