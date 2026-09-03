import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getJson } from "@/lib/queryClient";
import { externalLinkClick } from "@/lib/open-external";
import { Target, MoonStar, Film } from "lucide-react";

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
    videoUrl?: string | null;
  }[];
};

/** Opened when a coach taps a teal skill entry on the roster-wide calendar
 * -- read-only, previewing the program's structure (there's no specific
 * athlete/date here to attribute anything to, just the plan). The
 * athlete's own version of this day is a real page now, not a dialog --
 * see skill-workout.tsx -- since it needs its own URL to log sets against
 * (manual time/result entry, camera captures, the works), not just a
 * preview. */
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
  source: { skillProgramId: number; skillProgramDayId: number };
}) {
  const { data: coachProgram } = useQuery<any>({
    queryKey: ["/api/coach/skill-programs", source.skillProgramId],
    queryFn: () => getJson(`/api/coach/skill-programs/${source.skillProgramId}`),
    enabled: open,
  });

  const day: SkillDayInfo | undefined = coachProgram
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
                videoUrl: ex.skillExercise.videoUrl,
              })),
            };
          }
        }
        return undefined;
      })()
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
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
                    {ex.videoUrl && (
                      <a
                        href={ex.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={externalLinkClick(ex.videoUrl)}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <Film className="h-3 w-3" /> Watch demo
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
