import { SkillProgramListPage } from "@/pages/skill-program-list";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { SkillsGate } from "@/components/skills-gate";
import { LibraryTabs } from "@/components/library-tabs";

// FreeAgentGate OUTSIDE SkillsGate, deliberately. A coached athlete has skills access but does
// not belong on the Free Agent skill-program builder at all, so the "you have a coach now" answer
// has to come first; the tier question only arises once we know they are a Free Agent.
export default function AthleteSkillPrograms() {
  return (
    <FreeAgentGate title="My Skill Programs">
      <SkillsGate title="My Skill Programs">
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
      </SkillsGate>
    </FreeAgentGate>
  );
}
