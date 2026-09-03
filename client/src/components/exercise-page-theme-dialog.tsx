import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Lock, Sparkles } from "lucide-react";
import { ColorField } from "@/components/color-field";
import { BILLING_ADD_ONS, formatCents } from "@shared/billing-tiers";
import type { ExercisePageTheme } from "@shared/schema";

const QUERY_KEY = ["/api/coach/exercise-page-theme"];

type ThemeResponse = { theme: ExercisePageTheme; entitled: boolean };

/** Personal Page (paid add-on, shared/billing-tiers.ts) editor: recolors a
 * coach's athletes' real exercise-logging screen (client/src/pages/
 * workout.tsx) -- the bottom action bar, the Watch Demo button, the
 * completed-set indicator, and the set-paging arrows. Unlike
 * TeamBrandingDialog (which silently drops whichever fields aren't
 * entitled and saves the rest), this whole dialog is either locked -- an
 * upsell, nothing editable -- or fully unlocked, matching how the feature
 * itself is gated (see server/routes.ts's PATCH handler: a 402, not a
 * partial save, when the org isn't entitled). */
export function ExercisePageThemeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ThemeResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => getJson("/api/coach/exercise-page-theme"),
    enabled: open,
  });

  const [backdropColor, setBackdropColor] = useState("");
  const [watchDemoColor, setWatchDemoColor] = useState("");
  const [completedSetColor, setCompletedSetColor] = useState("");
  const [navArrowColor, setNavArrowColor] = useState("");

  // Only re-seed once per dialog-open (same convention as
  // TeamBrandingDialog) -- otherwise a background refetch mid-edit would
  // stomp whatever the coach has typed so far.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current || !data) return;
    setBackdropColor(data.theme.backdropColor ?? "");
    setWatchDemoColor(data.theme.watchDemoColor ?? "");
    setCompletedSetColor(data.theme.completedSetColor ?? "");
    setNavArrowColor(data.theme.navArrowColor ?? "");
    seededRef.current = true;
  }, [open, data]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
    // AppShell/workout.tsx both read this one -- has to refresh too or an
    // athlete's (or this coach's own) screen won't pick up the change until
    // reload.
    qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/coach/exercise-page-theme", {
        backdropColor: backdropColor || null,
        watchDemoColor: watchDemoColor || null,
        completedSetColor: completedSetColor || null,
        navArrowColor: navArrowColor || null,
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Exercise screen colors saved");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save those colors"),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/coach/exercise-page-theme", {
        backdropColor: null,
        watchDemoColor: null,
        completedSetColor: null,
        navArrowColor: null,
      }),
    onSuccess: () => {
      setBackdropColor("");
      setWatchDemoColor("");
      setCompletedSetColor("");
      setNavArrowColor("");
      invalidate();
      toast.success("Reset to Forge defaults");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't reset those colors"),
  });

  const entitled = data?.entitled ?? false;
  const hasAnyTheme = !!(backdropColor || watchDemoColor || completedSetColor || navArrowColor);
  const addOn = BILLING_ADD_ONS.personal_page;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            Exercise Screen Colors
          </DialogTitle>
          <DialogDescription>
            Recolor your athletes' real exercise-logging screen -- the bottom action bar, the
            Watch Demo button, the completed-set indicator, and the set-paging arrows.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : !entitled ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-4">
            <Lock className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Custom colors for your athletes' exercise screen are part of <b>{addOn.label}</b>, a{" "}
              {formatCents(addOn.monthlyPriceCents)}/mo add-on. Your athletes see Forge's own colors
              until then.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Bottom bar backdrop" value={backdropColor} onChange={setBackdropColor} />
              <ColorField label="Watch Demo button" value={watchDemoColor} onChange={setWatchDemoColor} />
              <ColorField label="Completed set" value={completedSetColor} onChange={setCompletedSetColor} />
              <ColorField label="Set-paging arrows" value={navArrowColor} onChange={setNavArrowColor} />
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Leave any field blank to keep Forge's own color for that piece.
            </p>
          </div>
        )}

        {entitled && (
          <DialogFooter className="gap-2 sm:justify-between">
            {hasAnyTheme && (
              <Button
                type="button"
                variant="outline"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                Reset to defaults
              </Button>
            )}
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save Colors"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
