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
          /* THE EXERCISE LIBRARY IS NOT A PAID FEATURE, ON ANY TIER. Scott, 2026-10-02:
             "the basic free agents have access to the exercise library, but the upper one ...
             doesn't. I built it like that, but let's revert back, let all free agents have the
             exercise library." `showBanks={false}` used to hide BOTH banks for every athlete on
             the reasoning that a Free Agent is guided by the AI and does not need a browse page.
             Browsing what the movements ARE is the part of this product that needs no coach, no
             subscription and no camera, and it is already listed as what Basic keeps. Skill Bank
             stays behind `hiddenSections`, because skills really are on the camera tier and the
             routes behind that tab answer 402. */
            hiddenSections={showSkills ? undefined : ["skillPrograms", "skillBank"]}
          />
        }
      />
    </FreeAgentGate>
  );
}
