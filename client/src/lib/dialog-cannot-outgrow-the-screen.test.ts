import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A DIALOG IS NEVER WIDER THAN THE PHONE IT IS ON.
 *
 * Reported 2026-10-02: opening "Customize schedule" inside Assign Program pushed the whole
 * dialog off the right of the screen -- the close button, the Correctives header and every
 * athlete's checkbox went with it, and no amount of scrolling brought them back because the
 * dialog itself had grown, not its contents.
 *
 * The cause is a CSS rule that is easy to miss: `DialogContent` is a GRID, and a grid track's
 * default `auto` minimum is its content's MIN-CONTENT width. That minimum beats `max-w-lg`. So
 * one child that reports a wide intrinsic size -- a native `<input type="date">`, which is wide
 * on iOS -- silently drags the whole dialog past its own stated maximum. `max-w-lg` reads like
 * a guarantee and is not one.
 *
 * `grid-cols-[minmax(0,1fr)]` gives the track a zero minimum, so it can shrink back to the
 * container and a wide child truncates or scrolls inside the dialog instead of widening it.
 *
 * This is pinned in the shared shell rather than in the one dialog that showed the symptom,
 * because every dialog in the app is built on it and any of them could acquire a wide child.
 */
const dialogShell = readFileSync(
  join(process.cwd(), "client/src/components/ui/dialog.tsx"),
  "utf8",
);

describe("the dialog shell", () => {
  it("gives its grid tracks a zero minimum so max-w-lg actually holds", () => {
    expect(dialogShell).toContain("grid-cols-[minmax(0,1fr)]");
  });

  it("still states a maximum width, which is the thing being protected", () => {
    expect(dialogShell).toContain("max-w-lg");
  });

  it("does not hide horizontal overflow", () => {
    // If something IS genuinely too wide, it has to stay reachable. `overflow-x-hidden` would
    // cut it off with no way to get at it, which is a worse failure than a scrollbar -- and it
    // would also mask a recurrence of this very bug rather than showing it.
    expect(dialogShell).not.toContain("overflow-x-hidden");
  });
});

describe("the assign-program schedule rows", () => {
  const assign = readFileSync(
    join(process.cwd(), "client/src/components/assign-program-dialog.tsx"),
    "utf8",
  );

  it("bounds the date input instead of taking its intrinsic width", () => {
    // `w-auto` on a native date input means "as wide as iOS says", which was the specific child
    // that broke the grid. A fixed width fits the longest date this control ever shows.
    expect(assign).toContain('className="h-7 w-[7.5rem] min-w-0 px-1.5 text-xs"');
  });

  it("lets every ancestor of that input shrink", () => {
    // One missing min-w-0 anywhere up the flex chain reinstates the min-content floor, so the
    // dialog-level fix alone is not enough.
    expect(assign).toContain("max-h-56 min-w-0 space-y-1 overflow-y-auto");
    expect(assign).toContain("flex min-w-0 items-center justify-between gap-2 rounded");
  });
});
