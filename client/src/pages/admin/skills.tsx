import { SkillBankPage } from "@/pages/skill-bank";

export default function AdminSkills() {
  return (
    <SkillBankPage
      apiBase="/api/admin"
      routeBase="/admin/skills"
      title="Forge Skill Bank"
      emptyStateText="The Forge Skill Bank is empty. Add the first official drill for every coach to use."
    />
  );
}
