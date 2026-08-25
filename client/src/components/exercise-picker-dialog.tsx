import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Dumbbell, Stethoscope, Sparkles, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/queryClient";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import type { ExerciseWithOwnership as Exercise } from "@/lib/exercise-types";
import {
  MOVEMENT_TYPES,
  MUSCLE_GROUPS,
  SPORTS,
  BODY_REGIONS,
  PLANES,
  MOVEMENT_COMPLEXITIES,
} from "@shared/exercise-taxonomy";
import {
  EXERCISE_FAMILIES,
  EQUIPMENT_ORDER,
  getExerciseFamily,
  type ExerciseFamily,
} from "@shared/exercise-family";
import { FilterChipGroup, toggleInSet } from "@/components/filter-chip-group";
import {
  CATEGORY_FILTER_ACTIVE_CLASS,
  MOVEMENT_FILTER_ACTIVE_CLASS,
  LATERALITY_FILTER_ACTIVE_CLASS,
  MUSCLE_FILTER_ACTIVE_CLASS,
  SPORT_FILTER_ACTIVE_CLASS,
  OWNER_FILTER_ACTIVE_CLASS,
  BODY_REGION_FILTER_ACTIVE_CLASS,
  PLANE_FILTER_ACTIVE_CLASS,
  MOVEMENT_COMPLEXITY_FILTER_ACTIVE_CLASS,
  FAMILY_FILTER_ACTIVE_CLASS,
  EQUIPMENT_FILTER_ACTIVE_CLASS,
} from "@/lib/exercise-colors";

const CATEGORIES = ["strength", "conditioning", "olympic", "accessory", "mobility", "plyometric"];

type AiSearchResult = {
  family: string | null;
  equipment: string | null;
  movementType: string | null;
  searchText: string | null;
};

