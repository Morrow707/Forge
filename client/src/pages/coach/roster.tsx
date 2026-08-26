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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CaraCompliancePanel } from "@/components/cara-compliance-panel";
import { TeamChallengesSection } from "@/components/team-challenges-panel";
import { GameDaysSection } from "@/components/game-days-panel";
import { TeamBrandingDialog } from "@/components/team-branding-dialog";
import { TestingDayImportDialog } from "@/components/testing-day-import-dialog";
import { WeighInImportDialog } from "@/components/weigh-in-import-dialog";
import { NutritionSheetImportDialog } from "@/components/nutrition-sheet-import-dialog";
import { InjuryIntakeImportDialog } from "@/components/injury-intake-import-dialog";
import { TestingDataImportDialog } from "@/components/testing-data-import-dialog";
import { PlayerIntakeImportDialog } from "@/components/player-intake-import-dialog";
import { ProvisionalRosterPanel } from "@/components/provisional-roster-panel";
import {
  HealthStatusToggle,
  WellnessBadge,
  AcwrBadge,
  type HealthStatus,
} from "@/components/athlete-status-badges";
import type { ReadinessLevel } from "@shared/wellness";
import type { AcwrRiskLevel } from "@shared/load";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toCsv } from "@/lib/csv";
import { shareOrDownloadBlob } from "@/lib/share-file";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  Camera,
  ClipboardList,
  Scale,
  Apple,
  Stethoscope,
  Gauge,
  UserPlus2,
  Palette,
  Download,
  CheckSquare,
  ArrowRightLeft,
} from "lucide-react";

type PhotoImportKind = "testing-day" | "weigh-in" | "nutrition" | "injury" | "testing-data" | "player-intake";

const PHOTO_IMPORT_OPTIONS: { kind: PhotoImportKind; label: string; description: string; icon: typeof Camera }[] = [
  {
    kind: "testing-day",
    label: "Testing Day Results",
    description: "40yd, vertical, broad jump, bench/squat/deadlift maxes",
    icon: ClipboardList,
  },
  { kind: "weigh-in", label: "Weigh-In Sheet", description: "Team body weights, all at once", icon: Scale },
  { kind: "nutrition", label: "Nutrition Sheet", description: "Macro/target sheet from a coach or RD", icon: Apple },
  {
    kind: "injury",
    label: "Injury History Intake",
    description: "Pre-participation physical / injury form",
    icon: Stethoscope,
  },
  {
    kind: "testing-data",
    label: "OVR / Perch Printout",
    description: "Velocity-based training device output",
    icon: Gauge,
  },
  {
    kind: "player-intake",
    label: "Player Intake Sheet",
    description: "New tryout/sign-up sheet -- creates claim codes",
    icon: UserPlus2,
  },
];

