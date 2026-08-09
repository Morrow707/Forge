import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ListChecks, Dumbbell, ClipboardList, Target, GraduationCap } from "lucide-react";

/** Tab strip shown under the page title on the coach's Programs, Exercise
 * Bank, Skill Programs, Skill Bank, and (coach-only) Classes list pages --
 * all routes are unchanged, this just lets the coach flip between them
 * without going back out to the top nav, since they're all filed under one
 * "Library" tab there now. The skill-side tabs (Skill Programs, Skill Bank,
 * Classes) use teal (their own color, see exercise-colors.ts) so they read
 * as visually distinct from the strength-side tabs even in this shared
 * strip -- Skills is a wholly separate system underneath, not a filtered
 * view of the others, and Classes is built on top of it (a lesson is a
 * hidden skill program), so it groups with them rather than with
 * Programs/Exercise Bank. `classesHref` is omitted on the athlete's Library
 * strip -- an athlete's Classes stays its own top-level nav tab (never
 * AI-gated, unlike the rest of Library), so no Classes button renders there. */
export function LibraryTabs({
  active,
  programsHref,
  exercisesHref,
  skillProgramsHref,
  skillBankHref,
  classesHref,
}: {
  active: "programs" | "exercises" | "skill-programs" | "skill-bank" | "classes";
  programsHref: string;
  exercisesHref: string;
  skillProgramsHref: string;
  skillBankHref: string;
  classesHref?: string;
}) {
  const [, navigate] = useLocation();

  const tabClass = (isActive: boolean, activeColorClass = "bg-primary text-primary-foreground") =>
    cn(
      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
      isActive ? activeColorClass : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
    );

  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" onClick={() => navigate(programsHref)} className={tabClass(active === "programs")}>
        <ListChecks className="h-4 w-4" />
        Programs
      </button>
      <button type="button" onClick={() => navigate(exercisesHref)} className={tabClass(active === "exercises")}>
        <Dumbbell className="h-4 w-4" />
        Exercise Bank
      </button>
      <button
        type="button"
        onClick={() => navigate(skillProgramsHref)}
        className={tabClass(active === "skill-programs", "bg-teal-500 text-white")}
      >
        <ClipboardList className="h-4 w-4" />
        Skill Programs
      </button>
      <button
        type="button"
        onClick={() => navigate(skillBankHref)}
        className={tabClass(active === "skill-bank", "bg-teal-500 text-white")}
      >
        <Target className="h-4 w-4" />
        Skill Bank
      </button>
      {classesHref && (
        <button
          type="button"
          onClick={() => navigate(classesHref)}
          className={tabClass(active === "classes", "bg-teal-500 text-white")}
        >
          <GraduationCap className="h-4 w-4" />
          Classes
        </button>
      )}
    </div>
  );
}
