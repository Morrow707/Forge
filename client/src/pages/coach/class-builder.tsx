import { ClassBuilderPage } from "@/pages/class-builder";

export default function CoachClassBuilder() {
  return <ClassBuilderPage apiBase="/api/coach" routeBase="/coach/classes" />;
}
