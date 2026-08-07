import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ListChecks, Dumbbell, Target } from "lucide-react";

/** Tab strip shown under the page title on the coach's Programs, Exercise
 * Bank, and Skill Bank list pages -- all routes are unchanged, this just
 * lets the coach flip between them without going back out to the top nav,
 * since they're all filed under one "Library" tab there now. Skill Bank
 * uses teal (its own color, see exercise-colors.ts) so it reads as visually
 * distinct from the strength-side tabs even in this shared strip -- it's a
 * wholly separate system underneath, not a filtered view of the others. */
export function LibraryTabs({
  active,
  programsHref,
  exercisesHref,
  skillsHref,
}: {
  active: "programs" | "exercises" | "skills";
  programsHref: string;
  exercisesHref: string;
  /** Omitted until Skill Programs (Batch 2) exists too -- only the Skill
   * Bank tab is wired up for now. */
  skillsHref?: string;
}) {
  const [, navigate] = useLocation();

  const tabClass = (isActive: boolean, activeColorClass = "bg-primary text-primary-foreground") =>
    cn(
      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
      isActive ? activeColorClass : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
    );

  return (
    <div className="flex gap-1">
      <button type="button" onClick={() => navigate(programsHref)} className={tabClass(active === "programs")}>
        <ListChecks className="h-4 w-4" />
        Programs
      </button>
      <button type="button" onClick={() => navigate(exercisesHref)} className={tabClass(active === "exercises")}>
        <Dumbbell className="h-4 w-4" />
        Exercise Bank
      </button>
      {skillsHref && (
        <button
          type="button"
          onClick={() => navigate(skillsHref)}
          className={tabClass(active === "skills", "bg-teal-500 text-white")}
        >
          <Target className="h-4 w-4" />
          Skill Bank
        </button>
      )}
    </div>
  );
}
