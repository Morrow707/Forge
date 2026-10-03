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

  it("bounds every date input instead of taking its intrinsic width", () => {
    // `w-auto` on a native date input means "as wide as iOS says", which was the specific child
    // that broke the grid. This asserts the PROPERTY rather than one class string: the first
    // version pinned the exact className, and the next change to this screen's layout broke the
    // test without breaking the thing it guards -- which teaches people to edit the assertion.
    // Only the ones INSIDE a day row. The Start date field is a full-width block input with
    // nothing beside it, so it has no intrinsic-width problem and needs no fixed width; an
    // assertion that caught it too would be demanding a bound for its own sake.
    // Split on the tag rather than matching to the first ">": these props contain an arrow
    // function, so `[^>]*` stops at the "=>" in onChange and never reaches the className.
    const dateInputs = assign
      .split("<Input")
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf("/>")))
      .filter((tag) => tag.includes("Date for day"));
    expect(dateInputs.length).toBeGreaterThan(0);
    for (const tag of dateInputs) {
      expect(tag).toMatch(/\bw-\[[\d.]+rem\]/); // an explicit width, not the intrinsic one
      expect(tag).toContain("min-w-0");
      expect(tag).not.toContain("w-auto");
    }
  });

  it("lets the scrolling day list shrink", () => {
    // One missing min-w-0 anywhere up the chain reinstates the min-content floor, so the
    // dialog-level fix alone is not enough.
    const list = assign.match(/className="[^"]*overflow-y-auto[^"]*"/);
    expect(list).not.toBeNull();
    expect(list![0]).toContain("min-w-0");
  });
});
