import { ExerciseBankPage } from "@/pages/exercise-bank";
import { LibraryTabs } from "@/components/library-tabs";
import { CoachSectionGate } from "@/components/coach-section-gate";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";

export default function CoachExercises() {
  const t = useT();
  const { user } = useAuth();
  return (
    <CoachSectionGate section="exercises">
      <ExerciseBankPage
        apiBase="/api/coach"
        routeBase="/coach/exercises"
        title={t("Exercise Bank")}
        emptyStateText="Your exercise bank is empty. Add your first exercise to start building programs."
        libraryTabs={
          <LibraryTabs
            active="exercises"
            programsHref="/coach/programs"
            exercisesHref="/coach/exercises"
            skillProgramsHref="/coach/skill-programs"
            skillBankHref="/coach/skills"
            classesHref="/coach/classes"
            hiddenSections={user?.hiddenSections}
          />
        }
      />
    </CoachSectionGate>
  );
}
