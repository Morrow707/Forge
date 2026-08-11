import { ProgramListPage } from "@/pages/program-list";
import { LibraryTabs } from "@/components/library-tabs";

export default function CoachPrograms() {
  return (
    <ProgramListPage
      apiBase="/api/coach"
      routeBase="/coach/programs"
      title="Programs"
      emptyStateText="No programs yet. Build a training block to start assigning workouts to athletes."
      showAiAssist
      showSelfAssign
      libraryTabs={
        <LibraryTabs
          active="programs"
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