type RosterEntry = {
  id: number;
  name: string;
  email: string;
  sport?: string | null;
  position?: string | null;
  healthStatus?: HealthStatus;
};
type TeamMember = { athlete: RosterEntry };
type TeamEntry = {
  id: number;
  name: string;
  code: string | null;
  members: TeamMember[];
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
};
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
  const [brandingTeamId, setBrandingTeamId] = useState<number | null>(null);
  const [newTeamName, setNewTeamName] = useState("");

  const [addFreeAgentOpen, setAddFreeAgentOpen] = useState(false);
  const [freeAgentEmail, setFreeAgentEmail] = useState("");

  // Which photo-import dialog is open, if any -- one launcher picker
  // instead of six separate toolbar buttons. See PHOTO_IMPORT_OPTIONS
  // below the component for the picker's own list.
  const [photoImportPickerOpen, setPhotoImportPickerOpen] = useState(false);
  const [activePhotoImport, setActivePhotoImport] = useState<PhotoImportKind | null>(null);

  const [rosterSearch, setRosterSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<"all" | HealthStatus>("all");
  const [activeTab, setActiveTab] = useState<"roster" | "teams" | "compliance">("roster");

  // Bulk selection on the Roster grid -- Assign Program, Add to Team, and
  // CSV export all work off this set. Off by default so the grid stays a
  // plain click-to-open-profile list until a coach actually wants to act on
  // more than one athlete at once.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAddTeamId, setBulkAddTeamId] = useState("");

  function toggleSelected(athleteId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) next.delete(athleteId);
      else next.add(athleteId);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkAddTeamId("");
  }

  const healthyCount = roster.filter((a) => (a.healthStatus ?? "healthy") === "healthy").length;
  const hurtCount = roster.filter((a) => a.healthStatus === "hurt").length;

  const filteredRoster = roster.filter((a) => {
    if (healthFilter !== "all" && (a.healthStatus ?? "healthy") !== healthFilter) return false;
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

  const bulkAddToTeamMutation = useMutation({
    mutationFn: async ({ teamId, athleteIds }: { teamId: number; athleteIds: number[] }) => {
      await Promise.all(
        athleteIds.map((athleteId) =>
          apiRequest("POST", `/api/coach/teams/${teamId}/members`, { athleteId }),
        ),
      );
    },
    onSuccess: (_, { athleteIds }) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      toast.success(`Added ${athleteIds.length} athlete${athleteIds.length === 1 ? "" : "s"} to team`);
      exitSelectMode();
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't add everyone to that team"),
  });

  // Moves one athlete from their current team straight to another --
  // distinct from add/remove, which each only touch one side of the
  // membership. teamMembers has no exclusivity constraint (an athlete can
  // technically be on more than one team), but "move" is still the common
  // real request: swap a kid from JV to Varsity in one action instead of
  // two separate roster edits that could be left half-done.
  const moveToTeamMutation = useMutation({
    mutationFn: async ({
      fromTeamId,
      toTeamId,
      athleteId,
    }: {
      fromTeamId: number;
      toTeamId: number;
      athleteId: number;
    }) => {
      await apiRequest("POST", `/api/coach/teams/${toTeamId}/members`, { athleteId });
      await apiRequest("DELETE", `/api/coach/teams/${fromTeamId}/members/${athleteId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      toast.success("Moved to new team");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't move that athlete"),
  });

  function exportRosterCsv(rows: RosterEntry[]) {
    const csv = toCsv(
      ["Name", "Email", "Sport", "Position", "Health Status"],
      rows.map((a) => [a.name, a.email, a.sport ?? "", a.position ?? "", a.healthStatus ?? "healthy"]),
    );
    const blob = new Blob([csv], { type: "text/csv" });
    shareOrDownloadBlob(blob, "roster.csv", "Roster Export");
  }

  const removeFromTeamMutation = useMutation({
    mutationFn: async ({ teamId, athleteId }: { teamId: number; athleteId: number }) => {
      await apiRequest("DELETE", `/api/coach/teams/${teamId}/members/${athleteId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      setRemoveTarget(null);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't remove that athlete"),
  });
  const [removeTarget, setRemoveTarget] = useState<{
    teamId: number;
    teamName: string;
    athleteId: number;
    athleteName: string;
  } | null>(null);

  function openAssignFor(athleteIds: number[]) {
    setAssignAthleteIds(athleteIds);
    setAssignOpen(true);
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
      <AppShell
        title="Roster & Teams"
        actions={
          <div className="flex flex-wrap gap-2">
            {activeTab === "roster" && roster.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant={selectMode ? "default" : "outline"}
                  onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {selectMode ? "Cancel Select" : "Select"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportRosterCsv(selectedIds.size > 0 ? filteredRoster.filter((a) => selectedIds.has(a.id)) : filteredRoster)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => setAddFreeAgentOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Add Free Agent
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPhotoImportPickerOpen(true)}>
              <Camera className="h-3.5 w-3.5" />
              Import Photo
            </Button>
            <Button size="sm" onClick={() => openAssignFor([])}>
              <Send className="h-3.5 w-3.5" />
              Assign Program
            </Button>
          </div>
        }
        subheader={
          <div className="flex flex-wrap items-center gap-2">
            <TabsList>
              <TabsTrigger value="roster">Roster ({roster.length})</TabsTrigger>
              <TabsTrigger value="teams">Teams ({teams.length})</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
            </TabsList>
            {activeTab === "roster" && roster.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setHealthFilter("all")}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                    healthFilter === "all"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  All ({roster.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHealthFilter("healthy")}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                    healthFilter === "healthy"
                      ? "border-success bg-success/10 text-success"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <HeartPulse className="h-3 w-3" />
                  Healthy ({healthyCount})
                </button>
                <button
                  type="button"
                  onClick={() => setHealthFilter("hurt")}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                    healthFilter === "hurt"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <HeartCrack className="h-3 w-3" />
                  Hurt ({hurtCount})
                </button>
              </div>
            )}
          </div>
        }
      >
        <TabsContent value="roster">
          <div className="mb-4">
            <ProvisionalRosterPanel />
          </div>
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
              {selectMode && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {selectedIds.size} selected
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedIds.size === 0}
                    onClick={() => openAssignFor(Array.from(selectedIds))}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Assign Program
                  </Button>
                  <div className="flex items-center gap-1.5">
                    <Select value={bulkAddTeamId} onValueChange={setBulkAddTeamId}>
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue placeholder="Add to team..." />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={selectedIds.size === 0 || !bulkAddTeamId || bulkAddToTeamMutation.isPending}
                      onClick={() =>
                        bulkAddToTeamMutation.mutate({
                          teamId: Number(bulkAddTeamId),
                          athleteIds: Array.from(selectedIds),
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedIds(new Set(filteredRoster.map((a) => a.id)))}
                  >
                    Select all ({filteredRoster.length})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={exitSelectMode}>
                    Done
                  </Button>
                </div>
              )}
              {filteredRoster.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {healthFilter === "all"
                    ? `No athletes match "${rosterSearch}".`
                    : `No ${healthFilter} athletes match your search.`}
                </p>
              ) : (
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {filteredRoster.map((a) => {
                    const isSelected = selectedIds.has(a.id);
                    return (
                    <Card
                      key={a.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:border-primary/50",
                        isSelected && "border-primary bg-primary/5",
                      )}
                      onClick={() =>
                        selectMode ? toggleSelected(a.id) : navigate(`/coach/roster/${a.id}`)
                      }
                    >
                      <CardContent className="flex flex-col gap-2 p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {selectMode && (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelected(a.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select ${a.name}`}
                              />
                            )}
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
                        {!selectMode && (
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
                        )}
                      </CardContent>
                    </Card>
                    );
                  })}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {teams.map((team) => {
              const teamHurtCount = team.members.filter(
                (m) => m.athlete.healthStatus === "hurt",
              ).length;
              const teamHealthyCount = team.members.length - teamHurtCount;
              return (
              <Card key={team.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {team.brandLogoUrl && (
                        <img
                          src={team.brandLogoUrl}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded object-contain"
                        />
                      )}
                      <CardTitle className="truncate">{team.name}</CardTitle>
                      {(team.brandPrimaryColor || team.brandSecondaryColor) && (
                        <span
                          title="This team has its own branding override"
                          className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-border"
                          style={{ backgroundColor: team.brandPrimaryColor || team.brandSecondaryColor! }}
                        />
                      )}
                    </div>
                    {team.members.length > 0 && (
                      <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 text-success">
                          <HeartPulse className="h-3 w-3" />
                          {teamHealthyCount}
                        </span>
                        <span className="flex items-center gap-1 text-destructive">
                          <HeartCrack className="h-3 w-3" />
                          {teamHurtCount}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Edit ${team.name}'s branding`}
                      onClick={() => setBrandingTeamId(team.id)}
                    >
                      <Palette className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openAssignFor(team.members.map((m) => m.athlete.id))}
                      disabled={team.members.length === 0}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Assign to Team
                    </Button>
                  </div>
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
                        {teams.length > 1 && (
                          <Select
                            value=""
                            onValueChange={(toTeamId) =>
                              moveToTeamMutation.mutate({
                                fromTeamId: team.id,
                                toTeamId: Number(toTeamId),
                                athleteId: m.athlete.id,
                              })
                            }
                          >
                            <SelectTrigger
                              className="h-7 w-28 shrink-0 gap-1 px-2 text-[11px]"
                              aria-label={`Move ${m.athlete.name} to another team`}
                            >
                              <ArrowRightLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <SelectValue placeholder="Move to..." />
                            </SelectTrigger>
                            <SelectContent>
                              {teams
                                .filter((t) => t.id !== team.id)
                                .map((t) => (
                                  <SelectItem key={t.id} value={String(t.id)}>
                                    {t.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${m.athlete.name} from ${team.name}`}
                          onClick={() =>
                            setRemoveTarget({
                              teamId: team.id,
                              teamName: team.name,
                              athleteId: m.athlete.id,
                              athleteName: m.athlete.name,
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
                        <p className="label-xs">
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
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="compliance">
          <CaraCompliancePanel roster={roster} />
        </TabsContent>

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

      {brandingTeamId !== null &&
        (() => {
          const liveTeam = teams.find((t) => t.id === brandingTeamId);
          if (!liveTeam) return null;
          return (
            <TeamBrandingDialog
              open
              onOpenChange={(open) => !open && setBrandingTeamId(null)}
              scope={{
                type: "team",
                teamId: liveTeam.id,
                teamName: liveTeam.name,
                initial: {
                  brandLogoUrl: liveTeam.brandLogoUrl,
                  brandPrimaryColor: liveTeam.brandPrimaryColor,
                  brandSecondaryColor: liveTeam.brandSecondaryColor,
                },
              }}
            />
          );
        })()}

      <Dialog open={photoImportPickerOpen} onOpenChange={setPhotoImportPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {PHOTO_IMPORT_OPTIONS.map(({ kind, label, description, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setPhotoImportPickerOpen(false);
                  setActivePhotoImport(kind);
                }}
                className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left hover:border-primary"
              >
                <Icon className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <TestingDayImportDialog
        open={activePhotoImport === "testing-day"}
        onOpenChange={(o) => setActivePhotoImport(o ? "testing-day" : null)}
        roster={roster}
      />
      <WeighInImportDialog
        open={activePhotoImport === "weigh-in"}
        onOpenChange={(o) => setActivePhotoImport(o ? "weigh-in" : null)}
        roster={roster}
      />
      <NutritionSheetImportDialog
        open={activePhotoImport === "nutrition"}
        onOpenChange={(o) => setActivePhotoImport(o ? "nutrition" : null)}
        roster={roster}
      />
      <InjuryIntakeImportDialog
        open={activePhotoImport === "injury"}
        onOpenChange={(o) => setActivePhotoImport(o ? "injury" : null)}
        roster={roster}
      />
      <TestingDataImportDialog
        open={activePhotoImport === "testing-data"}
        onOpenChange={(o) => setActivePhotoImport(o ? "testing-data" : null)}
        roster={roster}
      />
      <PlayerIntakeImportDialog
        open={activePhotoImport === "player-intake"}
        onOpenChange={(o) => setActivePhotoImport(o ? "player-intake" : null)}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remove from team?"
        description={
          removeTarget
            ? `${removeTarget.athleteName} will be removed from ${removeTarget.teamName}. They'll stay on your overall roster.`
            : ""
        }
        confirmLabel="Remove"
        isPending={removeFromTeamMutation.isPending}
        onConfirm={() => removeTarget && removeFromTeamMutation.mutate(removeTarget)}
      />
      </AppShell>
    </Tabs>
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
