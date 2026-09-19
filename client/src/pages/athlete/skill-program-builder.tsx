import { SkillProgramBuilderPage } from "@/pages/skill-program-builder";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { SkillsGate } from "@/components/skills-gate";

// Gate order as in athlete/skill-programs.tsx -- coach question first, tier question second.
export default function AthleteSkillProgramBuilder() {
  return (
    <FreeAgentGate title="My Skill Programs">
      <SkillsGate title="My Skill Programs">
        <SkillProgramBuilderPage
          apiBase="/api/athlete"
          routeBase="/athlete/skill-programs"
          showAssign={false}
          showAiChat
        />
      </SkillsGate>
    </FreeAgentGate>
  );
}
