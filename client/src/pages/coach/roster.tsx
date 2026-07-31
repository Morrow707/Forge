import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Users, UserPlus, Send, Plus, X, Stethoscope } from "lucide-react";

type RosterEntry = { id: number; name: string; email: string };
type TeamMember = { athlete: RosterEntry };
type TeamEntry = { id: number; name: string; members: TeamMember[] };
type ProgramSummary = { id: number; name: string };

export default function CoachRoster() {
  const qc = useQueryClient();
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });
  const { data: teams = [] } = useQuery<TeamEntry[]>({
    queryKey: ["/api/coach/teams"],
  });
  const { data: programs = [] } = useQuery<ProgramSummary[]>({
    queryKey: ["/api/coach/programs"],
  });

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignAthletes, setAssignAthletes] = useState<Map<number, boolean>>(new Map());
  const [assignProgramId, setAssignProgramId] = useState<string>("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const createTeamMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/teams", { name: newTeamName });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      setTeamDialogOpen(false);
      setNewTeamName("");
      toast.success("Team created");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not create team"),
  });

  const addToTeamMutation = useMutation({
    mutationFn: async ({ teamId, athleteId }: { teamId: number; athleteId: number }) => {
      await apiRequest("POST", `/api/coach/teams/${teamId}/members`, { athleteId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      toast.success("Added to team");
    },
  });

  const removeFromTeamMutation = useMutation({
    mutationFn: async ({ teamId, athleteId }: { teamId: number; athleteId: number }) => {
      await apiRequest("DELETE", `/api/coach/teams/${teamId}/members/${athleteId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/assignments", {
        programId: Number(assignProgramId),
        startDate,
        athletes: Array.from(assignAthletes.entries()).map(([athleteId, correctivesEnabled]) => ({
          athleteId,
          correctivesEnabled,
        })),
      });
      return res.json() as Promise<{ created: unknown[]; skippedAthleteIds: number[] }>;
    },
    onSuccess: (result) => {
      if (result.created.length > 0) {
        toast.success(
          `Assigned to ${result.created.length} athlete${result.created.length === 1 ? "" : "s"} — calendars updated`,
        );
      }
      if (result.skippedAthleteIds.length > 0) {
        const names = result.skippedAthleteIds
          .map((id) => roster.find((r) => r.id === id)?.name ?? "athlete")
          .join(", ");
        toast.info(`Already assigned this program, skipped: ${names}`);
      }
      setAssignOpen(false);
      setAssignAthletes(new Map());
      setAssignProgramId("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not assign program"),
  });

  function openAssignFor(athleteIds: number[]) {
    setAssignAthletes(new Map(athleteIds.map((id) => [id, true])));
    setAssignOpen(true);
  }

  function toggleCorrectivesForAll(enabled: boolean) {
    setAssignAthletes((prev) => {
      const next = new Map(prev);
      for (const id of next.keys()) next.set(id, enabled);
      return next;
    });
  }

  return (
    <AppShell
      title="Roster & Teams"
      actions={
        <Button onClick={() => openAssignFor([])}>
          <Send className="h-4 w-4" />
          Assign Program
        </Button>
      }
    >
      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster ({roster.length})</TabsTrigger>
          <TabsTrigger value="teams">Teams ({teams.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="roster">
          {roster.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No athletes yet. Share your coach code from the dashboard so athletes can join.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roster.map((a) => (
                <Card key={a.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openAssignFor([a.id])}>
                      Assign
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="teams">
          <div className="mb-4">
            <Button size="sm" variant="secondary" onClick={() => setTeamDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              New Team
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {teams.map((team) => (
              <Card key={team.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>{team.name}</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAssignFor(team.members.map((m) => m.athlete.id))}
                    disabled={team.members.length === 0}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Assign to Team
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 space-y-1.5">
                    {team.members.length === 0 && (
                      <p className="text-sm text-muted-foreground">No members yet.</p>
                    )}
                    {team.members.map((m) => (
                      <div
                        key={m.athlete.id}
                        className="flex items-center justify-between rounded-md bg-surface-elevated px-3 py-1.5 text-sm"
                      >
                        {m.athlete.name}
                        <button
                          onClick={() =>
                            removeFromTeamMutation.mutate({
                              teamId: team.id,
                              athleteId: m.athlete.id,
                            })
                          }
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <AddMemberSelect
                    roster={roster.filter(
                      (r) => !team.members.some((m) => m.athlete.id === r.id),
                    )}
                    onAdd={(athleteId) => addToTeamMutation.mutate({ teamId: team.id, athleteId })}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Team</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createTeamMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Team name</Label>
              <Input
                required
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g. Varsity Squad"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTeamDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTeamMutation.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Program</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              assignMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Program</Label>
              <Select value={assignProgramId} onValueChange={setAssignProgramId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Day 1 of Week 1 lands on this date on the athlete's calendar.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Athletes</Label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Correctives
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => toggleCorrectivesForAll(true)}
                  >
                    all on
                  </button>
                  ·
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => toggleCorrectivesForAll(false)}
                  >
                    all off
                  </button>
                </div>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {roster.map((a) => {
                  const selected = assignAthletes.has(a.id);
                  const correctivesEnabled = assignAthletes.get(a.id) ?? true;
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-elevated"
                    >
                      <label className="flex flex-1 items-center gap-2">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            setAssignAthletes((prev) => {
                              const next = new Map(prev);
                              if (checked) next.set(a.id, true);
                              else next.delete(a.id);
                              return next;
                            });
                          }}
                        />
                        {a.name}
                      </label>
                      {selected && (
                        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox
                            checked={correctivesEnabled}
                            onCheckedChange={(checked) =>
                              setAssignAthletes((prev) => {
                                const next = new Map(prev);
                                next.set(a.id, checked === true);
                                return next;
                              })
                            }
                          />
                          Correctives
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={assignMutation.isPending || !assignProgramId || assignAthletes.size === 0}
              >
                Assign to {assignAthletes.size} athlete
                {assignAthletes.size === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function AddMemberSelect({
  roster,
  onAdd,
}: {
  roster: RosterEntry[];
  onAdd: (athleteId: number) => void;
}) {
  const [value, setValue] = useState("");
  if (roster.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <Select
        value={value}
        onValueChange={(v) => {
          setValue(v);
          onAdd(Number(v));
          setValue("");
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <UserPlus className="h-3.5 w-3.5" />
          <SelectValue placeholder="Add athlete to team" />
        </SelectTrigger>
        <SelectContent>
          {roster.map((r) => (
            <SelectItem key={r.id} value={String(r.id)}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
