import { SkillProgramBuilderPage } from "@/pages/skill-program-builder";
import { FreeAgentGate } from "@/components/free-agent-gate";

export default function AthleteSkillProgramBuilder() {
  return (
    <FreeAgentGate title="My Skill Programs">
      <SkillProgramBuilderPage
        apiBase="/api/athlete"
        routeBase="/athlete/skill-programs"
        showAssign={false}
        showAiChat
      />
    </FreeAgentGate>
  );
}
