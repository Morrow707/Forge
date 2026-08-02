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
import { apiRequest } from "@/lib/queryClient";
import { Trophy, Medal } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatHeight } from "@/components/profile-fields-form";
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
};

const RANK_STYLES = [
  "bg-amber-400 text-black",
  "bg-slate-300 text-black",
  "bg-amber-700 text-white",
];

/** Coach-only ranking of the whole roster by best estimated 1RM for a
 * chosen exercise -- never shown to athletes, and never mixes in another
 * coach's athletes. */
export default function CoachLeaderboard() {
  const [exerciseId, setExerciseId] = useState<string>("");

  const { data: exercises = [] } = useQuery<LeaderboardExercise[]>({
    queryKey: ["/api/coach/leaderboard/exercises"],
  });

  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/coach/leaderboard", exerciseId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/coach/leaderboard?exerciseId=${exerciseId}`);
      return res.json();
    },
    enabled: !!exerciseId,
  });

  const selectedName = exercises.find((e) => String(e.id) === exerciseId)?.name;

  return (
    <AppShell title="Leaderboard">
      <div className="mb-6 max-w-xs space-y-1.5">
        <label className="text-xs font-semibold uppercase text-muted-foreground">Exercise</label>
        <Select value={exerciseId} onValueChange={setExerciseId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick an exercise" />
          </SelectTrigger>
          <SelectContent>
            {exercises.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.name}
              </SelectItem>
            ))}
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
              <div key={entry.id} className="flex items-center gap-4 p-4">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    RANK_STYLES[i] ?? "bg-surface-elevated text-muted-foreground",
                  )}
                >
                  {i < 3 ? <Medal className="h-4 w-4" /> : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{entry.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {entry.sport && (
                      <Badge variant="secondary" className="text-[10px]">
                        {entry.sport}
                      </Badge>
                    )}
                    {entry.position && (
                      <Badge variant="outline" className="text-[10px]">
                        {entry.position}
                      </Badge>
                    )}
                    {entry.age != null && (
                      <span className="text-[10px] text-muted-foreground">{entry.age}y</span>
                    )}
                    {entry.heightIn != null && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatHeight(entry.heightIn)}
                      </span>
                    )}
                    {entry.bodyWeightLbs != null && (
                      <span className="text-[10px] text-muted-foreground">
                        {entry.bodyWeightLbs} lbs bw
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-lg font-bold">
                    {entry.estimatedOneRm} {entry.weightUnit}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.weight} {entry.weightUnit} × {entry.reps} on{" "}
                    {format(parseISO(entry.date), "MMM d")}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
