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
        emptyStateText="Nothing here yet -- hit New Program and the AI will ask what you're trying to achieve, then build it with you."
        showAssign={false}
        aiFirstCreate
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