export function ExercisePickerDialog({
  open,
  onOpenChange,
  onSelect,
  correctivesOnly = false,
  title,
  apiBase = "/api/coach",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (exercise: Exercise) => void;
  correctivesOnly?: boolean;
  title?: string;
  apiBase?: string;
}) {
  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: [`${apiBase}/exercises`],
    enabled: open,
  });
  const [search, setSearch] = useState("");
  // Accordion state -- see shared/exercise-family.ts. activeFamily/
  // equipmentFilter drive both the visible buttons AND the actual filtering
  // (search only hides the buttons, it never disables the filters
  // underneath -- see the search-input comment below).
  const [activeFamily, setActiveFamily] = useState<ExerciseFamily | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<Set<string>>(new Set());
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [movementFilter, setMovementFilter] = useState<Set<string>>(new Set());
  const [muscleGroupFilter, setMuscleGroupFilter] = useState<Set<string>>(new Set());
  const [lateralityFilter, setLateralityFilter] = useState<Set<string>>(new Set());
  const [bodyRegionFilter, setBodyRegionFilter] = useState<Set<string>>(new Set());
  const [planeFilter, setPlaneFilter] = useState<Set<string>>(new Set());
  const [complexityFilter, setComplexityFilter] = useState<Set<string>>(new Set());
  const [sportFilter, setSportFilter] = useState<Set<string>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(new Set());
  const [onlyCorrectives, setOnlyCorrectives] = useState(correctivesOnly);

  useEffect(() => {
    if (open) setOnlyCorrectives(correctivesOnly);
  }, [open, correctivesOnly]);

  // Clicking the active family again clears back to a fresh state (see the
  // accordion's own toggle-to-reset spec); clicking a different family
  // discards whatever equipment was selected under the previous one, since
  // that selection was scoped to a family that's no longer open.
  function handleFamilyClick(family: ExerciseFamily) {
    if (activeFamily === family) {
      setActiveFamily(null);
      setEquipmentFilter(new Set());
    } else {
      setActiveFamily(family);
      setEquipmentFilter(new Set());
    }
  }

  const bodyParts = useMemo(
    () =>
      Array.from(new Set([...MUSCLE_GROUPS, ...exercises.map((e) => e.muscleGroup)])).sort(),
    [exercises],
  );
  const sportOptions = useMemo(
    () =>
      Array.from(new Set([...SPORTS, ...exercises.flatMap((e) => e.sports ?? [])])).sort(),
    [exercises],
  );
  // Only ever "FORGE" or a coach's initials (see ownerLabel in storage.ts) --
  // a coach's exercise bank can't contain anyone else's exercises, so this
  // list is naturally short even with an assistant-coach staff sharing one
  // roster.
  const ownerOptions = useMemo(
    () => Array.from(new Set(exercises.map((e) => e.ownerLabel))).sort(),
    [exercises],
  );

  // Counts shown on the family/equipment buttons -- the whole point of the
  // accordion is showing a coach how much a tap will narrow things down
  // before they commit to it, not just after.
  const familyCounts = useMemo(() => {
    const counts = new Map<ExerciseFamily, number>();
    for (const ex of exercises) {
      const family = getExerciseFamily(ex);
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    return counts;
  }, [exercises]);
  const equipmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const scoped = activeFamily
      ? exercises.filter((ex) => getExerciseFamily(ex) === activeFamily)
      : exercises;
    for (const ex of scoped) {
      counts.set(ex.equipment, (counts.get(ex.equipment) ?? 0) + 1);
    }
    return counts;
  }, [exercises, activeFamily]);

  const filtered = useMemo(
    () =>
      exercises.filter((ex) => {
        const matchesSearch =
          !search ||
          ex.name.toLowerCase().includes(search.toLowerCase()) ||
          ex.muscleGroup.toLowerCase().includes(search.toLowerCase()) ||
          ex.equipment.toLowerCase().includes(search.toLowerCase()) ||
          (ex.sports ?? []).some((s) => s.toLowerCase().includes(search.toLowerCase()));
        const matchesFamily = !activeFamily || getExerciseFamily(ex) === activeFamily;
        const matchesEquipment = equipmentFilter.size === 0 || equipmentFilter.has(ex.equipment);
        const matchesCategory = categoryFilter.size === 0 || categoryFilter.has(ex.category);
        const matchesMovement =
          movementFilter.size === 0 ||
          (ex.movementType != null && movementFilter.has(ex.movementType));
        const matchesMuscleGroup =
          muscleGroupFilter.size === 0 || muscleGroupFilter.has(ex.muscleGroup);
        const matchesLaterality =
          lateralityFilter.size === 0 ||
          (ex.laterality != null && lateralityFilter.has(ex.laterality));
        const matchesBodyRegion =
          bodyRegionFilter.size === 0 ||
          (ex.bodyRegion != null && bodyRegionFilter.has(ex.bodyRegion));
        const matchesPlane =
          planeFilter.size === 0 || (ex.plane != null && planeFilter.has(ex.plane));
        const matchesComplexity =
          complexityFilter.size === 0 ||
          (ex.movementComplexity != null && complexityFilter.has(ex.movementComplexity));
        const matchesSport =
          sportFilter.size === 0 || (ex.sports ?? []).some((s) => sportFilter.has(s));
        const matchesOwner = ownerFilter.size === 0 || ownerFilter.has(ex.ownerLabel);
        const matchesCorrective = !onlyCorrectives || ex.isCorrective;
        return (
          matchesSearch &&
          matchesFamily &&
          matchesEquipment &&
          matchesCategory &&
          matchesMovement &&
          matchesMuscleGroup &&
          matchesLaterality &&
          matchesBodyRegion &&
          matchesPlane &&
          matchesComplexity &&
          matchesSport &&
          matchesOwner &&
          matchesCorrective
        );
      }),
    [
      exercises,
      search,
      activeFamily,
      equipmentFilter,
      categoryFilter,
      movementFilter,
      muscleGroupFilter,
      lateralityFilter,
      bodyRegionFilter,
      planeFilter,
      complexityFilter,
      sportFilter,
      ownerFilter,
      onlyCorrectives,
    ],
  );

  // Natural-language front door to the same accordion filters -- see
  // storage.interpretExerciseSearchQuery's own comment server-side. Applies
  // whatever criteria come back as real filter state (not just search text),
  // so "something for hip mobility with a band" actually presses the Mobility
  // & Activation + Band buttons rather than doing a plain substring match.
  const aiSearchMutation = useMutation({
    mutationFn: async (query: string) => {
      const res = await apiRequest("POST", `${apiBase}/exercises/ai-search`, { query });
      return (await res.json()) as AiSearchResult;
    },
    onSuccess: (result) => {
      const family = (EXERCISE_FAMILIES as readonly string[]).includes(result.family ?? "")
        ? (result.family as ExerciseFamily)
        : null;
      setActiveFamily(family);
      setEquipmentFilter(result.equipment ? new Set([result.equipment]) : new Set());
      setMovementFilter(result.movementType ? new Set([result.movementType]) : new Set());
      // Leaving the box populated with only the AI's leftover text fallback
      // (not the original spoken-language query) keeps the visible search
      // narrow and meaningful instead of re-running a literal "something for
      // hip mobility with a band" substring match against exercise names.
      setSearch(result.searchText ?? "");
      if (!family && !result.equipment && !result.movementType && !result.searchText) {
        toast.info("Couldn't narrow that down -- try the filters below instead.");
      }
    },
    onError: () => toast.error("Couldn't interpret that search -- try the filters below instead."),
  });

  const isBrowsing = !search.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full-screen rather than a constrained centered modal -- this dialog
          packs a search box, five filter groups, and a scrollable results
          list, which felt cramped at the default max-w-lg/85vh size,
          especially on a desktop with plenty of unused space around it. */}
      <DialogContent className="inset-0 top-0 left-0 flex h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0">
        <div className="shrink-0 space-y-4 border-b border-border p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{title ?? (correctivesOnly ? "Add Corrective" : "Add Exercise")}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search your exercise bank…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <button
              type="button"
              title="Describe what you're looking for"
              disabled={aiSearchMutation.isPending}
              onClick={() => {
                if (search.trim()) aiSearchMutation.mutate(search.trim());
              }}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50",
              )}
            >
              <Sparkles className={cn("h-4 w-4", aiSearchMutation.isPending && "animate-pulse")} />
            </button>
          </div>
        </div>
        {/* Filters and results now share ONE scrollable region instead of
            two (a fixed-height filter panel above a separately-scrolling
            results list) -- with nine filter groups (Sport alone runs 30+
            chips), the filter panel alone can be taller than a phone's
            viewport, and since the panel was shrink-0 inside an
            overflow-hidden dialog, whatever didn't fit was simply clipped:
            invisible AND unreachable, taking the results list under it
            down with it. Only the title/search stays pinned above this,
            since re-introducing a second independently-scrolling sibling
            here is exactly what the PREVIOUS mobile-scroll fix (see git
            blame) had to undo -- two nested/stacked scroll containers make
            it ambiguous which one a touch-scroll gesture should hit. */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {/* isBrowsing hides the accordion/equipment/more-filters buttons
              once the coach is typing a direct search -- see the AI-search
              comment above for why this is purely a display decision: every
              filter set here keeps applying underneath even while hidden,
              so a family+equipment combo the coach already picked still
              narrows a follow-up text search instead of being silently
              dropped. Clearing the box brings the buttons (and the context
              for whatever's currently active) back. */}
          {isBrowsing && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_FAMILIES.map((family) => {
                  const active = activeFamily === family;
                  const count = familyCounts.get(family) ?? 0;
                  return (
                    <button
                      key={family}
                      type="button"
                      onClick={() => handleFamilyClick(family)}
                      aria-pressed={active}
                      disabled={count === 0}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                        active
                          ? FAMILY_FILTER_ACTIVE_CLASS[family]
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
                      )}
                    >
                      {family}
                      <span className="ml-1 font-normal opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
              {activeFamily && (
                <div className="rounded-md border border-border/60 bg-surface p-2.5">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    Equipment
                  </p>
                  {/* Fixed 4-column grid, every equipment type in the same
                      canonical order (shared/exercise-family.ts) no matter
                      which family is open -- absent-for-this-family
                      equipment is disabled IN PLACE, never hidden or
                      reordered, so a button never moves position when
                      switching families. */}
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                    {EQUIPMENT_ORDER.map((eq) => {
                      const count = equipmentCounts.get(eq) ?? 0;
                      const active = equipmentFilter.has(eq);
                      return (
                        <button
                          key={eq}
                          type="button"
                          disabled={count === 0}
                          onClick={() => toggleInSet(setEquipmentFilter, eq)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-full border px-2 py-1 text-[11px] font-medium leading-tight transition-colors disabled:opacity-30",
                            active
                              ? EQUIPMENT_FILTER_ACTIVE_CLASS
                              : "border-border text-muted-foreground hover:border-yellow-500/50 hover:text-yellow-400",
                          )}
                        >
                          {eq} <span className="opacity-60">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowMoreFilters((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showMoreFilters && "rotate-180")} />
                More filters
              </button>
              {showMoreFilters && (
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
                  <FilterChipGroup
                    label="Category"
                    options={CATEGORIES}
                    selected={categoryFilter}
                    onToggle={(v) => toggleInSet(setCategoryFilter, v)}
                    optionColorClass={(v) => CATEGORY_FILTER_ACTIVE_CLASS[v]}
                  />
                  <FilterChipGroup
                    label="Movement"
                    options={MOVEMENT_TYPES}
                    selected={movementFilter}
                    onToggle={(v) => toggleInSet(setMovementFilter, v)}
                    colorClass={MOVEMENT_FILTER_ACTIVE_CLASS}
                  />
                  <div className="space-y-2">
                    <FilterChipGroup
                      label="Laterality"
                      options={["bilateral", "unilateral"]}
                      selected={lateralityFilter}
                      onToggle={(v) => toggleInSet(setLateralityFilter, v)}
                      colorClass={LATERALITY_FILTER_ACTIVE_CLASS}
                    />
                    <button
                      type="button"
                      onClick={() => setOnlyCorrectives((v) => !v)}
                      aria-pressed={onlyCorrectives}
                      className={cn(
                        "flex w-full items-center justify-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                        onlyCorrectives
                          ? "border-cyan-500 bg-cyan-500/15 text-cyan-400"
                          : "border-border text-muted-foreground hover:border-cyan-500/50 hover:text-cyan-400",
                      )}
                    >
                      <Stethoscope className="h-3 w-3" />
                      Correctives only
                    </button>
                  </div>
                  <FilterChipGroup
                    label="Created By"
                    options={ownerOptions}
                    selected={ownerFilter}
                    onToggle={(v) => toggleInSet(setOwnerFilter, v)}
                    colorClass={OWNER_FILTER_ACTIVE_CLASS}
                  />
                  <FilterChipGroup
                    label="Body Region"
                    options={BODY_REGIONS}
                    selected={bodyRegionFilter}
                    onToggle={(v) => toggleInSet(setBodyRegionFilter, v)}
                    colorClass={BODY_REGION_FILTER_ACTIVE_CLASS}
                  />
                  <FilterChipGroup
                    label="Plane"
                    options={PLANES}
                    selected={planeFilter}
                    onToggle={(v) => toggleInSet(setPlaneFilter, v)}
                    colorClass={PLANE_FILTER_ACTIVE_CLASS}
                  />
                  <FilterChipGroup
                    label="Complexity"
                    options={MOVEMENT_COMPLEXITIES}
                    selected={complexityFilter}
                    onToggle={(v) => toggleInSet(setComplexityFilter, v)}
                    colorClass={MOVEMENT_COMPLEXITY_FILTER_ACTIVE_CLASS}
                  />
                  <FilterChipGroup
                    label="Muscle"
                    options={bodyParts}
                    selected={muscleGroupFilter}
                    onToggle={(v) => toggleInSet(setMuscleGroupFilter, v)}
                    colorClass={MUSCLE_FILTER_ACTIVE_CLASS}
                    className="col-span-2 sm:col-span-4"
                  />
                  <FilterChipGroup
                    label="Sport"
                    options={sportOptions}
                    selected={sportFilter}
                    onToggle={(v) => toggleInSet(setSportFilter, v)}
                    colorClass={SPORT_FILTER_ACTIVE_CLASS}
                    className="col-span-2 sm:col-span-4"
                  />
                </div>
              )}
            </div>
          )}
          <div className="space-y-1 border-t border-border pt-4">
            {filtered.length === 0 && search.trim() && (
              // A plain keyword miss on real typed text is the exact moment
              // the AI search button is for -- pointing at it here beats
              // the generic empty state, which just reads as "broken" when
              // someone's typed a whole sentence instead of a short name.
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Sparkles className="h-8 w-8" />
                <p>
                  No exercises match "{search}" by name.
                  <br />
                  Try the <Sparkles className="mx-0.5 inline h-3.5 w-3.5" /> button above to describe what
                  you're looking for instead.
                </p>
              </div>
            )}
            {filtered.length === 0 && !search.trim() && (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Dumbbell className="h-8 w-8" />
                No exercises found matching these filters.
              </div>
            )}
            {filtered.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => {
                  onSelect(ex);
                  onOpenChange(false);
                  setSearch("");
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated"
              >
                <div>
                  <p className="text-sm font-semibold">{ex.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ex.muscleGroup} · {ex.equipment}
                    {ex.movementType ? ` · ${ex.movementType}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {ex.isCorrective && <Stethoscope className="h-3.5 w-3.5 text-cyan-400" />}
                  <ExerciseOwnershipBadge
                    isForgeOfficial={ex.isForgeOfficial}
                    ownerLabel={ex.ownerLabel}
                  />
                  {/* Every visible row already matches activeFamily when
                      one's selected (see matchesFamily above) -- showing
                      the raw category badge here instead would be
                      confusing rather than informative (e.g. "Conditioning"
                      on every result under the Combination family, since
                      that's how the seeded data happens to be tagged). */}
                  <Badge variant="secondary" className="capitalize">
                    {activeFamily ?? ex.category}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
