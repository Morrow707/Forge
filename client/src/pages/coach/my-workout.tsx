import { WorkoutPage } from "@/pages/workout";

export default function CoachMyWorkout() {
  return (
    <WorkoutPage
      apiBase="/api/coach/my"
      routeBase="/coach/my"
      showComments={false}
      showReadinessBanner={false}
      programsApiBase="/api/coach"
    />
  );
}
