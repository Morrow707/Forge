import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** THE FIRST-RUN QUEUE. Three modals are due on a first sign-in and every one of them was
 * mounted independently, each deciding for itself that it was due: the terms re-acceptance
 * gate (App.tsx), and the two camera notices (AppShell). They all said yes at once, so three
 * overlays stacked on top of each other, and because each one draws its own blocking layer
 * nothing underneath was tappable -- the audit found the roster's "Teams" tab dead behind them.
 *
 * The fix is not to change any dialog's content, its dismissibility, or when it is due. It is
 * only that they take turns. Each one declares that it WANTS the screen; this hands the screen
 * to exactly one of them at a time, in the order below, and passes it along when that one
 * stops wanting it (accepted, dismissed, or no longer due).
 *
 * ORDER, and why. The terms gate is first because it is a contract -- it is non-dismissable by
 * design and the other two are acknowledgments, so anything in front of it would be a dialog
 * asking someone to click through before the thing they cannot click through. Then the 2D
 * notice (a fact about THIS DEVICE, which frames the next one), then the accuracy notice (a
 * fact about the pipeline everywhere).
 */
export const FIRST_RUN_DIALOG_ORDER = [
  "terms-reacceptance",
  "non-ios-tracking",
  "camera-accuracy",
] as const;

export type FirstRunDialogSlot = (typeof FIRST_RUN_DIALOG_ORDER)[number];

type FirstRunDialogContextValue = {
  active: FirstRunDialogSlot | null;
  request: (slot: FirstRunDialogSlot, wants: boolean) => void;
};

const FirstRunDialogContext = createContext<FirstRunDialogContextValue | null>(null);

export function FirstRunDialogProvider({ children }: { children: ReactNode }) {
  const [waiting, setWaiting] = useState<Partial<Record<FirstRunDialogSlot, boolean>>>({});

  const request = useCallback((slot: FirstRunDialogSlot, wants: boolean) => {
    setWaiting((prev) => (prev[slot] === wants ? prev : { ...prev, [slot]: wants }));
  }, []);

  const active = useMemo(
    () => FIRST_RUN_DIALOG_ORDER.find((slot) => waiting[slot] === true) ?? null,
    [waiting],
  );

  const value = useMemo(() => ({ active, request }), [active, request]);

  return <FirstRunDialogContext.Provider value={value}>{children}</FirstRunDialogContext.Provider>;
}

/** `wants` is the dialog's own, unchanged answer to "am I due?". The return value is whether it
 * is ALSO its turn. A dialog that is due but not yet active renders nothing and keeps its place
 * in the queue; it is not dismissed, and nothing about its own condition is altered.
 *
 * With no provider above it -- a dialog rendered on its own, or in a test -- this returns `wants`
 * unchanged, so the sequencer can never be the reason a notice fails to appear.
 */
export function useFirstRunDialogSlot(slot: FirstRunDialogSlot, wants: boolean): boolean {
  const ctx = useContext(FirstRunDialogContext);
  const request = ctx?.request;

  useEffect(() => {
    if (!request) return;
    request(slot, wants);
    // Releasing on unmount matters as much as releasing on dismiss: an unmounted dialog that
    // still held the slot would stop the next one from ever opening.
    return () => request(slot, false);
  }, [request, slot, wants]);

  if (!ctx) return wants;
  return ctx.active === slot;
}
