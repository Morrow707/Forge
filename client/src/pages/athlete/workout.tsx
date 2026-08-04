import { WorkoutPage } from "@/pages/workout";

export default function AthleteWorkout() {
  return <WorkoutPage apiBase="/api/athlete" routeBase="/athlete" programsApiBase="/api/athlete" />;
}
