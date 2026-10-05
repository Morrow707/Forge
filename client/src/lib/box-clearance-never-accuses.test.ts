import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* RULE #1: A TAKE NEVER TELLS THE ATHLETE HE FAILED.
 *
 * 2026-10-04 beside the OVR: a 24-inch box jump Scott landed reported boxClearanceCm of -10.3
 * and -6.9, and the dialog said "Did not clear the box, feet peaked 6.9 cm below the top". The
 * jump height on the same take read 44cm against the 61cm the box required. The plausibility
 * guard above it cannot help -- 6.9cm is physically possible, it just is not what happened.
 *
 * "Cleared it by N" is a measurement. "Did not clear it" is a claim about the athlete's
 * performance drawn from an uncalibrated number, which is the exact shape Rule #1 refuses. The
 * number still reaches the admin tracking report on repBreakdown.
 */
const src = readFileSync(
  join(process.cwd(), "client/src/components/av-jump-tracker-dialog.tsx"),
  "utf8",
);

describe("a box jump never tells the athlete he missed the box", () => {
  it("has no toast on the negative-clearance branch", () => {
    // The string, not the branch: a comment may quote it (two do), a toast may not render it.
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toContain("Did not clear the box");
  });

  it("still reports a clearance it can actually claim", () => {
    // The positive read is a measurement and stays -- this is not "say nothing about the box".
    expect(src).toContain("Cleared the box, feet peaked");
  });
});
