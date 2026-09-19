import { LibraryBankRemoved } from "@/components/library-bank-removed";
import { SkillsGate } from "@/components/skills-gate";

// Same removal as athlete/skills.tsx -- see athlete/exercise-detail.tsx's
// comment for why FreeAgentGate alone wasn't the right gate here anymore, and
// athlete/skills.tsx for why the redirect stub is gated too.
export default function AthleteSkillDetail() {
  return (
    <SkillsGate title="Skill Library">
      <LibraryBankRemoved
        title="Skill Library"
        redirectTo="/athlete/skill-programs"
        redirectLabel="Go to My Skill Programs"
      />
    </SkillsGate>
  );
}
