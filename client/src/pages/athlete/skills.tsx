import { LibraryBankRemoved } from "@/components/library-bank-removed";

// Same reasoning as athlete/exercises.tsx -- a Free Agent works through the
// AI-built Skill Programs, not a standalone Skill Bank browse page.
export default function AthleteSkills() {
  return (
    <LibraryBankRemoved
      title="Skill Library"
      redirectTo="/athlete/skill-programs"
      redirectLabel="Go to My Skill Programs"
    />
  );
}
