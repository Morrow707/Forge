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
      libraryTabs={
        <LibraryTabs active="programs" programsHref="/coach/programs" exercisesHref="/coach/exercises" />
      }
    />
  );
}
