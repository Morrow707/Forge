import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, Trash2, Trophy } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import {
  CHALLENGE_METRIC_LABEL,
  type ChallengeMetric,
  type TeamChallenge,
} from "@/lib/team-challenges";

/** Lives inside a team's card on the roster page -- team-scoped, not
 * individual, so it sits alongside the existing per-athlete leaderboard
 * rather than duplicating it. Every team's challenges share one query
 * (rather than one fetch per team card) and are filtered client-side. */
export function TeamChallengesSection({
  teamId,
  teamName,
}: {
  teamId: number;
  teamName: string;
}) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: challenges = [] } = useQuery<TeamChallenge[]>({
    queryKey: ["/api/coach/team-challenges"],
    queryFn: () => getJson("/api/coach/team-challenges"),
  });
  const teamChallenges = challenges.filter((c) => c.teamId === teamId);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/coach/team-challenges/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/team-challenges"] });
      toast.success("Quest removed");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't remove that quest"),
  });

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Trophy className="h-3.5 w-3.5" /> Squad Quests
        </p>
        <Button size="sm" variant="ghost" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New Quest
        </Button>
      </div>
      {teamChallenges.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active quests for this team yet.</p>
      ) : (
        <div className="space-y-2">
          {teamChallenges.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {CHALLENGE_METRIC_LABEL[c.metric]} · {format(parseISO(c.startDate), "MMM d")}–
                    {format(parseISO(c.endDate), "MMM d")}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => deleteMutation.mutate(c.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-lg font-bold text-primary">
                    {c.progress.teamTotal.toLocaleString()}
                  </span>
                  {c.progress.target != null && (
                    <span className="text-xs text-muted-foreground">
                      of {c.progress.target.toLocaleString()} goal
                    </span>
                  )}
                </div>
                {c.progress.target != null && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-success transition-all"
                      style={{
                        width: `${Math.min(100, (c.progress.teamTotal / c.progress.target) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              {c.progress.perAthlete.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {c.progress.perAthlete.map((a) => (
                    <div
                      key={a.athleteId}
                      className="flex items-center justify-between text-[11px] text-muted-foreground"
                    >
                      <span className="truncate">{a.name}</span>
                      <span className="shrink-0 font-semibold">
                        {a.contribution.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <CreateChallengeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        teamId={teamId}
        teamName={teamName}
      />
    </div>
  );
}

function CreateChallengeDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number;
  teamName: string;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<ChallengeMetric>("total_reps");
  const [targetValue, setTargetValue] = useState("");
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/coach/teams/${teamId}/challenges`, {
        title,
        metric,
        targetValue: targetValue.trim() ? Number(targetValue) : null,
        startDate,
        endDate,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/team-challenges"] });
      toast.success("Quest created");
      onOpenChange(false);
      setTitle("");
      setTargetValue("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't create that quest"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Squad Quest for {teamName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="quest-title">Title</Label>
            <Input
              id="quest-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. August Volume Quest"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as ChallengeMetric)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workouts_completed">Workouts Completed</SelectItem>
                <SelectItem value="total_reps">Total Reps</SelectItem>
                <SelectItem value="total_volume">Total Volume (lbs)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quest-target">Team Goal (optional)</Label>
            <Input
              id="quest-target"
              type="number"
              min={1}
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="Leave blank to just track the running total"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quest-start">Start</Label>
              <Input
                id="quest-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quest-end">End</Label>
              <Input
                id="quest-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!title.trim() || createMutation.isPending}
          >
            Create Quest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
