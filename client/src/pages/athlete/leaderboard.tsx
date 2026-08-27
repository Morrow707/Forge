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
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Medal, Timer } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatHeight } from "@/components/profile-fields-form";
import { StreakBadges } from "@/components/streak-badge";
import { AthleteAvatar } from "@/components/athlete-avatar";
import { Skeleton } from "@/components/skeleton";
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
  rank: number;
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
  rank: number;
};

const RANK_STYLES = ["bg-amber-400 text-black", "bg-slate-300 text-black", "bg-amber-700 text-white"];

function RosterRow({
  rank,
  isYou,
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
  isYou: boolean;
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
    <div className={cn("flex items-center gap-4 p-4", isYou && "bg-primary/5")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          RANK_STYLES[rank] ?? "bg-surface-elevated text-muted-foreground",
        )}
      >
        {rank < 3 ? <Medal className="h-4 w-4" /> : rank + 1}
      </div>
      <AthleteAvatar name={name} size="sm" currentStreak={currentStreak} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {name}
          {isYou && <span className="ml-1.5 text-xs font-normal text-primary">(you)</span>}
        </p>
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

/** Placeholder for one RosterRow while its query is still in flight --
 * mirrors that row's own shape (rank circle, avatar circle, name + badge
 * line, right-aligned stat block) rather than a generic gray bar. */
function RosterRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="shrink-0 space-y-1.5 text-right">
        <Skeleton className="ml-auto h-5 w-14" />
        <Skeleton className="ml-auto h-3 w-24" />
      </div>
    </div>
  );
}

/** No-coach empty state -- a Free Agent has no roster to rank against, a
 * different fact from "your coach's roster exists but nobody's logged this
 * yet" (see the other empty states below). */
function NoCoachCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">
          The leaderboard ranks you against your coach's roster -- you'll see it once you join a
          team.
        </p>
      </CardContent>
    </Card>
  );
}

function StrengthLeaderboard({ myId }: { myId: number }) {
  const [exerciseId, setExerciseId] = useState<string>("");

  const { data: exercises } = useQuery<LeaderboardExercise[] | null>({
    queryKey: ["/api/athlete/leaderboard/exercises"],
  });

  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/athlete/leaderboard", exerciseId],
    queryFn: () => getJson(`/api/athlete/leaderboard?exerciseId=${exerciseId}`),
    enabled: !!exerciseId,
  });

  if (exercises === null) return <NoCoachCard />;

  const selectedName = exercises?.find((e) => String(e.id) === exerciseId)?.name;

  return (
    <>
      <div className="mb-6 max-w-xs space-y-1.5">
        <label className="label-xs">Exercise</label>
        <Select value={exerciseId} onValueChange={setExerciseId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick an exercise" />
          </SelectTrigger>
          <SelectContent>
            {(exercises ?? []).length === 0 ? (
              <SelectItem value="_none" disabled>
                No exercises assigned yet
              </SelectItem>
            ) : (
              (exercises ?? []).map((e) => (
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
              Pick an exercise to see where you rank on your team by best estimated 1RM.
            </p>
          </CardContent>
        </Card>
      )}

      {exerciseId && isLoading && entries.length === 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <RosterRowSkeleton key={i} />
            ))}
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
            {entries.map((entry) => (
              <RosterRow
                key={entry.id}
                rank={entry.rank}
                isYou={entry.id === myId}
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

function SpeedLeaderboard({ myId }: { myId: number }) {
  const [skillExerciseId, setSkillExerciseId] = useState<string>("");

  const { data: exercises } = useQuery<LeaderboardExercise[] | null>({
    queryKey: ["/api/athlete/leaderboard/skill-exercises"],
  });

  const { data: entries = [], isLoading } = useQuery<SpeedLeaderboardEntry[]>({
    queryKey: ["/api/athlete/leaderboard/speed", skillExerciseId],
    queryFn: () => getJson(`/api/athlete/leaderboard/speed?skillExerciseId=${skillExerciseId}`),
    enabled: !!skillExerciseId,
  });

  if (exercises === null) return <NoCoachCard />;

  const selectedName = exercises?.find((e) => String(e.id) === skillExerciseId)?.name;

  return (
    <>
      <div className="mb-6 max-w-xs space-y-1.5">
        <label className="label-xs">Drill</label>
        <Select value={skillExerciseId} onValueChange={setSkillExerciseId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a timed drill" />
          </SelectTrigger>
          <SelectContent>
            {(exercises ?? []).length === 0 ? (
              <SelectItem value="_none" disabled>
                No timed drills assigned yet
              </SelectItem>
            ) : (
              (exercises ?? []).map((e) => (
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
              Pick a drill to see where you rank on your team by best camera-timed sprint.
            </p>
          </CardContent>
        </Card>
      )}

      {skillExerciseId && isLoading && entries.length === 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <RosterRowSkeleton key={i} />
            ))}
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
            {entries.map((entry) => (
              <RosterRow
                key={entry.id}
                rank={entry.rank}
                isYou={entry.id === myId}
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

/** Athlete-facing, read-only counterpart to the coach's own Leaderboard
 * page -- same two ranking tabs (best estimated 1RM per lift, best
 * camera-timed sprint per drill), ranked against your own coach's whole
 * roster the same way team challenges already show teammates each other's
 * contributions. Nothing here is editable; this is purely "where do I
 * stand." */
export default function AthleteLeaderboard() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <AppShell title="Leaderboard">
      <Tabs defaultValue="strength">
        <TabsList className="mb-6">
          <TabsTrigger value="strength">Strength</TabsTrigger>
          <TabsTrigger value="speed">Speed & Agility</TabsTrigger>
        </TabsList>
        <TabsContent value="strength">
          <StrengthLeaderboard myId={user.id} />
        </TabsContent>
        <TabsContent value="speed">
          <SpeedLeaderboard myId={user.id} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
