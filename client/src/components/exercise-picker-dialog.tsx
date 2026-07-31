import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Dumbbell } from "lucide-react";
import type { Exercise } from "@shared/schema";

export function ExercisePickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (exercise: Exercise) => void;
}) {
  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ["/api/coach/exercises"],
    enabled: open,
  });
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      exercises.filter(
        (ex) =>
          !search ||
          ex.name.toLowerCase().includes(search.toLowerCase()) ||
          ex.muscleGroup.toLowerCase().includes(search.toLowerCase()),
      ),
    [exercises, search],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Exercise</DialogTitle>
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
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <Dumbbell className="h-8 w-8" />
              No exercises found. Add some to your bank first.
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
                </p>
              </div>
              <Badge variant="secondary" className="capitalize">
                {ex.category}
              </Badge>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
