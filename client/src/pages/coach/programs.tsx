import { ProgramListPage } from "@/pages/program-list";

export default function CoachPrograms() {
  return (
    <ProgramListPage
      apiBase="/api/coach"
      routeBase="/coach/programs"
      title="Programs"
      emptyStateText="No programs yet. Build a training block to start assigning workouts to athletes."
    />
  );
}
