import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getJson } from "@/lib/queryClient";
import { TrophyCase, type AthleteTrophyView } from "@/components/trophy-case";

export function TrophyCaseDialog({
  open,
  onOpenChange,
  athleteName,
  fetchUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteName: string;
  fetchUrl: string;
}) {
  const { data = [], isLoading } = useQuery<AthleteTrophyView[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{athleteName}'s Trophy Case</DialogTitle>
          <DialogDescription>
            Workout-count milestones, consistency streaks, and PR milestones -- every one they've
            ever unlocked.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-surface" />
        ) : (
          <TrophyCase trophies={data} emptyHint="No trophies unlocked yet." />
        )}
      </DialogContent>
    </Dialog>
  );
}
