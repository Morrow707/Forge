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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioChipGroup } from "@/components/filter-chip-group";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Repeat } from "lucide-react";

const DURATION_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));

type RosterEntry = { id: number; name: string; email: string };
type SkillProgramSummary = { id: number; name: string };

/** Skill-program counterpart to AssignProgramDialog -- same start
 * date/duration/athlete-picker shape, but no correctives (they don't apply
 * to a skill drill) and no per-day schedule customization for this first
 * pass. Assigns against skill_assignments, a wholly separate table from
 * assignments -- see skillAssignments in shared/schema.ts. */
export function AssignSkillProgramDialog({
  open,
  onOpenChange,
  roster,
  programs,
  programId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: RosterEntry[];
  programs: SkillProgramSummary[];
  programId?: number;
}) {
  const qc = useQueryClient();
  const [assignAthleteIds, setAssignAthleteIds] = useState<Set<number>>(new Set());
  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    programId ? String(programId) : "",
  );
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationWeeks, setDurationWeeks] = useState(1);

  useEffect(() => {
    if (open) {
      setAssignAthleteIds(new Set());
      setSelectedProgramId(programId ? String(programId) : "");
      setStartDate(new Date().toISOString().slice(0, 10));
      setDurationWeeks(1);
    }
  }, [open, programId]);

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/skill-assignments", {
        skillProgramId: Number(selectedProgramId),
        startDate,
        durationWeeks,
        athletes: Array.from(assignAthleteIds).map((athleteId) => ({ athleteId })),
      });
      return res.json();
    },
    onSuccess: (result: { created: unknown[] }) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/skill-programs"] });
      if (result.created.length > 0) {
        toast.success(
          `Assigned to ${result.created.length} athlete${result.created.length === 1 ? "" : "s"}`,
        );
      }
      onOpenChange(false);
      setAssignAthleteIds(new Set());
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not assign skill program"),
  });

  const lockedProgramName = programId
    ? (programs.find((p) => p.id === programId)?.name ?? "This skill program")
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Skill Program</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            assignMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>Skill program</Label>
            {lockedProgramName ? (
              <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-semibold">
                {lockedProgramName}
              </div>
            ) : (
              <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a skill program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Day 1 of Week 1 lands on this date.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
              Repeat
            </Label>
            <RadioChipGroup
              label=""
              className="[&>p]:hidden"
              options={DURATION_OPTIONS}
              value={String(durationWeeks)}
              onChange={(v) => setDurationWeeks(Number(v) || 1)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Athletes</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {roster.map((a) => {
                const selected = assignAthleteIds.has(a.id);
                return (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-elevated"
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => {
                        setAssignAthleteIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(a.id);
                          else next.delete(a.id);
                          return next;
                        });
                      }}
                    />
                    {a.name}
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                assignMutation.isPending || !selectedProgramId || assignAthleteIds.size === 0
              }
            >
              Assign to {assignAthleteIds.size} athlete
              {assignAthleteIds.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
