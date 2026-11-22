import { SkillProgramBuilderPage } from "@/pages/skill-program-builder";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { SkillsGate } from "@/components/skills-gate";

import { useT } from "@/i18n";
// Gate order as in athlete/skill-programs.tsx -- coach question first, tier question second.
export default function AthleteSkillProgramBuilder() {
  const t = useT();
  return (
    <FreeAgentGate title={t("My Skill Programs")}>
      <SkillsGate title={t("My Skill Programs")}>
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
