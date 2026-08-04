import { ProgramBuilderPage } from "@/pages/program-builder";
import { FreeAgentGate } from "@/components/free-agent-gate";

export default function AthleteProgramBuilder() {
  return (
    <FreeAgentGate>
      <ProgramBuilderPage
        apiBase="/api/athlete"
        routeBase="/athlete/programs"
        showAssign={false}
        showAiChat
      />
    </FreeAgentGate>
  );
}
