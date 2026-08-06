import { ProgramBuilderPage } from "@/pages/program-builder";

export default function CoachProgramBuilder() {
  return <ProgramBuilderPage apiBase="/api/coach" routeBase="/coach/programs" showAiChat />;
}
