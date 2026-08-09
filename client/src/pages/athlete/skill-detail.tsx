import { SkillDetailPage } from "@/pages/skill-detail";
import { FreeAgentGate } from "@/components/free-agent-gate";

export default function AthleteSkillDetail() {
  return (
    <FreeAgentGate title="Skill Library">
      <SkillDetailPage apiBase="/api/athlete" routeBase="/athlete/skills" />
    </FreeAgentGate>
  );
}
