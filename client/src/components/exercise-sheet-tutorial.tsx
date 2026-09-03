import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { colorForLabel } from "@/lib/supersets";
import { GraduationCap, ChevronDown, Link2 } from "lucide-react";

const SEEN_KEY = "forge:exercise-sheet-tutorial-seen";

/** One-time walkthrough of the exercise (workout day) sheet -- what the
 * badge letters/colors mean, how the set-pager rail works (tap or swipe),
 * and where to actually log a set. Shown once ever per device (a
 * localStorage flag, same pattern as NonIosTrackingNotice) the first time
 * this screen renders for a real training day, and never again after
 * being dismissed. Every sample below is built from the exact same
 * classes the real sheet uses (colorForLabel, bg-amber-400, ring-orange-
 * 400, ...) so it stays accurate if that styling ever changes -- not a
 * separate illustration that can drift out of sync. */
export function ExerciseSheetTutorial() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SEEN_KEY) !== "1";
  });

  function dismiss() {
    window.localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            How This Screen Works
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <TutorialRow
            sample={
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                  colorForLabel("A"),
                )}
              >
                A1
              </span>
            }
            title="Colored letter badges"
            body="Each exercise gets a letter. Two exercises sharing a letter (A1, A2, ...) are a superset -- back-to-back, same color, same border down the left edge of the card."
          />

          <TutorialRow
            sample={
              <div className="flex gap-1.5">
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-black">
                  Set 1
                </span>
                <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-black">
                  Set 2
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-black ring-2 ring-orange-400 ring-offset-1 ring-offset-background">
                  Set 3
                </span>
              </div>
            }
            title="The set pager"
            body={
              <>
                White = not logged yet, gold = done. The bright ring marks whichever set you're
                currently looking at. Tap a pill to jump straight to that set, or just swipe left
                and right on an open exercise to move between sets.
              </>
            }
          />

          <TutorialRow
            sample={
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="truncate text-sm font-semibold text-foreground">Exercise name</span>
                {" "}
                <Link2 className="h-4 w-4 text-primary" />
                <ChevronDown className="h-4 w-4" />
              </div>
            }
            title="Tap the name to open it"
            body="Only one exercise stays open at a time. A link icon means it's chained to the next one in a superset -- everything for today is always listed, whether it's expanded or not."
          />

          <TutorialRow
            sample={
              <div className="grid w-full max-w-[180px] grid-cols-2 gap-1.5">
                <div className="rounded border border-border px-2 py-1 text-center text-[10px] text-muted-foreground">
                  REPS
                </div>
                <div className="rounded border border-border px-2 py-1 text-center text-[10px] text-muted-foreground">
                  WEIGHT
                </div>
              </div>
            }
            title="Log what you actually did"
            body="Type reps and weight for the set you're viewing, then rate how it felt (RPE) if your coach uses it. A camera icon next to a set means video tracking is on for that exercise -- optional, on top of the numbers you type."
          />
        </div>

        <DialogFooter>
          <Button onClick={dismiss} className="w-full">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TutorialRow({
  sample,
  title,
  body,
}: {
  sample: ReactNode;
  title: string;
  body: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-[2rem] items-center">{sample}</div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
