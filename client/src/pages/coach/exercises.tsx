import { ExerciseBankPage } from "@/pages/exercise-bank";
import { LibraryTabs } from "@/components/library-tabs";

export default function CoachExercises() {
  return (
    <ExerciseBankPage
      apiBase="/api/coach"
      routeBase="/coach/exercises"
      title="Exercise Bank"
      emptyStateText="Your exercise bank is empty. Add your first exercise to start building programs."
      libraryTabs={
        <LibraryTabs
          active="exercises"
          programsHref="/coach/programs"
          exercisesHref="/coach/exercises"
          skillProgramsHref="/coach/skill-programs"
          skillBankHref="/coach/skills"
          classesHref="/coach/classes"
        />
      }
    />
  );
}
