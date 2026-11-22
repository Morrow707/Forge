import { SkillBankPage } from "@/pages/skill-bank";
import { useT } from "@/i18n";

export default function AdminSkills() {
  const t = useT();
  return (
    <SkillBankPage
      apiBase="/api/admin"
      routeBase="/admin/skills"
      title={t("Forge Skill Bank")}
      emptyStateText={t("The Forge Skill Bank is empty. Add the first official drill for every coach to use.")}
    />
  );
}
