import { ExerciseDetailPage } from "@/pages/exercise-detail";
import { FreeAgentGate } from "@/components/free-agent-gate";

export default function AthleteExerciseDetail() {
  return (
    <FreeAgentGate title="Exercise Library">
      <ExerciseDetailPage apiBase="/api/athlete" routeBase="/athlete/exercises" />
    </FreeAgentGate>
  );
}
