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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Dumbbell, Stethoscope } from "lucide-react";
import type { Exercise } from "@shared/schema";
import { MOVEMENT_TYPES } from "@/pages/coach/exercises";

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
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [movementFilter, setMovementFilter] = useState("all");
  const [lateralityFilter, setLateralityFilter] = useState("all");
  const [onlyCorrectives, setOnlyCorrectives] = useState(correctivesOnly);

  useEffect(() => {
    if (open) setOnlyCorrectives(correctivesOnly);
  }, [open, correctivesOnly]);

  const filtered = useMemo(
    () =>
      exercises.filter((ex) => {
        const matchesSearch =
          !search ||
          ex.name.toLowerCase().includes(search.toLowerCase()) ||
          ex.muscleGroup.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = categoryFilter === "all" || ex.category === categoryFilter;
        const matchesMovement =
          movementFilter === "all" || ex.movementType === movementFilter;
        const matchesLaterality =
          lateralityFilter === "all" || ex.laterality === lateralityFilter;
        const matchesCorrective = !onlyCorrectives || ex.isCorrective;
        return (
          matchesSearch &&
          matchesCategory &&
          matchesMovement &&
          matchesLaterality &&
          matchesCorrective
        );
      }),
    [exercises, search, categoryFilter, movementFilter, lateralityFilter, onlyCorrectives],
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
        <div className="flex flex-wrap items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {["strength", "conditioning", "olympic", "accessory", "mobility", "plyometric"].map(
                (c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Select value={movementFilter} onValueChange={setMovementFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Movement" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All movements</SelectItem>
              {MOVEMENT_TYPES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lateralityFilter} onValueChange={setLateralityFilter}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Laterality" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Bi/Uni</SelectItem>
              <SelectItem value="bilateral">Bilateral</SelectItem>
              <SelectItem value="unilateral">Unilateral</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox
              checked={onlyCorrectives}
              onCheckedChange={(c) => setOnlyCorrectives(c === true)}
            />
            Correctives only
          </label>
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
