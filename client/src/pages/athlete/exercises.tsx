import { ExerciseBankPage } from "@/pages/exercise-bank";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { LibraryTabs } from "@/components/library-tabs";
import { useSkillsAccess } from "@/hooks/use-skills-access";

// THE EXERCISE LIBRARY IS A REAL PAGE FOR EVERY FREE AGENT, ON EVERY PLAN. Scott, 2026-10-02:
// "let all free agents have the exercise library". The tab was put back on the Library strip that
// day and this page behind it was not: it went on drawing "there's no standalone bank to browse
// here", so the tab every Free Agent was given opened a card that sent them away again. The
// server half has been there throughout (GET /api/athlete/exercises, Free Agents only).
//
// Browse only: `showCreate={false}` hides New Exercise, and every row arrives `editable: false`
// for an athlete, so the shared page draws no edit or delete control. A coached athlete is
// stopped by FreeAgentGate, as on My Programs -- their exercises come from their coach.
export default function AthleteExercises() {
  // Same question, same answer as athlete/programs.tsx: the skills tabs are drawn only for an
  // account that may build a skill program, so the strip does not change shape between two tabs.
  const showSkills = useSkillsAccess()?.canRecord === true;
  return (
    <FreeAgentGate title="Exercise Library">
      <ExerciseBankPage
        apiBase="/api/athlete"
        routeBase="/athlete/exercises"
        title="Exercise Library"
        emptyStateText="No exercises to show yet."
        showCreate={false}
        libraryTabs={
          <LibraryTabs
            active="exercises"
            programsHref="/athlete/programs"
            exercisesHref="/athlete/exercises"
            skillProgramsHref="/athlete/skill-programs"
            skillBankHref="/athlete/skills"
            hiddenSections={showSkills ? undefined : ["skillPrograms", "skillBank"]}
          />
        }
      />
    </FreeAgentGate>
  );
}
