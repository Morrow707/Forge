import { SkillBankPage } from "@/pages/skill-bank";
import { LibraryTabs } from "@/components/library-tabs";

export default function CoachSkills() {
  return (
    <SkillBankPage
      apiBase="/api/coach"
      routeBase="/coach/skills"
      title="Skill Bank"
      emptyStateText="Your Skill Bank is empty. Add your first drill to start building skill programs."
      libraryTabs={
        <LibraryTabs
          active="skills"
          programsHref="/coach/programs"
          exercisesHref="/coach/exercises"
          skillsHref="/coach/skills"
        />
      }
    />
  );
}
