import { ExerciseDetailPage } from "@/pages/exercise-detail";

export default function AdminExerciseDetail() {
  return <ExerciseDetailPage apiBase="/api/admin" routeBase="/admin/exercises" />;
}
