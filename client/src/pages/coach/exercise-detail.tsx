import { ExerciseDetailPage } from "@/pages/exercise-detail";

export default function CoachExerciseDetail() {
  return <ExerciseDetailPage apiBase="/api/coach" routeBase="/coach/exercises" />;
}
