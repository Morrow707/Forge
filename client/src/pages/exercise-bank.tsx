import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Dumbbell, Search, Video, Stethoscope, Star } from "lucide-react";
import type { ExerciseWithOwnership } from "@/lib/exercise-types";
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
  CATEGORY_BADGE_CLASS,
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
import { toast } from "sonner";
import { ApiError } from "@/lib/queryClient";

const CATEGORIES = [
  "strength",
  "conditioning",
  "olympic",
  "accessory",
  "mobility",
  "plyometric",
] as const;

/** Exercise bank list, shared by the coach ("your bank + shared Forge
 * library") and admin ("your Forge library only") experiences -- same
 * filters and card layout, pointed at different API/route prefixes. */
export function ExerciseBankPage({
  apiBase,
  routeBase,
  title,
  emptyStateText,
  libraryTabs,
  showCreate = true,
}: {
  apiBase: string;
  routeBase: string;
  title: string;
  emptyStateText: string;
  /** Renders the Programs/Exercise Bank tab strip under the title -- only
   * the coach's Library page passes this (see LibraryTabs). */
  libraryTabs?: ReactNode;
  /** Hides "New Exercise" -- a Free Agent browses this catalog (own
   * exercises are never in it, since there's no create route for them) but
   * doesn't author entries in it the way a coach or admin does. Per-card
   * delete already stays hidden on its own since every visible exercise has
   * editable: false for a Free Agent. */
  showCreate?: boolean;
}) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: exercises = [], isLoading } = useQuery<ExerciseWithOwnership[]>({
    queryKey: [`${apiBase}/exercises`],
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
  const [correctivesOnly, setCorrectivesOnly] = useState(false);

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
  // lets a coach isolate exercises a specific assistant coach on their staff
  // made without sifting through the much larger shared Forge library.
  const ownerOptions = useMemo(
    () => Array.from(new Set(exercises.map((e) => e.ownerLabel))).sort(),
    [exercises],
  );

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesSearch =
        !search ||
        ex.name.toLowerCase().includes(search.toLowerCase()) ||
        ex.muscleGroup.toLowerCase().includes(search.toLowerCase()) ||
        (ex.sports ?? []).some((s) => s.toLowerCase().includes(search.toLowerCase()));
      const matchesCategory = categoryFilter.size === 0 || categoryFilter.has(ex.category);
      const matchesMovement =
        movementFilter.size === 0 || (ex.movementType != null && movementFilter.has(ex.movementType));
      const matchesMuscleGroup = muscleGroupFilter.size === 0 || muscleGroupFilter.has(ex.muscleGroup);
      const matchesLaterality =
        lateralityFilter.size === 0 || (ex.laterality != null && lateralityFilter.has(ex.laterality));
      const matchesBodyRegion =
        bodyRegionFilter.size === 0 || (ex.bodyRegion != null && bodyRegionFilter.has(ex.bodyRegion));
      const matchesPlane = planeFilter.size === 0 || (ex.plane != null && planeFilter.has(ex.plane));
      const matchesComplexity =
        complexityFilter.size === 0 ||
        (ex.movementComplexity != null && complexityFilter.has(ex.movementComplexity));
      const matchesSport =
        sportFilter.size === 0 || (ex.sports ?? []).some((s) => sportFilter.has(s));
      const matchesOwner = ownerFilter.size === 0 || ownerFilter.has(ex.ownerLabel);
      const matchesCorrective = !correctivesOnly || ex.isCorrective;
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
    });
  }, [
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
    correctivesOnly,
  ]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${apiBase}/exercises/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/exercises`] });
      toast.success("Exercise deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete exercise"),
  });

  // Admin's Forge-library browse doesn't get this -- favoriting is a
  // coach's own shortlist for building their programs faster, not a
  // concept that applies to curating the shared library.
  const canFavorite = apiBase === "/api/coach";
  const favoriteMutation = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: boolean }) => {
      await apiRequest(next ? "POST" : "DELETE", `${apiBase}/exercises/${id}/favorite`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`${apiBase}/exercises`] }),
    onError: () => toast.error("Couldn't update favorite"),
  });

  return (
    <AppShell
      title={title}
      subheader={libraryTabs}
      actions={
        showCreate && (
          <Button onClick={() => navigate(`${routeBase}/new`)}>
            <Plus className="h-4 w-4" />
            New Exercise
          </Button>
        )
      }
    >
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search exercises, body part, or sport…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {/* flex-wrap, not a fixed-column grid -- a grid column stays as wide
            as its widest sibling even when a group like Laterality only has
            two short chips in it, which left big dead gaps next to short
            groups. This lets each group take only the width its own chips
            need and wrap naturally. */}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <FilterChipGroup
            label="Category"
            options={[...CATEGORIES]}
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
              onClick={() => setCorrectivesOnly((v) => !v)}
              aria-pressed={correctivesOnly}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                correctivesOnly
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
        </div>
        <FilterChipGroup
          label="Muscle"
          options={bodyParts}
          selected={muscleGroupFilter}
          onToggle={(v) => toggleInSet(setMuscleGroupFilter, v)}
          colorClass={MUSCLE_FILTER_ACTIVE_CLASS}
        />
        <FilterChipGroup
          label="Sport"
          options={sportOptions}
          selected={sportFilter}
          onToggle={(v) => toggleInSet(setSportFilter, v)}
          colorClass={SPORT_FILTER_ACTIVE_CLASS}
        />
      </div>

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Dumbbell className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              {exercises.length === 0 ? emptyStateText : "No exercises match your filters."}
            </p>
            {exercises.length === 0 && showCreate && (
              <Button onClick={() => navigate(`${routeBase}/new`)}>
                <Plus className="h-4 w-4" />
                Add Exercise
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ex) => (
          <Link key={ex.id} href={`${routeBase}/${ex.id}`}>
            <Card className="flex cursor-pointer flex-col transition-colors hover:border-primary/50">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-1.5">
                    {canFavorite && (
                      <button
                        type="button"
                        aria-label={ex.isFavorite ? `Unfavorite ${ex.name}` : `Favorite ${ex.name}`}
                        aria-pressed={!!ex.isFavorite}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          favoriteMutation.mutate({ id: ex.id, next: !ex.isFavorite });
                        }}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-amber-400"
                      >
                        <Star className={cn("h-4 w-4", ex.isFavorite && "fill-amber-400 text-amber-400")} />
                      </button>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">{ex.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ex.muscleGroup}
                        {ex.movementType ? ` · ${ex.movementType}` : ""}
                        {ex.plane ? ` (${ex.plane})` : ""}
                        {ex.laterality ? ` · ${ex.laterality}` : ""}
                        {ex.bodyRegion ? ` · ${ex.bodyRegion}` : ""}
                        {ex.movementComplexity ? ` · ${ex.movementComplexity}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ExerciseOwnershipBadge
                      isForgeOfficial={ex.isForgeOfficial}
                      ownerLabel={ex.ownerLabel}
                    />
                    <Badge className={CATEGORY_BADGE_CLASS[ex.category]} variant="default">
                      {ex.category}
                    </Badge>
                    {ex.isCorrective && (
                      <Badge variant="secondary" className="gap-1">
                        <Stethoscope className="h-3 w-3" />
                        Corrective
                      </Badge>
                    )}
                  </div>
                </div>
                {ex.instructions && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{ex.instructions}</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{ex.equipment}</span>
                    {ex.videoUrl && <Video className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  {ex.editable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${ex.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm(`Delete "${ex.name}"?`)) {
                          deleteMutation.mutate(ex.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
