import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, Trash2, Swords, CalendarClock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

type TeamGameDay = {
  id: number;
  teamId: number;
  teamName: string;
  date: string;
  opponent: string | null;
  notes: string | null;
};

type MicrocycleDay = {
  date: string;
  offset: number;
  label: string;
  title: string | null;
  isRestDay: boolean;
  exerciseCount: number;
  completed: boolean;
};

type MicrocyclePlan = {
  gameDay: TeamGameDay;
  windowStart: string;
  windowEnd: string;
  dates: { date: string; offset: number; label: string }[];
  athletes: { athleteId: number; athleteName: string; days: MicrocycleDay[] }[];
};

/** Lives inside a team's card on the roster page, alongside Squad Quests --
 * a team's competition schedule plus a "microcycle" planning grid that lays
 * out every athlete's training in the days around one game, labeled by
 * offset (GD-3, GD-1, Game Day, GD+1) so a coach can eyeball -- and adjust
 * -- the whole squad's taper-in/recovery-out structure at a glance. */
export function GameDaysSection({ teamId, teamName }: { teamId: number; teamName: string }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [microcycleGameDay, setMicrocycleGameDay] = useState<TeamGameDay | null>(null);
  const { data: gameDays = [] } = useQuery<TeamGameDay[]>({
    queryKey: ["/api/coach/team-game-days"],
    queryFn: () => getJson("/api/coach/team-game-days"),
  });
  const teamGameDays = gameDays.filter((g) => g.teamId === teamId);
  const today = format(new Date(), "yyyy-MM-dd");

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/coach/team-game-days/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/team-game-days"] });
      toast.success("Game day removed");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't remove that game day"),
  });

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Swords className="h-3.5 w-3.5" /> Game Days
        </p>
        <Button size="sm" variant="ghost" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add Game Day
        </Button>
      </div>
      {teamGameDays.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No games scheduled yet -- add one to plan the week's training around it.
        </p>
      ) : (
        <div className="space-y-1.5">
          {teamGameDays.map((g) => (
            <div
              key={g.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border border-border p-2",
                g.date < today && "opacity-60",
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {format(parseISO(g.date), "EEE, MMM d")}
                  {g.opponent && <span className="font-normal text-muted-foreground"> vs {g.opponent}</span>}
                </p>
                {g.notes && <p className="truncate text-[11px] text-muted-foreground">{g.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => setMicrocycleGameDay(g)}>
                  <CalendarClock className="h-3.5 w-3.5" />
                  Microcycle
                </Button>
                <button
                  type="button"
                  aria-label={`Delete game day ${g.date}`}
                  onClick={() => deleteMutation.mutate(g.id)}
                  className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <CreateGameDayDialog open={dialogOpen} onOpenChange={setDialogOpen} teamId={teamId} teamName={teamName} />
      {microcycleGameDay && (
        <MicrocycleDialog
          gameDay={microcycleGameDay}
          onOpenChange={(open) => !open && setMicrocycleGameDay(null)}
        />
      )}
    </div>
  );
}

function CreateGameDayDialog({
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
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [opponent, setOpponent] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/coach/teams/${teamId}/game-days`, {
        date,
        opponent: opponent.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/team-game-days"] });
      toast.success("Game day added");
      onOpenChange(false);
      setOpponent("");
      setNotes("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't add that game day"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Game Day for {teamName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gd-date">Date</Label>
            <Input id="gd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd-opponent">Opponent (optional)</Label>
            <Input
              id="gd-opponent"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="e.g. Central High"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd-notes">Notes (optional)</Label>
            <Input
              id="gd-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Away, early bus call"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            Add Game Day
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MicrocycleDialog({
  gameDay,
  onOpenChange,
}: {
  gameDay: TeamGameDay;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: plan, isLoading } = useQuery<MicrocyclePlan>({
    queryKey: [`/api/coach/teams/${gameDay.teamId}/game-days/${gameDay.id}/microcycle`],
    queryFn: () =>
      getJson(`/api/coach/teams/${gameDay.teamId}/game-days/${gameDay.id}/microcycle`),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Microcycle: {format(parseISO(gameDay.date), "EEE, MMM d")}
            {gameDay.opponent && ` vs ${gameDay.opponent}`}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !plan ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
        ) : plan.athletes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No athletes on this team yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 bg-background py-1.5 pr-3 text-[10px] uppercase text-muted-foreground">
                    Athlete
                  </th>
                  {plan.dates.map((d) => (
                    <th key={d.date} className="min-w-[92px] py-1.5 pr-2 text-center">
                      <Badge
                        variant={d.offset === 0 ? "default" : "outline"}
                        className={cn("text-[10px]", d.offset === 0 && "bg-primary")}
                      >
                        {d.label}
                      </Badge>
                      <p className="mt-1 text-[10px] font-normal text-muted-foreground">
                        {format(parseISO(d.date), "EEE M/d")}
                      </p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.athletes.map((a) => (
                  <tr key={a.athleteId} className="border-b border-border/50">
                    <td className="sticky left-0 bg-background py-2 pr-3 font-medium">
                      {a.athleteName}
                    </td>
                    {a.days.map((d) => (
                      <td key={d.date} className="py-2 pr-2 text-center align-top">
                        {d.title == null ? (
                          <span className="text-[11px] text-muted-foreground/60">-</span>
                        ) : d.isRestDay ? (
                          <span className="text-[11px] text-muted-foreground">Rest</span>
                        ) : (
                          <div className="space-y-0.5">
                            <p className="truncate text-[11px] font-medium" title={d.title}>
                              {d.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {d.exerciseCount} ex{d.completed ? " · Done" : ""}
                            </p>
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
