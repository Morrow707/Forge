import { ClassListPage } from "@/pages/class-list";

export default function CoachClasses() {
  return (
    <ClassListPage
      apiBase="/api/coach"
      routeBase="/coach/classes"
      title="Classes"
      emptyStateText="No Classes yet. Build a self-guided curriculum your athletes work through lesson by lesson."
    />
  );
}
