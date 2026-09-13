import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Three mutations wrote server state and told nothing to look again. A stale
// cache after a write is invisible in tests that only exercise the server, so
// these pin the specific refreshes at the source.

const CLIENT_SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(CLIENT_SRC, p), "utf8");

/** The useMutation({...}) call starting at `from`, brace-aware. */
function mutationAt(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  const open = source.indexOf("(", at);
  let depth = 0;
  let i = open;
  while (i < source.length) {
    const c = source[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  return source.slice(open, i + 1);
}

describe("redeeming a code refreshes the user it unlocked", () => {
  const block = mutationAt(read("components/account-settings-dialog.tsx"), "const redeemMutation");

  it("invalidates the auth query every entitlement gate reads", () => {
    // The toast promises full access; without this the app keeps gating.
    expect(block).toContain('queryKey: ["/api/auth/me"]');
  });

  it("still tells the coach it worked", () => {
    expect(block).toContain("Code redeemed");
  });
});

describe("copying correctives refreshes the days it wrote to", () => {
  const block = mutationAt(read("components/coach-day-edit-dialog.tsx"), "const copyCorrectivesMutation");

  it("invalidates each target day, not just the one on screen", () => {
    // The mutation's second argument is the variables it was called with --
    // the target ids. Refreshing only the current day would miss every day
    // this actually changed.
    expect(block).toContain("for (const dayId of targetProgramDayIds)");
    expect(block).toContain('"days", dayId, "correctives"');
  });

  it("refreshes the calendar that summarises those days", () => {
    expect(block).toContain('queryKey: ["/api/coach/calendar"]');
  });
});

// The Coaches Corner unlock mutation is gone with the button: every branch of
// /api/coach/academy/unlock answers 402 and no checkout for it exists anywhere, so
// the only thing the button could do was fail with a toast. The page now states
// that it comes with a Pro coaching plan. If a real purchase path is ever built,
// restore a freshness case here for it -- the two queries it has to invalidate are
// ["/api/coach/academy/tracks"] and ["/api/auth/me"], since access is an
// entitlement on the user record rather than a property of the track list.
