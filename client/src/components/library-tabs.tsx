import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ListChecks, Dumbbell } from "lucide-react";

/** Tab strip shown under the page title on the coach's Programs and
 * Exercise Bank list pages -- both routes are unchanged (still
 * /coach/programs and /coach/exercises, so existing links/bookmarks keep
 * working), this just lets the coach flip between them without going back
 * out to the top nav, since they're both filed under one "Library" tab
 * there now. */
export function LibraryTabs({
  active,
  programsHref,
  exercisesHref,
}: {
  active: "programs" | "exercises";
  programsHref: string;
  exercisesHref: string;
}) {
  const [, navigate] = useLocation();

  const tabClass = (isActive: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
      isActive
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
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
    </div>
  );
}
