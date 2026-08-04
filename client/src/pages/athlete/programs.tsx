import { ProgramListPage } from "@/pages/program-list";

export default function AthletePrograms() {
  return (
    <ProgramListPage
      apiBase="/api/athlete"
      routeBase="/athlete/programs"
      title="My Programs"
      emptyStateText="Nothing here yet -- describe what you want to train and the AI will build it, or duplicate a Forge template to start from."
      showAssign={false}
      showAiAssist
      showSelfAssign
    />
  );
}
