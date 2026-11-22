import { ProgramListPage } from "@/pages/program-list";
import { useT } from "@/i18n";

export default function AdminPrograms() {
  const t = useT();
  return (
    <ProgramListPage
      apiBase="/api/admin"
      routeBase="/admin/programs"
      title={t("Forge Programs")}
      emptyStateText={t("The Forge program library is empty. Build the first official template for every coach to use.")}
      showAssign={false}
      showAiAssist
      showSelfAssign
    />
  );
}
