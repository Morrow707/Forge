import { ClassListPage } from "@/pages/class-list";
import { LibraryTabs } from "@/components/library-tabs";
import { CoachSectionGate } from "@/components/coach-section-gate";
import { useAuth } from "@/hooks/use-auth";

export default function CoachClasses() {
  const { user } = useAuth();
  return (
    <CoachSectionGate section="classes">
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
            hiddenSections={user?.hiddenSections}
          />
        }
      />
    </CoachSectionGate>
  );
}
