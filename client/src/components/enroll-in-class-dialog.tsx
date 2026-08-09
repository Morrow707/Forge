import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";

type RosterEntry = { id: number; name: string; email: string };

/** Enrolls one or more roster athletes into a Class -- same start-date-
 * plus-athlete-picker shape as AssignSkillProgramDialog, but hits
 * /api/coach/classes/:id/enroll once per athlete since enrollment is a
 * per-athlete row (classEnrollments), not a batch-created one like
 * skillAssignments. */
export function EnrollInClassDialog({
  open,
  onOpenChange,
  roster,
  classId,
  apiBase = "/api/coach",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: RosterEntry[];
  classId: number | undefined;
  apiBase?: string;
}) {
  const qc = useQueryClient();
  const [athleteIds, setAthleteIds] = useState<Set<number>>(new Set());
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) {
      setAthleteIds(new Set());
      setStartDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.all(
        Array.from(athleteIds).map((athleteId) =>
          apiRequest("POST", `${apiBase}/classes/${classId}/enroll`, { athleteId, startDate }),
        ),
      );
      return results.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/classes`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/classes`, classId, "roster"] });
      toast.success(`Enrolled ${count} athlete${count === 1 ? "" : "s"}`);
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not enroll athlete"),
  });

  function toggleAthlete(id: number) {
    setAthleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll Athletes</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (athleteIds.size === 0 || !classId) return;
            enrollMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="enroll-start-date">Start date</Label>
            <Input
              id="enroll-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Lesson 1 becomes active on this date.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Athletes</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {roster.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No athletes on your roster yet.</p>
              )}
              {roster.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-elevated"
                >
                  <Checkbox
                    checked={athleteIds.has(a.id)}
                    onCheckedChange={() => toggleAthlete(a.id)}
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={enrollMutation.isPending || athleteIds.size === 0}>
              {enrollMutation.isPending ? "Enrolling…" : "Enroll"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
