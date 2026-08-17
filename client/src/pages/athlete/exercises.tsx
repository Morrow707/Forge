import { LibraryBankRemoved } from "@/components/library-bank-removed";

export default function AthleteExercises() {
  return (
    <LibraryBankRemoved
      title="Exercise Library"
      redirectTo="/athlete/programs"
      redirectLabel="Go to My Programs"
    />
  );
}
