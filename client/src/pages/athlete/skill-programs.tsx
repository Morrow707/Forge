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
          emptyStateText="Nothing here yet, hit New Skill Program to build one."
          showAssign={false}
          showSelfAssign
          libraryTabs={
            <LibraryTabs
              active="skill-programs"
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
            />
          }
        />
      </SkillsGate>
    </FreeAgentGate>
  );
}
