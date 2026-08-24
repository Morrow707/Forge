import { LibraryBankRemoved } from "@/components/library-bank-removed";

// A Free Agent is guided entirely by the AI -- no standalone browsing of the
// raw Exercise Bank, just the AI-built Programs those exercises already live
// inside (exercise substitution still works from within a program, this is
// only the "browse everything on your own" destination). A coached athlete
// was already blocked from this route by the old FreeAgentGate (their nav
// doesn't even show Library); this now blocks a Free Agent the same way, so
// no athlete of either kind lands on a real Exercise Bank browse page.
export default function AthleteExercises() {
  return (
    <LibraryBankRemoved
      title="Exercise Library"
      redirectTo="/athlete/programs"
      redirectLabel="Go to My Programs"
    />
  );
}
