import { ProgramBuilderPage } from "@/pages/program-builder";

export default function AdminProgramBuilder() {
  return <ProgramBuilderPage apiBase="/api/admin" routeBase="/admin/programs" showAssign={false} />;
}
