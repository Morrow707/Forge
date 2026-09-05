import { SkillProgramListPage } from "@/pages/skill-program-list";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { LibraryTabs } from "@/components/library-tabs";

export default function AthleteSkillPrograms() {
  return (
    <FreeAgentGate title="My Skill Programs">
      <SkillProgramListPage
        apiBase="/api/athlete"
        routeBase="/athlete/skill-programs"
        title="My Skill Programs"
        emptyStateText="Nothing here yet -- hit New Skill Program to build one."
        showAssign={false}
        showSelfAssign
        libraryTabs={
          <LibraryTabs
            active="skill-programs"
            programsHref="/athlete/programs"
            exercisesHref="/athlete/exercises"
            skillProgramsHref="/athlete/skill-programs"
            skillBankHref="/athlete/skills"
            showBanks={false}
          />
        }
      />
    </FreeAgentGate>
  );
}
