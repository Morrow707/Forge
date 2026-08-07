import { SkillProgramBuilderPage } from "@/pages/skill-program-builder";

export default function CoachSkillProgramBuilder() {
  return <SkillProgramBuilderPage apiBase="/api/coach" routeBase="/coach/skill-programs" />;
}
