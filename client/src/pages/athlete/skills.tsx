import { LibraryBankRemoved } from "@/components/library-bank-removed";
import { SkillsGate } from "@/components/skills-gate";

// Same reasoning as athlete/exercises.tsx -- a Free Agent works through the
// AI-built Skill Programs, not a standalone Skill Bank browse page.
//
// Still behind SkillsGate even though it renders no skill data: its whole content is a link to
// /athlete/skill-programs, which IS gated, so without this an athlete on Basic or AI Coach is
// pointed at a page that turns them away. One answer, given once, in the right place.
export default function AthleteSkills() {
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
