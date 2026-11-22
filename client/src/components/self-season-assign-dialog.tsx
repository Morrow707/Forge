/**
 * "Add to my calendar" for a coach, an admin or a Free Agent training themselves (2026-11-22): the
 * start date, plus the same Season setup step Assign Program has (shared/season-plan.ts). Posts to
 * /api/my/season-assignments, which makes each assignment through the same storage call the old
 * self-assign routes used.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeasonSetupStep, useSeasonSetup } from "@/components/season-setup-step";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { todayIso } from "@/lib/local-date";

export function SelfSeasonAssignDialog({
  programId,
  programIds,
  onClose,
}: {
  programId: number | null;
  /** Every program on the list, so the season plan can offer the tagged ones. */
  programIds: number[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const open = programId !== null;
  const [startDate, setStartDate] = useState(() => todayIso());
  useEffect(() => {
    if (open) setStartDate(todayIso());
  }, [open]);

  const setup = useSeasonSetup({
    open,
    mode: "self",
    primaryProgramId: programId,
    programIds,
    athleteIds: [],
    startDate,
    durationWeeks: 1,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const r = setup.request;
      const res = await apiRequest("POST", "/api/my/season-assignments", {
        programs: r.programs,
        position: r.ownPosition,
        firstGameDate: r.firstGameDate,
        lastGameDate: r.lastGameDate,
      });
      return res.json() as Promise<{ created: { id: number }[] }>;
    },
    onSuccess: (result) => {
      // The calendar this lands on lives under a different path for each caller; invalidating all
      // three is harmless for whichever has no observers.
      qc.invalidateQueries({ queryKey: ["/api/admin/my/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/my/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
      toast.success(result.created.length > 1 ? `Added ${result.created.length} programs to your calendar` : "Added to your calendar");
      onClose();
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not add to your calendar"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to My Calendar</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="min-w-0 space-y-4"
        >
          {!setup.planOn && (
            <div className="space-y-1.5">
              <Label htmlFor="self-assign-date">Start date</Label>
              <Input
                id="self-assign-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="h-12 text-base"
              />
              <p className="text-xs text-muted-foreground">Day 1 of Week 1 lands on this date.</p>
            </div>
          )}
          <SeasonSetupStep setup={setup} />
          {setup.blockReason && (
            <p className="text-xs text-muted-foreground" data-testid="text-season-block-reason">
              {setup.blockReason}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !!setup.blockReason || setup.request.programs.length === 0}>
              {mutation.isPending ? "Adding…" : "Add to Calendar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
