import { ProgramListPage } from "@/pages/program-list";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { LibraryTabs } from "@/components/library-tabs";

export default function AthletePrograms() {
  return (
    <FreeAgentGate>
      <ProgramListPage
        apiBase="/api/athlete"
        routeBase="/athlete/programs"
        title="My Programs"
        emptyStateText="Start from a Forge template below, or hit New Program to build your own from scratch."
        showAssign={false}
        showSelfAssign
        libraryTabs={
          <LibraryTabs
            active="programs"
            programsHref="/athlete/programs"
            exercisesHref="/athlete/exercises"
            skillProgramsHref="/athlete/skill-programs"
            skillBankHref="/athlete/skills"
            showBanks={false}
          />
        }
      />
    </FreeAgentGate>
  );
}
