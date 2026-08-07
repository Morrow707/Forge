import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { Target, MoonStar, Timer } from "lucide-react";
import { SprintTrackerDialog } from "@/components/sprint-tracker-dialog";

type SkillDayInfo = {
  programName: string;
  title: string;
  isRestDay: boolean;
  exercises: {
    id: number;
    name: string;
    skillType: string;
    sets: number;
    reps: string;
    restSeconds: number | null;
    notes: string | null;
    trackingLevel?: "none" | "sprint";
  }[];
};

/** Read-only view of a skill day, opened when a coach or athlete taps a
 * teal skill entry on the calendar -- skill days have no logging/completion
 * flow yet (that lands with the camera-tracking batches), so this is
 * deliberately just "what's on the plan," not an editable or loggable
 * workout page like the strength side's CoachDayEditDialog/workout.tsx. */
export function SkillDayViewDialog({
  open,
  onOpenChange,
  athleteName,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only shown for the coach's roster-wide calendar. */
  athleteName?: string;
  source:
    | { kind: "coach"; skillProgramId: number; skillProgramDayId: number }
    | { kind: "athlete"; skillAssignmentId: number; skillProgramDayId: number };
}) {
  const { data: coachProgram } = useQuery<any>({
    queryKey: ["/api/coach/skill-programs", source.kind === "coach" ? source.skillProgramId : null],
    queryFn: () => getJson(`/api/coach/skill-programs/${source.kind === "coach" ? source.skillProgramId : ""}`),
    enabled: open && source.kind === "coach",
  });
  const { data: athleteDay } = useQuery<SkillDayInfo>({
    queryKey: [
      "/api/athlete/skill-day",
      source.kind === "athlete" ? source.skillAssignmentId : null,
      source.kind === "athlete" ? source.skillProgramDayId : null,
    ],
    queryFn: () =>
      getJson(
        `/api/athlete/skill-day/${source.kind === "athlete" ? source.skillAssignmentId : ""}/${source.kind === "athlete" ? source.skillProgramDayId : ""}`,
      ),
    enabled: open && source.kind === "athlete",
  });

  const day: SkillDayInfo | undefined =
    source.kind === "athlete"
      ? athleteDay
      : coachProgram
        ? (() => {
            for (const week of coachProgram.weeks ?? []) {
              const found = week.days.find((d: any) => d.id === source.skillProgramDayId);
              if (found) {
                return {
                  programName: coachProgram.name,
                  title: found.title,
                  isRestDay: found.isRestDay,
                  exercises: found.exercises.map((ex: any) => ({
                    id: ex.id,
                    name: ex.skillExercise.name,
                    skillType: ex.skillExercise.skillType,
                    sets: ex.sets,
                    reps: ex.reps,
                    restSeconds: ex.restSeconds,
                    notes: ex.notes,
                    trackingLevel: ex.trackingLevel,
                  })),
                };
              }
            }
            return undefined;
          })()
        : undefined;

  // Recording only makes sense against the athlete's own assignment -- the
  // coach-kind view is previewing the program's structure, not a specific
  // athlete's day, so there's no skillAssignmentId to attribute a capture to.
  const [sprintExercise, setSprintExercise] = useState<SkillDayInfo["exercises"][number] | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-teal-400" />
              {day?.title ?? "Skill Session"}
            </DialogTitle>
          </DialogHeader>
          {athleteName && <p className="-mt-2 text-sm text-muted-foreground">{athleteName}</p>}
          {day && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{day.programName}</p>
              {day.isRestDay ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-6 text-sm text-muted-foreground">
                  <MoonStar className="h-4 w-4" />
                  Recovery day
                </div>
              ) : day.exercises.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No drills scheduled</p>
              ) : (
                <div className="space-y-2">
                  {day.exercises.map((ex) => (
                    <div key={ex.id} className="rounded-md border border-teal-900/40 bg-teal-950/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{ex.name}</p>
                        <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-400">
                          {ex.skillType}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ex.sets} sets &times; {ex.reps}
                        {ex.restSeconds ? ` · ${ex.restSeconds}s rest` : ""}
                      </p>
                      {ex.notes && <p className="mt-1 text-xs text-muted-foreground">{ex.notes}</p>}
                      {ex.trackingLevel === "sprint" && source.kind === "athlete" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2 w-full"
                          onClick={() => setSprintExercise(ex)}
                        >
                          <Timer className="h-3.5 w-3.5" />
                          Record Sprint
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {sprintExercise && source.kind === "athlete" && (
        <SprintTrackerDialog
          open={!!sprintExercise}
          onOpenChange={(o) => !o && setSprintExercise(null)}
          drillName={sprintExercise.name}
          skillAssignmentId={source.skillAssignmentId}
          skillProgramDayId={source.skillProgramDayId}
          skillProgramExerciseId={sprintExercise.id}
        />
      )}
    </>
  );
}
