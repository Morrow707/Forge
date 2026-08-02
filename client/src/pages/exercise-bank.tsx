import { useMemo, useState } from "react";
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
import { Plus, Trash2, Dumbbell, Search, Video, Stethoscope } from "lucide-react";
import type { ExerciseWithOwnership } from "@/lib/exercise-types";
import { MOVEMENT_TYPES, MUSCLE_GROUPS } from "@/lib/exercise-taxonomy";
import { FilterChipGroup, toggleInSet } from "@/components/filter-chip-group";
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

const categoryColors: Record<string, string> = {
  strength: "bg-primary/15 text-primary",
  conditioning: "bg-success/15 text-success",
  olympic: "bg-blue-500/15 text-blue-400",
  accessory: "bg-purple-500/15 text-purple-400",
  mobility: "bg-cyan-500/15 text-cyan-400",
  plyometric: "bg-amber-500/15 text-amber-400",
};

/** Exercise bank list, shared by the coach ("your bank + shared Forge
 * library") and admin ("your Forge library only") experiences -- same
 * filters and card layout, pointed at different API/route prefixes. */
export function ExerciseBankPage({
  apiBase,
  routeBase,
  title,
  emptyStateText,
}: {
  apiBase: string;
  routeBase: string;
  title: string;
  emptyStateText: string;
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
  const [correctivesOnly, setCorrectivesOnly] = useState(false);

  const bodyParts = useMemo(
    () =>
      Array.from(new Set([...MUSCLE_GROUPS, ...exercises.map((e) => e.muscleGroup)])).sort(),
    [exercises],
  );

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesSearch =
        !search ||
        ex.name.toLowerCase().includes(search.toLowerCase()) ||
        ex.muscleGroup.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter.size === 0 || categoryFilter.has(ex.category);
      const matchesMovement =
        movementFilter.size === 0 || (ex.movementType != null && movementFilter.has(ex.movementType));
      const matchesMuscleGroup = muscleGroupFilter.size === 0 || muscleGroupFilter.has(ex.muscleGroup);
      const matchesLaterality =
        lateralityFilter.size === 0 || (ex.laterality != null && lateralityFilter.has(ex.laterality));
      const matchesCorrective = !correctivesOnly || ex.isCorrective;
      return (
        matchesSearch &&
        matchesCategory &&
        matchesMovement &&
        matchesMuscleGroup &&
        matchesLaterality &&
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

  return (
    <AppShell
      title={title}
      actions={
        <Button onClick={() => navigate(`${routeBase}/new`)}>
          <Plus className="h-4 w-4" />
          New Exercise
        </Button>
      }
    >
      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search exercises or body part…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FilterChipGroup
            label="Category"
            options={[...CATEGORIES]}
            selected={categoryFilter}
            onToggle={(v) => toggleInSet(setCategoryFilter, v)}
          />
          <FilterChipGroup
            label="Movement"
            options={MOVEMENT_TYPES}
            selected={movementFilter}
            onToggle={(v) => toggleInSet(setMovementFilter, v)}
          />
          <div className="space-y-2">
            <FilterChipGroup
              label="Laterality"
              options={["bilateral", "unilateral"]}
              selected={lateralityFilter}
              onToggle={(v) => toggleInSet(setLateralityFilter, v)}
            />
            <button
              type="button"
              onClick={() => setCorrectivesOnly((v) => !v)}
              aria-pressed={correctivesOnly}
              className={cn(
                "flex w-full items-center justify-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
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
            label="Muscle"
            options={bodyParts}
            selected={muscleGroupFilter}
            onToggle={(v) => toggleInSet(setMuscleGroupFilter, v)}
            className="sm:col-span-3"
          />
        </div>
      </div>

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Dumbbell className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              {exercises.length === 0 ? emptyStateText : "No exercises match your filters."}
            </p>
            {exercises.length === 0 && (
              <Button onClick={() => navigate(`${routeBase}/new`)}>
                <Plus className="h-4 w-4" />
                Add Exercise
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ex) => (
          <Link key={ex.id} href={`${routeBase}/${ex.id}`}>
            <Card className="flex cursor-pointer flex-col transition-colors hover:border-primary/50">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold leading-tight">{ex.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ex.muscleGroup}
                      {ex.movementType ? ` · ${ex.movementType}` : ""}
                      {ex.laterality ? ` · ${ex.laterality}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ExerciseOwnershipBadge
                      isForgeOfficial={ex.isForgeOfficial}
                      ownerLabel={ex.ownerLabel}
                    />
                    <Badge className={categoryColors[ex.category]} variant="default">
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
