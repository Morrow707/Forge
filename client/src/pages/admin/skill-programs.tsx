import { SkillProgramListPage } from "@/pages/skill-program-list";

export default function AdminSkillPrograms() {
  return (
    <SkillProgramListPage
      apiBase="/api/admin"
      routeBase="/admin/skill-programs"
      title="Forge Skill Programs"
      emptyStateText="The Forge skill program library is empty. Build the first official template from the Skill Bank for every coach to use."
      showAssign={false}
    />
  );
}
