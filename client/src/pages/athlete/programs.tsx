import { ProgramListPage } from "@/pages/program-list";
import { FreeAgentGate } from "@/components/free-agent-gate";

export default function AthletePrograms() {
  return (
    <FreeAgentGate>
      <ProgramListPage
        apiBase="/api/athlete"
        routeBase="/athlete/programs"
        title="My Programs"
        emptyStateText="Nothing here yet -- build a program by hand, duplicate a Forge template, or try AI Assist (a paid upgrade, coming soon)."
        showAssign={false}
        showAiAssist
        showSelfAssign
      />
    </FreeAgentGate>
  );
}
