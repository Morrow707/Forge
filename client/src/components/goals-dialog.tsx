import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Target } from "lucide-react";
import { GoalsPanel } from "@/components/goals-panel";

/** Coach view of an athlete's goals -- same panel the athlete sees on their
 * own progress page, just wrapped in a dialog and reachable from the roster. */
export function GoalsDialog({
  open,
  onOpenChange,
  athleteName,
  goalsUrl,
  exercisesUrl,
  skillExercisesUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteName: string;
  goalsUrl: string;
  exercisesUrl: string;
  skillExercisesUrl?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {athleteName}'s Goals
          </DialogTitle>
          <DialogDescription>
            Set a target for a lift or testing metric and track progress toward it.
          </DialogDescription>
        </DialogHeader>
        <GoalsPanel
          goalsUrl={goalsUrl}
          exercisesUrl={exercisesUrl}
          skillExercisesUrl={skillExercisesUrl}
        />
      </DialogContent>
    </Dialog>
  );
}
