import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Dumbbell, Stethoscope } from "lucide-react";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import type { ExerciseWithOwnership as Exercise } from "@/lib/exercise-types";
import {
  MOVEMENT_TYPES,
  MUSCLE_GROUPS,
  SPORTS,
  BODY_REGIONS,
  PLANES,
  MOVEMENT_COMPLEXITIES,
} from "@/lib/exercise-taxonomy";
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
} from "@/lib/exercise-colors";

const CATEGORIES = ["strength", "conditioning", "olympic", "accessory", "mobility", "plyometric"];

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

  const filtered = useMemo(
    () =>
      exercises.filter((ex) => {
        const matchesSearch =
          !search ||
          ex.name.toLowerCase().includes(search.toLowerCase()) ||
          ex.muscleGroup.toLowerCase().includes(search.toLowerCase()) ||
          (ex.sports ?? []).some((s) => s.toLowerCase().includes(search.toLowerCase()));
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search your exercise bank…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-4 sm:p-6">
          {filtered.length === 0 && (
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
                <Badge variant="secondary" className="capitalize">
                  {ex.category}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
