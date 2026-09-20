import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIRST_RUN_DIALOG_ORDER } from "@/hooks/use-first-run-dialogs";

const SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const app = read("App.tsx");
const shell = read("components/app-shell.tsx");
const sequencer = read("hooks/use-first-run-dialogs.tsx");
const terms = read("components/terms-reacceptance-gate.tsx");
const nonIos = read("components/non-ios-tracking-warning.tsx");
const accuracy = read("components/camera-accuracy-notice.tsx");

// THE BUG. On a coach's first sign-in the terms re-acceptance gate, the 2D-camera notice and the
// camera-accuracy notice all decided independently that they were due and all opened at once.
// Each draws its own blocking layer, so the app underneath was inert -- the runtime audit found
// the roster's "Teams" tab untappable behind the stack. Source-scanned like the other wiring
// tests in this directory: what matters is that all three go through the one queue, and that the
// queue's order puts the contract first. None of that needs a DOM.
describe("the first-run dialogs take turns", () => {
  it("hands the screen out in one order: terms, then 2D device, then accuracy", () => {
    expect([...FIRST_RUN_DIALOG_ORDER]).toEqual([
      "terms-reacceptance",
      "non-ios-tracking",
      "camera-accuracy",
    ]);
  });

  it("gives the slot to the first waiting dialog in that order, not to whoever asked last", () => {
    expect(sequencer).toContain("FIRST_RUN_DIALOG_ORDER.find((slot) => waiting[slot] === true)");
  });

  it("is provided above BOTH mount points -- App.tsx and AppShell", () => {
    // The gate is mounted in App.tsx beside the router; the two notices are far down inside
    // AppShell. A provider around only one of them would sequence only one of them.
    expect(app).toContain('import { FirstRunDialogProvider } from "@/hooks/use-first-run-dialogs"');
    expect(app).toContain("<FirstRunDialogProvider>");
    expect(app).toContain("</FirstRunDialogProvider>");
    const provided = app.slice(
      app.indexOf("<FirstRunDialogProvider>"),
      app.indexOf("</FirstRunDialogProvider>"),
    );
    expect(provided).toContain("<Router />");
    expect(provided).toContain("<TermsReacceptanceGate />");
    // AppShell renders under the router, so both notices are inside it too.
    expect(shell).toContain("<NonIosTrackingNotice />");
    expect(shell).toContain("<CameraAccuracyNotice />");
  });

  for (const [file, src, slot] of [
    ["terms-reacceptance-gate.tsx", terms, "terms-reacceptance"],
    ["non-ios-tracking-warning.tsx", nonIos, "non-ios-tracking"],
    ["camera-accuracy-notice.tsx", accuracy, "camera-accuracy"],
  ] as const) {
    it(`${file} claims its slot and renders nothing until it is its turn`, () => {
      expect(src).toContain('useFirstRunDialogSlot } from "@/hooks/use-first-run-dialogs"');
      expect(src).toContain(`useFirstRunDialogSlot("${slot}"`);
      expect(src).toContain("if (!isMyTurn) return null;");
      // Waiting is not dismissing: the return is before the Dialog, so nothing is drawn, and
      // nothing marks the notice seen on the way past.
      expect(src.indexOf("if (!isMyTurn) return null;")).toBeLessThan(src.indexOf("<Dialog"));
    });
  }

  it("does not change whether any of the three is due, or whether it can be dismissed", () => {
    // The two notices keep their own shown-once-per-device flags and their own dismiss.
    expect(nonIos).toContain('window.localStorage.getItem(SEEN_KEY) !== "1"');
    expect(accuracy).toContain('window.localStorage.getItem(SEEN_KEY) !== "1"');
    // The gate stays non-dismissable, and a minor still sees nothing at all.
    expect(terms).toContain("onOpenChange={() => {}}");
    expect(terms).toContain("hideClose");
    expect(terms).toContain("if (status?.guardianDecides) return null;");
    // guardianDecides is excluded from what the gate asks the queue for too -- a minor must not
    // hold the slot and keep the camera notices off the screen forever.
    expect(terms).toContain("status?.guardianDecides !== true");
  });

  it("releases the slot on unmount, not only on dismissal", () => {
    expect(sequencer).toContain("return () => request(slot, false);");
  });

  it("falls back to the dialog's own answer when there is no provider", () => {
    // A notice rendered outside the provider must still appear. Sequencing can never be the
    // reason a required disclosure goes missing.
    expect(sequencer).toContain("if (!ctx) return wants;");
  });
});
