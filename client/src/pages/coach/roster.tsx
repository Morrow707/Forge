import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AssignProgramDialog } from "@/components/assign-program-dialog";
import { CaraCompliancePanel } from "@/components/cara-compliance-panel";
import { TeamChallengesSection } from "@/components/team-challenges-panel";
import { GameDaysSection } from "@/components/game-days-panel";
import {
  HealthStatusToggle,
  WellnessBadge,
  AcwrBadge,
  type HealthStatus,
} from "@/components/athlete-status-badges";
import type { ReadinessLevel } from "@shared/wellness";
import type { AcwrRiskLevel } from "@shared/load";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Users, UserPlus, Send, Plus, X, Search, Copy } from "lucide-react";

type RosterEntry = {
  id: number;
  name: string;
  email: string;
  sport?: string | null;
  position?: string | null;
  healthStatus?: HealthStatus;
};
type TeamMember = { athlete: RosterEntry };
type TeamEntry = { id: number; name: string; code: string | null; members: TeamMember[] };
type ProgramSummary = { id: number; name: string };

export default function CoachRoster() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });
  const { data: teams = [] } = useQuery<TeamEntry[]>({
    queryKey: ["/api/coach/teams"],
  });
  const { data: programs = [] } = useQuery<ProgramSummary[]>({
    queryKey: ["/api/coach/programs"],
  });
  const { data: wellnessToday = [] } = useQuery<
    {
      athleteId: number;
      sleepHours: number;
      soreness: number;
      stress: number;
      score: number;
      level: ReadinessLevel;
    }[]
  >({
    queryKey: ["/api/coach/roster-wellness"],
    refetchInterval: 60_000,
  });
  const wellnessByAthlete = new Map(wellnessToday.map((w) => [w.athleteId, w]));
  const { data: acwrToday = [] } = useQuery<
    { athleteId: number; athleteName: string; ratio: number | null; level: AcwrRiskLevel }[]
  >({
    queryKey: ["/api/coach/roster-acwr"],
    refetchInterval: 60_000,
  });
  const acwrByAthlete = new Map(acwrToday.map((w) => [w.athleteId, w]));

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignAthleteIds, setAssignAthleteIds] = useState<number[]>([]);

  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const [addFreeAgentOpen, setAddFreeAgentOpen] = useState(false);
  const [freeAgentEmail, setFreeAgentEmail] = useState("");

  const [rosterSearch, setRosterSearch] = useState("");

  const filteredRoster = roster.filter((a) => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.sport ?? "").toLowerCase().includes(q) ||
      (a.position ?? "").toLowerCase().includes(q)
    );
  });

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

  const addFreeAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/roster/add-free-agent", {
        email: freeAgentEmail,
      });
      return res.json();
    },
    onSuccess: (result: { athleteName: string }) => {
      setAddFreeAgentOpen(false);
      setFreeAgentEmail("");
      toast.success(`Invite sent to ${result.athleteName} -- they'll show up on your roster once they accept`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not send that invite"),
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

  function openAssignFor(athleteIds: number[]) {
    setAssignAthleteIds(athleteIds);
    setAssignOpen(true);
  }

  return (
    <AppShell
      title="Roster & Teams"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAddFreeAgentOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add Free Agent
          </Button>
          <Button onClick={() => openAssignFor([])}>
            <Send className="h-4 w-4" />
            Assign Program
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster ({roster.length})</TabsTrigger>
          <TabsTrigger value="teams">Teams ({teams.length})</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
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
            <>
              <div className="relative mb-4 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Search athletes by name, sport, position..."
                  className="pl-8"
                  aria-label="Search athletes"
                />
              </div>
              {filteredRoster.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No athletes match "{rosterSearch}".
                </p>
              ) : (
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {filteredRoster.map((a) => (
                    <Card
                      key={a.id}
                      className="cursor-pointer transition-colors hover:border-primary/50"
                      onClick={() => navigate(`/coach/roster/${a.id}`)}
                    >
                      <CardContent className="flex flex-col gap-2 p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-sm font-semibold">{a.name}</span>
                          </div>
                          <HealthStatusToggle athleteId={a.id} status={a.healthStatus ?? "healthy"} />
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">{a.email}</p>
                          {(a.sport || a.position) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {a.sport && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {a.sport}
                                </Badge>
                              )}
                              {a.position && (
                                <Badge variant="outline" className="text-[10px]">
                                  {a.position}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="self-start"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAssignFor([a.id]);
                          }}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Assign
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
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
                        className="flex items-center justify-between gap-2 rounded-md bg-surface-elevated px-3 py-1.5 text-sm"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => navigate(`/coach/roster/${m.athlete.id}`)}
                            className="truncate font-medium hover:underline"
                          >
                            {m.athlete.name}
                          </button>
                          <HealthStatusToggle
                            athleteId={m.athlete.id}
                            status={m.athlete.healthStatus ?? "healthy"}
                          />
                          <WellnessBadge
                            entry={wellnessByAthlete.get(m.athlete.id)}
                            onClick={() => navigate(`/coach/roster/${m.athlete.id}`)}
                          />
                          <AcwrBadge
                            entry={acwrByAthlete.get(m.athlete.id)}
                            onClick={() => navigate(`/coach/roster/${m.athlete.id}`)}
                          />
                          {m.athlete.sport && (
                            <Badge variant="secondary" className="text-[10px]">
                              {m.athlete.sport}
                            </Badge>
                          )}
                          {m.athlete.position && (
                            <Badge variant="outline" className="text-[10px]">
                              {m.athlete.position}
                            </Badge>
                          )}
                        </div>
                        <button
                          aria-label={`Remove ${m.athlete.name} from ${team.name}`}
                          onClick={() =>
                            removeFromTeamMutation.mutate({
                              teamId: team.id,
                              athleteId: m.athlete.id,
                            })
                          }
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {team.code && (
                    <div className="mb-3 flex items-center justify-between rounded-md bg-surface-elevated px-3 py-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                          Team invite code
                        </p>
                        <p className="font-display text-lg font-bold tracking-widest text-primary">
                          {team.code}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Copy ${team.name} invite code`}
                        onClick={() => {
                          navigator.clipboard.writeText(team.code!);
                          toast.success("Team code copied");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <AddMemberSelect
                    roster={roster.filter(
                      (r) => !team.members.some((m) => m.athlete.id === r.id),
                    )}
                    onAdd={(athleteId) => addToTeamMutation.mutate({ teamId: team.id, athleteId })}
                  />
                  <TeamChallengesSection teamId={team.id} teamName={team.name} />
                  <GameDaysSection teamId={team.id} teamName={team.name} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="compliance">
          <CaraCompliancePanel roster={roster} />
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

      <Dialog open={addFreeAgentOpen} onOpenChange={setAddFreeAgentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Free Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Send an existing athlete account an invite by email -- they have to accept it before
            they show up on your roster, and it only works for athletes who aren't already
            coached by someone else.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addFreeAgentMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Athlete's email</Label>
              <Input
                required
                type="email"
                value={freeAgentEmail}
                onChange={(e) => setFreeAgentEmail(e.target.value)}
                placeholder="athlete@example.com"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddFreeAgentOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addFreeAgentMutation.isPending}>
                {addFreeAgentMutation.isPending ? "Sending..." : "Send Invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AssignProgramDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        roster={roster}
        programs={programs}
        initialAthleteIds={assignAthleteIds}
      />
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  if (roster.length === 0) return null;

  const matches = roster.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="relative">
      <div className="relative">
        <UserPlus className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search to add athlete..."
          className="h-8 pl-8 text-xs"
        />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-md">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matching athletes</p>
          ) : (
            matches.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAdd(r.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-surface-elevated"
              >
                {r.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
