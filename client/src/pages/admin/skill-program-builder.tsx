import { SkillProgramBuilderPage } from "@/pages/skill-program-builder";

export default function AdminSkillProgramBuilder() {
  return <SkillProgramBuilderPage apiBase="/api/admin" routeBase="/admin/skill-programs" showAssign={false} />;
}
