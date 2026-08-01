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
import { MOVEMENT_TYPES, MUSCLE_GROUPS } from "@/lib/exercise-taxonomy";
import { FilterChipGroup, toggleInSet } from "@/components/filter-chip-group";

const CATEGORIES = ["strength", "conditioning", "olympic", "accessory", "mobility", "plyometric"];

export function ExercisePickerDialog({
  open,
  onOpenChange,
  onSelect,
  correctivesOnly = false,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (exercise: Exercise) => void;
  correctivesOnly?: boolean;
  title?: string;
}) {
  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ["/api/coach/exercises"],
    enabled: open,
  });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [movementFilter, setMovementFilter] = useState<Set<string>>(new Set());
  const [muscleGroupFilter, setMuscleGroupFilter] = useState<Set<string>>(new Set());
  const [lateralityFilter, setLateralityFilter] = useState<Set<string>>(new Set());
  const [onlyCorrectives, setOnlyCorrectives] = useState(correctivesOnly);

  useEffect(() => {
    if (open) setOnlyCorrectives(correctivesOnly);
  }, [open, correctivesOnly]);

  const bodyParts = useMemo(
    () =>
      Array.from(new Set([...MUSCLE_GROUPS, ...exercises.map((e) => e.muscleGroup)])).sort(),
    [exercises],
  );

  const filtered = useMemo(
    () =>
      exercises.filter((ex) => {
        const matchesSearch =
          !search ||
          ex.name.toLowerCase().includes(search.toLowerCase()) ||
          ex.muscleGroup.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = categoryFilter.size === 0 || categoryFilter.has(ex.category);
        const matchesMovement =
          movementFilter.size === 0 ||
          (ex.movementType != null && movementFilter.has(ex.movementType));
        const matchesMuscleGroup =
          muscleGroupFilter.size === 0 || muscleGroupFilter.has(ex.muscleGroup);
        const matchesLaterality =
          lateralityFilter.size === 0 ||
          (ex.laterality != null && lateralityFilter.has(ex.laterality));
        const matchesCorrective = !onlyCorrectives || ex.isCorrective;
        return (
          matchesSearch &&
          matchesCategory &&
          matchesMovement &&
          matchesMuscleGroup &&
          matchesLaterality &&
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
      onlyCorrectives,
    ],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
        <div className="grid grid-cols-2 gap-3">
          <FilterChipGroup
            label="Category"
            options={CATEGORIES}
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
            label="Muscle"
            options={bodyParts}
            selected={muscleGroupFilter}
            onToggle={(v) => toggleInSet(setMuscleGroupFilter, v)}
            className="col-span-2"
          />
        </div>
        <div className="max-h-96 space-y-1 overflow-y-auto">
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
