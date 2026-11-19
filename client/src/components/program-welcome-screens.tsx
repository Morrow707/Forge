import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";

/**
 * A PROGRAM'S WELCOME SCREENS (2026-11-19): up to three screens the coach writes, shown once to a
 * new athlete on the program. Closing it at any point counts as seen, so it never comes back as a
 * wall in front of a workout.
 */
type Screen = { title: string; body: string };

export function ProgramWelcomeScreens({ screens, programName }: { screens: Screen[]; programName: string | null }) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const markSeen = useMutation({
    mutationFn: () => apiRequest("POST", "/api/athlete/program-welcome-seen", {}),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });
  const screen = screens[Math.min(index, screens.length - 1)];
  const last = index >= screens.length - 1;

  function close() {
    setOpen(false);
    markSeen.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md" data-testid="program-welcome-screens">
        <DialogHeader>
          <DialogTitle>{screen.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{screen.body}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {programName ? `${programName} · ` : ""}
            {index + 1} of {screens.length}
          </p>
          <Button onClick={() => (last ? close() : setIndex(index + 1))}>{last ? "Let's go" : "Next"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
