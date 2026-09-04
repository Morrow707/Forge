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
import { ManageRosterGroupsDialog } from "@/components/manage-roster-groups-dialog";
import { toggleInSet } from "@/components/filter-chip-group";
import { Skeleton } from "@/components/skeleton";
import { Sparkline } from "@/components/stat-tile";
import {
  HealthStatusToggle,
  WellnessBadge,
  AcwrBadge,
  type HealthStatus,
} from "@/components/athlete-status-badges";
import type { ReadinessLevel } from "@shared/wellness";
import type { AcwrRiskLevel } from "@shared/load";
import { resolveRosterGroups, type RosterGroup } from "@shared/roster-groups";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
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
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  BellRing,
  Tags,
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
  groupId?: string | null;
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

type RosterSortColumn = "name" | "sport" | "position" | "health" | "email";

// Kept in sync with the hook call below -- shared so the indicator's own
// "have we crossed the threshold yet" styling matches what actually
// triggers the refresh.
const PULL_REFRESH_THRESHOLD = 60;

const ROSTER_SORT_COLUMNS: { column: RosterSortColumn; label: string }[] = [
  { column: "name", label: "Name" },
  { column: "sport", label: "Sport" },
  { column: "position", label: "Position" },
  { column: "health", label: "Health" },
  { column: "email", label: "Email" },
];

// Sentinel used for both the group filter chips and the group-select's own
// current value whenever an athlete's groupId is null, or no longer
// matches any group in the coach's current (resolved) list -- e.g. that
// group was since removed. Never sent to the server as a real groupId;
// setGroupMutation translates it back to null.
const UNASSIGNED_GROUP_KEY = "__unassigned__";

// Which chip/select value an athlete currently reads as -- a stale groupId
// (the group it pointed at got deleted) reads exactly like never having
// been assigned one, per coachAthletes.groupId's own comment in
// shared/schema.ts.
function athleteGroupKey(athlete: RosterEntry, groups: RosterGroup[]): string {
  return athlete.groupId && groups.some((g) => g.id === athlete.groupId)
    ? athlete.groupId
    : UNASSIGNED_GROUP_KEY;
}

// String key each column sorts by -- blanks (no sport/position on file)
// always sort to the end regardless of direction, rather than clumping at
// the top on an ascending sort the way an empty string naturally would.
function rosterSortValue(a: RosterEntry, column: RosterSortColumn): string {
  switch (column) {
    case "name":
      return a.name;
    case "sport":
      return a.sport ?? "";
    case "position":
      return a.position ?? "";
    case "health":
      return a.healthStatus ?? "healthy";
    case "email":
      return a.email;
  }
}

