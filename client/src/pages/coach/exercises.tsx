import { ExerciseBankPage } from "@/pages/exercise-bank";

export default function CoachExercises() {
  return (
    <ExerciseBankPage
      apiBase="/api/coach"
      routeBase="/coach/exercises"
      title="Exercise Bank"
      emptyStateText="Your exercise bank is empty. Add your first exercise to start building programs."
    />
  );
}
