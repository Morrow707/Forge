import { SkillProgramListPage } from "@/pages/skill-program-list";
import { useT } from "@/i18n";

export default function AdminSkillPrograms() {
  const t = useT();
  return (
    <SkillProgramListPage
      apiBase="/api/admin"
      routeBase="/admin/skill-programs"
      title={t("Forge Skill Programs")}
      emptyStateText={t("The Forge skill program library is empty. Build the first official template from the Skill Bank for every coach to use.")}
      showAssign={false}
    />
  );
}
