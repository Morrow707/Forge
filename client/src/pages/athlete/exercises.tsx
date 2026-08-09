import { ExerciseBankPage } from "@/pages/exercise-bank";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { LibraryTabs } from "@/components/library-tabs";

export default function AthleteExercises() {
  return (
    <FreeAgentGate title="Exercise Library">
      <ExerciseBankPage
        apiBase="/api/athlete"
        routeBase="/athlete/exercises"
        title="Exercise Library"
        emptyStateText="No exercises match your filters."
        showCreate={false}
        libraryTabs={
          <LibraryTabs
            active="exercises"
            programsHref="/athlete/programs"
            exercisesHref="/athlete/exercises"
            skillProgramsHref="/athlete/skill-programs"
            skillBankHref="/athlete/skills"
          />
        }
      />
    </FreeAgentGate>
  );
}
