import { ExerciseBankPage } from "@/pages/exercise-bank";

export default function AdminExercises() {
  return (
    <ExerciseBankPage
      apiBase="/api/admin"
      routeBase="/admin/exercises"
      title="Forge Library"
      emptyStateText="The Forge library is empty. Add the first official exercise for every coach to use."
    />
  );
}
