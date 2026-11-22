/**
 * THE POSITION AND TEAM LAYERS ON A WORKOUT DAY (2026-11-22). A Forge season program can carry
 * per-position swaps and care drills and a girls'-team warm-up addition
 * (shared/season-program-layers.ts); the server applies them from the assignment's season setup.
 * These two panels say which layers are on ("Position: pitcher", "Girls' team") and list the
 * position's extra care drills after the main work. Display only: nothing here is logged.
 */
import { Badge } from "@/components/ui/badge";

export type DayLayers = { labels: string[]; positionNote: string | null; girlsTeamNote: string | null };

export type LayerCareDrill = {
  exerciseId: number;
  sets: number | null;
  reps: string | null;
  load: string | null;
  restSeconds: number | null;
  label: string | null;
  exercise: { id: number; name: string };
};

const SECONDS_PER_MINUTE = 60;

function restText(seconds: number | null): string | null {
  if (seconds == null) return null;
  return seconds >= SECONDS_PER_MINUTE && seconds % SECONDS_PER_MINUTE === 0
    ? `rest ${seconds / SECONDS_PER_MINUTE} min`
    : `rest ${seconds}s`;
}

export function WorkoutLayerLabels({ layers }: { layers: DayLayers | null | undefined }) {
  if (!layers || layers.labels.length === 0) return null;
  const notes = [layers.positionNote, layers.girlsTeamNote].filter((n): n is string => !!n);
  return (
    <div className="space-y-1 rounded-md border p-3" data-testid="workout-layer-labels">
      <div className="flex flex-wrap gap-2">
        {layers.labels.map((label) => (
          <Badge key={label} variant="secondary">
            {label}
          </Badge>
        ))}
      </div>
      {notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}
    </div>
  );
}

export function WorkoutLayerCare({ drills }: { drills: LayerCareDrill[] | null | undefined }) {
  if (!drills || drills.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="workout-layer-care">
      <p className="text-sm font-medium">End-of-session care{drills[0].label ? ` (${drills[0].label})` : ""}</p>
      <ul className="space-y-1 text-sm">
        {drills.map((d) => (
          <li key={d.exerciseId}>
            {d.exercise.name}
            <span className="text-muted-foreground">
              {" "}
              {[d.sets != null ? `${d.sets} × ${d.reps ?? ""}`.trim() : d.reps, d.load, restText(d.restSeconds)]
                .filter(Boolean)
                .join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
