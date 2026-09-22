import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dialog = readFileSync(join(__dirname, "..", "components", "ui", "dialog.tsx"), "utf8");

/**
 * A tall dialog centred at 50% of a notched phone's screen puts its own top under the status
 * bar -- the close button and the title sat behind the clock and the battery, with no way out
 * of the sheet. Reported on-device 2026-09-22.
 */
describe("a dialog is reachable on a notched phone", () => {
  it("centres in the safe area, not the raw viewport", () => {
    // An iPhone's top inset is much larger than its bottom one, so a dialog centred on the raw
    // viewport is always too high by exactly half that difference.
    expect(dialog).toContain(
      '"calc(50% + (env(safe-area-inset-top) - env(safe-area-inset-bottom)) / 2)"',
    );
  });

  it("budgets its height against the safe viewport", () => {
    expect(dialog).toContain("env(safe-area-inset-top) - env(safe-area-inset-bottom)");
    // dvh, not vh: vh on iOS is the viewport with the browser chrome hidden, which is not the
    // height the dialog actually has while the chrome is showing.
    expect(dialog).toContain("100dvh");
    expect(dialog).not.toContain("max-h-[85vh]");
  });

  it("cannot be undone by a caller passing its own style", () => {
    // The spread has to come BEFORE style, or a caller's style replaces this wholesale and its
    // dialog goes straight back under the notch.
    expect(dialog.indexOf("{...props}")).toBeLessThan(dialog.indexOf('top: "calc(50%'));
    // ...while still merging whatever else the caller set.
    expect(dialog).toContain("...props.style,");
  });
});
