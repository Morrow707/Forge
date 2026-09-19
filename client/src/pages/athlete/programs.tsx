import { ProgramListPage } from "@/pages/program-list";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { LibraryTabs } from "@/components/library-tabs";
import { useSkillsAccess } from "@/hooks/use-skills-access";

export default function AthletePrograms() {
  // Skills moved onto the camera tier (see FreeAgentTierDef.hasSkills), so the Skill Programs tab
  // has to stop being drawn for a Free Agent on Basic or AI Coach -- the routes behind it answer
  // 402 now, and a tab that always errors is worse than no tab. Explicit true: undefined means
  // the server has not answered, and flashing the tab in or out is worse than one quiet frame.
  const showSkills = useSkillsAccess()?.allowed === true;
  return (
    <FreeAgentGate>
      <ProgramListPage
        apiBase="/api/athlete"
        routeBase="/athlete/programs"
        title="My Programs"
        emptyStateText="Start from a Forge template below, or hit New Program to build your own from scratch."
        showAssign={false}
        showSelfAssign
        libraryTabs={
          <LibraryTabs
            active="programs"
            programsHref="/athlete/programs"
            exercisesHref="/athlete/exercises"
            skillProgramsHref="/athlete/skill-programs"
            skillBankHref="/athlete/skills"
            showBanks={false}
            hiddenSections={showSkills ? undefined : ["skillPrograms", "skillBank"]}
          />
        }
      />
    </FreeAgentGate>
  );
}
