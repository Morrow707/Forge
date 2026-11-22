import { LibraryBankRemoved } from "@/components/library-bank-removed";
import { SkillsGate } from "@/components/skills-gate";

import { useT } from "@/i18n";
// Same removal as athlete/skills.tsx -- see athlete/exercise-detail.tsx's
// comment for why FreeAgentGate alone wasn't the right gate here anymore, and
// athlete/skills.tsx for why the redirect stub is gated too.
export default function AthleteSkillDetail() {
  const t = useT();
  return (
    <SkillsGate title={t("Skill Library")}>
      <LibraryBankRemoved
        title={t("Skill Library")}
        redirectTo="/athlete/skill-programs"
        redirectLabel="Go to My Skill Programs"
      />
    </SkillsGate>
  );
}