export default function CoachRoster() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const {
    data: roster = [],
    isLoading: rosterLoading,
    refetch: refetchRoster,
  } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });
  const { data: teams = [], refetch: refetchTeams } = useQuery<TeamEntry[]>({
    queryKey: ["/api/coach/teams"],
  });
  // Coach-named roster subdivisions (see shared/roster-groups.ts) -- raw
  // stored value comes back null until a coach customizes it, so this page
  // (like ManageRosterGroupsDialog) applies resolveRosterGroups itself
  // rather than ever depending on the server having written the default.
  const { data: rosterGroupsData } = useQuery<{ rosterGroups: RosterGroup[] | null }>({
    queryKey: ["/api/coach/roster-groups"],
  });
  const groups = resolveRosterGroups(rosterGroupsData?.rosterGroups);
  const { data: programs = [], refetch: refetchPrograms } = useQuery<ProgramSummary[]>({
    queryKey: ["/api/coach/programs"],
  });
  const { data: wellnessToday = [], refetch: refetchWellnessToday } = useQuery<
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
  // Roster athletes with no row in wellnessToday -- same "absent means not
  // checked in yet, not a real zero" convention getRosterWellnessToday
  // itself documents -- backs both the "Nudge N athletes" toolbar button's
  // count and its disabled state below.
  const missingWellnessCount = roster.filter((a) => !wellnessByAthlete.has(a.id)).length;
  const { data: acwrToday = [], refetch: refetchAcwrToday } = useQuery<
    { athleteId: number; athleteName: string; ratio: number | null; level: AcwrRiskLevel }[]
  >({
    queryKey: ["/api/coach/roster-acwr"],
    refetchInterval: 60_000,
  });
  const acwrByAthlete = new Map(acwrToday.map((w) => [w.athleteId, w]));
  // Object keyed by athleteId (see the route's comment for why it's not a
  // Map over the wire) of each athlete's last-7-days daily training load --
  // an athlete with nothing logged this week just has no key, so the row
  // renders no sparkline rather than a fabricated flat line.
  const { data: loadTrendByAthlete = {} } = useQuery<Record<string, number[]>>({
    queryKey: ["/api/coach/roster-load-trend"],
    refetchInterval: 60_000,
  });

  // Pull-to-refresh re-fetches every query this page reads from, rather
  // than a single "the" query -- roster/teams/programs/wellness/ACWR all
  // feed the visible tabs.
  const { containerRef, pullDistance, isRefreshing } = usePullToRefresh(
    async () => {
      await Promise.all([
        refetchRoster(),
        refetchTeams(),
        refetchPrograms(),
        refetchWellnessToday(),
        refetchAcwrToday(),
      ]);
    },
    { threshold: PULL_REFRESH_THRESHOLD },
  );

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
  // Multi-select, same "none active means all" convention as
  // FilterChipGroup -- keyed by group id, or UNASSIGNED_GROUP_KEY for the
  // "no group" chip.
  const [groupFilter, setGroupFilter] = useState<Set<string>>(new Set());
  const [manageGroupsOpen, setManageGroupsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"roster" | "teams" | "compliance">("roster");

  // Bulk selection on the Roster grid -- Assign Program, Add to Team, and
  // CSV export all work off this set. Off by default so the grid stays a
  // plain click-to-open-profile list until a coach actually wants to act on
  // more than one athlete at once.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAddTeamId, setBulkAddTeamId] = useState("");

  // Roster table sort -- client-side over whatever's already in `roster`
  // (no separate API param; the whole roster is fetched up front already).
  // Defaults to Name ascending so the list has a stable, predictable order
  // before a coach ever taps a header.
  const [sortColumn, setSortColumn] = useState<RosterSortColumn>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(column: RosterSortColumn) {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir("asc");
    }
  }

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
    if (groupFilter.size > 0 && !groupFilter.has(athleteGroupKey(a, groups))) return false;
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.sport ?? "").toLowerCase().includes(q) ||
      (a.position ?? "").toLowerCase().includes(q)
    );
  });

  const sortedRoster = [...filteredRoster].sort((a, b) => {
    const av = rosterSortValue(a, sortColumn);
    const bv = rosterSortValue(b, sortColumn);
    if (av === "" && bv !== "") return 1;
    if (bv === "" && av !== "") return -1;
    const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
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

  // One-click bulk nudge -- pings every roster athlete missing today's
  // wellness check-in (see missingWellnessCount above) via the server's own
  // roster/wellness join, so this always matches what the toolbar button's
  // count shows a coach right before they click it.
  const nudgeWellnessMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/roster/nudge-wellness");
      return res.json() as Promise<{ nudged: number }>;
    },
    onSuccess: ({ nudged }) => {
      toast.success(
        nudged > 0
          ? `Nudged ${nudged} athlete${nudged === 1 ? "" : "s"} to check in`
          : "Everyone's already checked in today",
      );
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send nudges"),
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
      await apiRequest("POST", `/api/coach/teams/${teamId}/members/bulk`, { athleteIds });
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

  // One mutation shared by every row's group <Select>, rather than one
  // useMutation per row -- same "define once in the parent, call from the
  // map" shape as moveToTeamMutation/addToTeamMutation above.
  const setGroupMutation = useMutation({
    mutationFn: async ({ athleteId, groupId }: { athleteId: number; groupId: string | null }) => {
      await apiRequest("PATCH", `/api/coach/roster/${athleteId}/group`, { groupId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update group"),
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
                  onClick={() => exportRosterCsv(selectedIds.size > 0 ? sortedRoster.filter((a) => selectedIds.has(a.id)) : sortedRoster)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
                {missingWellnessCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={nudgeWellnessMutation.isPending}
                    onClick={() => nudgeWellnessMutation.mutate()}
                  >
                    <BellRing className="h-3.5 w-3.5" />
                    {nudgeWellnessMutation.isPending
                      ? "Nudging..."
                      : `Nudge ${missingWellnessCount} athlete${missingWellnessCount === 1 ? "" : "s"}`}
                  </Button>
                )}
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
        <div ref={containerRef} className="relative">
        {/* Grows from 0 as the user pulls down from the top of the list --
            purely visual, so it's hidden from screen readers; the refetch
            itself is announced however the query's own consumers already
            surface loading/error state. */}
        <div
          aria-hidden="true"
          className="flex items-center justify-center overflow-hidden transition-[height] duration-150 ease-out"
          style={{ height: pullDistance }}
        >
          {isRefreshing ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <ChevronDown
              className={cn(
                "h-5 w-5 transition-transform duration-150",
                pullDistance >= PULL_REFRESH_THRESHOLD ? "text-primary" : "text-muted-foreground",
              )}
              style={{
                transform: `rotate(${Math.min(1, pullDistance / PULL_REFRESH_THRESHOLD) * 180}deg)`,
              }}
            />
          )}
        </div>

        <TabsContent value="roster">
          <div className="mb-4">
            <ProvisionalRosterPanel />
          </div>
          {rosterLoading ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <RosterRowSkeleton key={i} showCheckbox={selectMode} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : roster.length === 0 ? (
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGroupFilter(new Set())}
                    aria-pressed={groupFilter.size === 0}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                      groupFilter.size === 0
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All groups
                  </button>
                  {groups.map((g) => {
                    const active = groupFilter.has(g.id);
                    const count = roster.filter((a) => athleteGroupKey(a, groups) === g.id).length;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleInSet(setGroupFilter, g.id)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {g.label} ({count})
                      </button>
                    );
                  })}
                  {(() => {
                    const unassignedCount = roster.filter(
                      (a) => athleteGroupKey(a, groups) === UNASSIGNED_GROUP_KEY,
                    ).length;
                    if (unassignedCount === 0) return null;
                    const active = groupFilter.has(UNASSIGNED_GROUP_KEY);
                    return (
                      <button
                        type="button"
                        onClick={() => toggleInSet(setGroupFilter, UNASSIGNED_GROUP_KEY)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Unassigned ({unassignedCount})
                      </button>
                    );
                  })()}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setManageGroupsOpen(true)}>
                  <Tags className="h-3.5 w-3.5" />
                  Manage groups
                </Button>
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
                    onClick={() => setSelectedIds(new Set(sortedRoster.map((a) => a.id)))}
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
                  {rosterSearch
                    ? `No athletes match "${rosterSearch}".`
                    : healthFilter !== "all"
                      ? `No ${healthFilter} athletes match your filters.`
                      : "No athletes match your filters."}
                </p>
              ) : (
                // Wrapped in its own overflow-x-auto container (per AppShell's
                // "wide content scrolls inside itself" convention) rather than
                // ever growing the page past the viewport width on a narrow
                // phone -- the table itself has a min-width so columns don't
                // crush down to unreadable slivers.
                //
                // The header row's `<th>` cells are individually sticky
                // (matching the sticky-left-column idiom already used in
                // game-days-panel.tsx) rather than the `<tr>` itself, for the
                // same cross-browser-safe reason. Their `top` reads the
                // --app-shell-sticky-height custom property AppShell publishes
                // for exactly this purpose (see app-shell.tsx) -- the page
                // itself scrolls here (roster doesn't opt into AppShell's
                // fitScreen), and that variable tracks AppShell's own sticky
                // brand/title/tabs bar's *real* rendered height live, so this
                // header always lands directly below it instead of overlapping
                // it or leaving a gap, however tall that bar happens to be at
                // the moment (title/actions wrapped on mobile, the mobile nav
                // panel open, a coach's branding logo, etc.).
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr>
                        {selectMode && (
                          <th
                            scope="col"
                            className="sticky z-10 w-10 border-b border-white/10 bg-card/85 px-3 py-2 shadow-[0_1px_0_0_rgba(255,255,255,0.06),0_8px_20px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150"
                            style={{ top: "var(--app-shell-sticky-height, 0px)" }}
                          />
                        )}
                        {ROSTER_SORT_COLUMNS.map(({ column, label }) => {
                          const active = sortColumn === column;
                          return (
                            <th
                              key={column}
                              scope="col"
                              className="sticky z-10 border-b border-white/10 bg-card/85 px-3 py-2 shadow-[0_1px_0_0_rgba(255,255,255,0.06),0_8px_20px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150"
                              style={{ top: "var(--app-shell-sticky-height, 0px)" }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleSort(column)}
                                className={cn(
                                  "label-xs flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
                                  active && "text-foreground",
                                )}
                                aria-label={`Sort by ${label}${active ? `, currently ${sortDir === "asc" ? "ascending" : "descending"}` : ""}`}
                              >
                                {label}
                                {active ? (
                                  sortDir === "asc" ? (
                                    <ChevronUp className="h-3 w-3" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" />
                                  )
                                ) : (
                                  <ChevronsUpDown className="h-3 w-3 opacity-40" />
                                )}
                              </button>
                            </th>
                          );
                        })}
                        <th
                          scope="col"
                          className="sticky z-10 border-b border-white/10 bg-card/85 px-3 py-2 shadow-[0_1px_0_0_rgba(255,255,255,0.06),0_8px_20px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150"
                          style={{ top: "var(--app-shell-sticky-height, 0px)" }}
                        >
                          <span className="label-xs">Group</span>
                        </th>
                        <th
                          scope="col"
                          className="sticky z-10 border-b border-white/10 bg-card/85 px-3 py-2 shadow-[0_1px_0_0_rgba(255,255,255,0.06),0_8px_20px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150"
                          style={{ top: "var(--app-shell-sticky-height, 0px)" }}
                        >
                          <span className="label-xs">7-Day Load</span>
                        </th>
                        <th
                          scope="col"
                          className="sticky z-10 border-b border-white/10 bg-card/85 px-3 py-2 text-right shadow-[0_1px_0_0_rgba(255,255,255,0.06),0_8px_20px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150"
                          style={{ top: "var(--app-shell-sticky-height, 0px)" }}
                        >
                          <span className="label-xs">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRoster.map((a) => {
                        const isSelected = selectedIds.has(a.id);
                        return (
                          <tr
                            key={a.id}
                            onClick={() =>
                              selectMode ? toggleSelected(a.id) : navigate(`/coach/roster/${a.id}`)
                            }
                            className={cn(
                              "cursor-pointer border-b border-border/50 transition-colors",
                              isSelected ? "bg-primary/5" : "hover:bg-surface-elevated",
                            )}
                          >
                            {selectMode && (
                              <td className="px-3 py-2">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelected(a.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Select ${a.name}`}
                                />
                              </td>
                            )}
                            <td className="max-w-[220px] truncate px-3 py-2 font-semibold">{a.name}</td>
                            <td className="px-3 py-2">
                              {a.sport ? (
                                <Badge variant="secondary" className="whitespace-nowrap text-[10px]">
                                  {a.sport}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {a.position ? (
                                <Badge variant="outline" className="whitespace-nowrap text-[10px]">
                                  {a.position}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <HealthStatusToggle athleteId={a.id} status={a.healthStatus ?? "healthy"} />
                            </td>
                            <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">
                              {a.email}
                            </td>
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={athleteGroupKey(a, groups)}
                                onValueChange={(next) =>
                                  setGroupMutation.mutate({
                                    athleteId: a.id,
                                    groupId: next === UNASSIGNED_GROUP_KEY ? null : next,
                                  })
                                }
                              >
                                <SelectTrigger
                                  className="h-7 w-32 text-xs"
                                  aria-label={`Set ${a.name}'s group`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={UNASSIGNED_GROUP_KEY}>Unassigned</SelectItem>
                                  {groups.map((g) => (
                                    <SelectItem key={g.id} value={g.id}>
                                      {g.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              {loadTrendByAthlete[a.id] ? (
                                <Sparkline values={loadTrendByAthlete[a.id]} />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {!selectMode && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAssignFor([a.id]);
                                  }}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                  Assign
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
        </div>

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

      <ManageRosterGroupsDialog open={manageGroupsOpen} onOpenChange={setManageGroupsOpen} />

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

/** Placeholder for one roster table row while `/api/coach/roster` is still
 * in flight -- shaped to the real row's columns (name/sport/position/
 * health/email/group/load-trend/actions) so the table doesn't jump around
 * once real rows swap in. Takes showCheckbox rather than reading selectMode
 * itself so it matches whichever mode the page is already in the instant
 * data arrives. */
function RosterRowSkeleton({ showCheckbox }: { showCheckbox: boolean }) {
  return (
    <tr className="border-b border-border/50">
      {showCheckbox && (
        <td className="px-3 py-2">
          <Skeleton className="h-4 w-4 rounded" />
        </td>
      )}
      <td className="px-3 py-2">
        <Skeleton className="h-4 w-28" />
      </td>
      <td className="px-3 py-2">
        <Skeleton className="h-4 w-14 rounded-full" />
      </td>
      <td className="px-3 py-2">
        <Skeleton className="h-4 w-14 rounded-full" />
      </td>
      <td className="px-3 py-2">
        <Skeleton className="h-4 w-16 rounded-full" />
      </td>
      <td className="px-3 py-2">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="px-3 py-2">
        <Skeleton className="h-7 w-32 rounded-md" />
      </td>
      <td className="px-3 py-2">
        <Skeleton className="h-5 w-14" />
      </td>
      <td className="px-3 py-2 text-right">
        <Skeleton className="ml-auto h-7 w-16 rounded-md" />
      </td>
    </tr>
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
