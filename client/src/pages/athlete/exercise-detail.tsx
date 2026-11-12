import { Redirect, useParams } from "wouter";
import { ExerciseDetailPage } from "@/pages/exercise-detail";
import { FreeAgentGate } from "@/components/free-agent-gate";

// One exercise from the Free Agent's library: instructions, demo video, muscles, how to film it.
// Read only. The shared page draws Edit and Delete behind `exercise.editable`, which the server
// answers false for everything an athlete can see, and there is no athlete route that creates or
// changes an exercise. `/athlete/exercises/new` would open the shared page's blank create form
// against a route that does not exist, so that address goes back to the list.
export default function AthleteExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  if (id === "new") return <Redirect to="/athlete/exercises" replace />;
  return (
    <FreeAgentGate title="Exercise Library">
      <ExerciseDetailPage apiBase="/api/athlete" routeBase="/athlete/exercises" />
    </FreeAgentGate>
  );
}
