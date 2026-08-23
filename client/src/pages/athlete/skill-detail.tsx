import { LibraryBankRemoved } from "@/components/library-bank-removed";

// Same removal as athlete/skills.tsx -- see athlete/exercise-detail.tsx's
// comment for why FreeAgentGate alone wasn't the right gate here anymore.
export default function AthleteSkillDetail() {
  return (
    <LibraryBankRemoved
      title="Skill Library"
      redirectTo="/athlete/skill-programs"
      redirectLabel="Go to My Skill Programs"
    />
  );
}
