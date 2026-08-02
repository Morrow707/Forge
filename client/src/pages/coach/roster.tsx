import { useState } from "react";
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
import { AthleteProfileDialog } from "@/components/athlete-profile-dialog";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { BodyMetricsDialog } from "@/components/body-metrics-dialog";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Send,
  Plus,
  X,
  Search,
  Copy,
  HeartPulse,
  HeartCrack,
  CalendarDays,
  Scale,
} from "lucide-react";

type HealthStatus = "healthy" | "hurt";

type RosterEntry = {
  id: number;
  name: string;
  email: string;
  age?: number | null;
  heightIn?: number | null;
  bodyWeightLbs?: number | null;
  sport?: string | null;
  position?: string | null;
  healthStatus?: HealthStatus;
};
type TeamMember = { athlete: RosterEntry };
type TeamEntry = { id: number; name: string; code: string | null; members: TeamMember[] };
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
  const [assignAthleteIds, setAssignAthleteIds] = useState<number[]>([]);

  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const [rosterSearch, setRosterSearch] = useState("");
  const [profileAthlete, setProfileAthlete] = useState<RosterEntry | null>(null);
  const [calendarAthlete, setCalendarAthlete] = useState<RosterEntry | null>(null);
  const [metricsAthlete, setMetricsAthlete] = useState<RosterEntry | null>(null);

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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredRoster.map((a) => (
                    <Card key={a.id}>
                      <CardContent className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setProfileAthlete(a)}
                              className="truncate text-left font-semibold hover:underline"
                            >
                              {a.name}
                            </button>
                            <HealthStatusToggle athleteId={a.id} status={a.healthStatus ?? "healthy"} />
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                          {(a.sport || a.position) && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {a.sport && <Badge variant="secondary">{a.sport}</Badge>}
                              {a.position && <Badge variant="outline">{a.position}</Badge>}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`View ${a.name}'s body metrics`}
                            title="Body metrics"
                            onClick={() => setMetricsAthlete(a)}
                          >
                            <Scale className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Export ${a.name}'s calendar`}
                            title="Export calendar (.ics)"
                            onClick={() => setCalendarAthlete(a)}
                          >
                            <CalendarDays className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openAssignFor([a.id])}>
                            Assign
                          </Button>
                        </div>
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
                            onClick={() => setProfileAthlete(m.athlete)}
                            className="truncate font-medium hover:underline"
                          >
                            {m.athlete.name}
                          </button>
                          <HealthStatusToggle
                            athleteId={m.athlete.id}
                            status={m.athlete.healthStatus ?? "healthy"}
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

      <AssignProgramDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        roster={roster}
        programs={programs}
        initialAthleteIds={assignAthleteIds}
      />

      <AthleteProfileDialog
        athlete={profileAthlete}
        onOpenChange={(open) => {
          if (!open) setProfileAthlete(null);
        }}
      />

      {calendarAthlete && (
        <CalendarLinkDialog
          open={calendarAthlete !== null}
          onOpenChange={(open) => !open && setCalendarAthlete(null)}
          title={`${calendarAthlete.name}'s Calendar`}
          fetchUrl={`/api/coach/roster/${calendarAthlete.id}/calendar-link`}
        />
      )}

      {metricsAthlete && (
        <BodyMetricsDialog
          open={metricsAthlete !== null}
          onOpenChange={(open) => !open && setMetricsAthlete(null)}
          athleteName={metricsAthlete.name}
          fetchUrl={`/api/coach/roster/${metricsAthlete.id}/body-metrics`}
        />
      )}
    </AppShell>
  );
}

// Coach-only quick-glance status -- never shown to the athlete themselves
// (the backend strips it from any athlete-facing response). Icon + text
// label so the signal isn't color-only.
function HealthStatusToggle({
  athleteId,
  status,
}: {
  athleteId: number;
  status: HealthStatus;
}) {
  const qc = useQueryClient();
  const isHealthy = status === "healthy";

  const mutation = useMutation({
    mutationFn: async (next: HealthStatus) => {
      await apiRequest("PATCH", `/api/coach/roster/${athleteId}/health-status`, {
        healthStatus: next,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update status"),
  });

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        mutation.mutate(isHealthy ? "hurt" : "healthy");
      }}
      disabled={mutation.isPending}
      aria-label={`${isHealthy ? "Healthy" : "Hurt"} -- click to mark ${isHealthy ? "hurt" : "healthy"}`}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
        isHealthy
          ? "bg-success/15 text-success hover:bg-success/25"
          : "bg-destructive/15 text-destructive hover:bg-destructive/25",
      )}
    >
      {isHealthy ? <HeartPulse className="h-3 w-3" /> : <HeartCrack className="h-3 w-3" />}
      {isHealthy ? "Healthy" : "Hurt"}
    </button>
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
