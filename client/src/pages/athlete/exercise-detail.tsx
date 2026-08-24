import { LibraryBankRemoved } from "@/components/library-bank-removed";

// Same removal as athlete/exercises.tsx (see that file and
// library-bank-removed.tsx's own comment) -- this used to mount the full,
// edit/delete-capable ExerciseDetailPage behind only a FreeAgentGate, which
// blocks a coached athlete but lets a Free Agent straight through to a real
// editable page for a feature that's gone for every athlete now, coached or
// not. No in-app link points here anymore; this just catches a stale
// bookmark the same way the list page above it does.
export default function AthleteExerciseDetail() {
  return (
    <LibraryBankRemoved
      title="Exercise Library"
      redirectTo="/athlete/programs"
      redirectLabel="Go to My Programs"
    />
  );
}
