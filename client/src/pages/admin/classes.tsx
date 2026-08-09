import { ClassListPage } from "@/pages/class-list";

export default function AdminClasses() {
  return (
    <ClassListPage
      apiBase="/api/admin"
      routeBase="/admin/classes"
      title="Forge Classes"
      emptyStateText="No Forge Classes yet. Build a self-guided curriculum any coach can assign, or a Free Agent can buy into lesson by lesson."
      showEnroll={false}
    />
  );
}
