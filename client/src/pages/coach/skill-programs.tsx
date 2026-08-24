import { SkillProgramListPage } from "@/pages/skill-program-list";
import { LibraryTabs } from "@/components/library-tabs";
import { CoachSectionGate } from "@/components/coach-section-gate";
import { useAuth } from "@/hooks/use-auth";

export default function CoachSkillPrograms() {
  const { user } = useAuth();
  return (
    <CoachSectionGate section="skillPrograms">
      <SkillProgramListPage
        apiBase="/api/coach"
        routeBase="/coach/skill-programs"
        title="Skill Programs"
        emptyStateText="No skill programs yet. Build one to start assigning skill work to athletes."
        libraryTabs={
          <LibraryTabs
            active="skill-programs"
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
