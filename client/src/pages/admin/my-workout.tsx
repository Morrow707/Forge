import { WorkoutPage } from "@/pages/workout";

export default function AdminMyWorkout() {
  return (
    <WorkoutPage
      apiBase="/api/admin/my"
      routeBase="/admin/my"
      showComments={false}
      showReadinessBanner={false}
    />
  );
}
