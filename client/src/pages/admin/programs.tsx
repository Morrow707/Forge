import { ProgramListPage } from "@/pages/program-list";

export default function AdminPrograms() {
  return (
    <ProgramListPage
      apiBase="/api/admin"
      routeBase="/admin/programs"
      title="Forge Programs"
      emptyStateText="The Forge program library is empty. Build the first official template for every coach to use."
      showAssign={false}
      showAiAssist
      showSelfAssign
    />
  );
}
