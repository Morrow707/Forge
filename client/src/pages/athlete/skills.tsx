import { SkillBankPage } from "@/pages/skill-bank";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { LibraryTabs } from "@/components/library-tabs";

export default function AthleteSkills() {
  return (
    <FreeAgentGate title="Skill Library">
      <SkillBankPage
        apiBase="/api/athlete"
        routeBase="/athlete/skills"
        title="Skill Library"
        emptyStateText="No skill drills match your filters."
        showCreate={false}
        libraryTabs={
          <LibraryTabs
            active="skill-bank"
            programsHref="/athlete/programs"
            exercisesHref="/athlete/exercises"
            skillProgramsHref="/athlete/skill-programs"
            skillBankHref="/athlete/skills"
          />
        }
      />
    </FreeAgentGate>
  );
}
