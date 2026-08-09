import { SkillBankPage } from "@/pages/skill-bank";
import { LibraryTabs } from "@/components/library-tabs";

export default function CoachSkills() {
  return (
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
        />
      }
    />
  );
}
