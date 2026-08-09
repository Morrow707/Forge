import { ClassListPage } from "@/pages/class-list";
import { LibraryTabs } from "@/components/library-tabs";

export default function CoachClasses() {
  return (
    <ClassListPage
      apiBase="/api/coach"
      routeBase="/coach/classes"
      title="Classes"
      emptyStateText="No Classes yet. Build a self-guided curriculum your athletes work through lesson by lesson."
      libraryTabs={
        <LibraryTabs
          active="classes"
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
