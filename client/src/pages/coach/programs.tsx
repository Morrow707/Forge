import { ProgramListPage } from "@/pages/program-list";
import { LibraryTabs } from "@/components/library-tabs";
import { CoachSectionGate } from "@/components/coach-section-gate";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";

export default function CoachPrograms() {
  const t = useT();
  const { user } = useAuth();
  return (
    <CoachSectionGate section="programs">
      <ProgramListPage
        apiBase="/api/coach"
        routeBase="/coach/programs"
        title={t("Programs")}
        emptyStateText="No programs yet. Build a training block to start assigning workouts to athletes."
        showAiAssist
        showSelfAssign
        libraryTabs={
          <LibraryTabs
            active="programs"
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
