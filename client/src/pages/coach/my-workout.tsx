import { WorkoutPage } from "@/pages/workout";

export default function CoachMyWorkout() {
  return (
    <WorkoutPage
      apiBase="/api/coach/my"
      routeBase="/coach/my"
      showComments={false}
      showReadinessBanner={false}
      // The self-assigned program itself is one of the coach's own, living
      // under /api/coach/programs -- not /api/admin/programs (the default,
      // wrong here) or /api/coach/my (the "training" namespace this page's
      // apiBase points at, which has no /programs routes of its own).
      programsApiBase="/api/coach"
    />
  );
}
