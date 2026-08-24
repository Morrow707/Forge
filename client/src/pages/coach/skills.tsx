import { SkillBankPage } from "@/pages/skill-bank";
import { LibraryTabs } from "@/components/library-tabs";
import { CoachSectionGate } from "@/components/coach-section-gate";
import { useAuth } from "@/hooks/use-auth";

export default function CoachSkills() {
  const { user } = useAuth();
  return (
    <CoachSectionGate section="skillBank">
      <SkillBankPage
        apiBase="/api/coach"
        routeBase="/coach/skills"
        title="Skill Bank"
        emptyStateText="Your Skill Bank is empty. Add your first drill to start building skill programs."
        showFaultSettings
        libraryTabs={
          <LibraryTabs
            active="skill-bank"
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
