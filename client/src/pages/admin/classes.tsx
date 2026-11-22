import { ClassListPage } from "@/pages/class-list";
import { useT } from "@/i18n";

export default function AdminClasses() {
  const t = useT();
  return (
    <ClassListPage
      apiBase="/api/admin"
      routeBase="/admin/classes"
      title={t("Forge Classes")}
      emptyStateText={t("No Forge Classes yet. Build a self-guided curriculum any coach can assign, or a Free Agent can buy into lesson by lesson.")}
      showEnroll={false}
      showAiDraft
    />
  );
}
