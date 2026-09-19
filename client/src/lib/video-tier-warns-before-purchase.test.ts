import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_TIERS,
  WITHDRAWN_FREE_AGENT_TIERS,
} from "@shared/free-agent-tiers";
import { CAMERA_ACCURACY_PURCHASE_WARNING } from "@shared/camera-accuracy-copy";

/**
 * THE CAMERA TIER IS NEVER OFFERED FOR SALE WITHOUT SAYING THE NUMBERS ARE WRONG.
 *
 * AI Coach + Video was withdrawn on 2026-09-19 because the camera it is sold on is not accurate,
 * and put back on sale the same day on a different answer: sell it, and say plainly what the
 * buyer is getting. Scott: "list a warning for the $19.99, while this does record video, it's
 * not accurate purchase at your own risk."
 *
 * That answer only holds while the warning is actually THERE. A tier sold on a promise the
 * product does not keep, with the qualification missing from the one card the buyer reads, is
 * worse than either the withdrawal or an honest sale -- it is the withdrawal's problem plus a
 * charge. So the warning is not decoration on this tier; it is the condition of selling it, and
 * this file is what makes that a fact about the repo rather than an intention in a comment.
 *
 * IT SCANS RATHER THAN HOLDING A LIST, for the reason the tracker-dialog and caveat-coverage
 * scans already establish in CLAUDE.md: a hand-written list is a list of the surfaces somebody
 * remembered, and the next price card will not be on it. The explicit-names check below is the
 * other direction -- it fails if a surface stops matching the scan, so a rename cannot quietly
 * turn the whole file green.
 */

const CLIENT_DIR = join(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );
}

/** A surface OFFERS the tier when it branches on the video entitlement and shows a price beside
 * it. Either half alone is something else: the entitlement without a price is an in-app feature
 * check, and a price without the entitlement is a tier that does not include the camera. */
const PRICE_TERMS = ["monthlyPriceCents", "formatCents", "displayPrice"];

const purchaseSurfaces = walk(CLIENT_DIR)
  .filter((file) => {
    const src = readFileSync(file, "utf8");
    return src.includes("hasVideoFormCheck") && PRICE_TERMS.some((t) => src.includes(t));
  })
  .map((file) => [file.split("/client/src/")[1], file] as const);

describe("nobody is offered the camera tier without the accuracy warning", () => {
  it("the tier really is on sale, which is what makes the warning load-bearing", () => {
    // If it is ever withdrawn again this assertion is the first thing to fail, and that is the
    // right place to reconsider the rest of the file rather than have it silently guard nothing.
    const onSale = FREE_AGENT_TIER_ORDER.filter((id) => FREE_AGENT_TIERS[id].hasVideoFormCheck);
    expect(onSale.length).toBeGreaterThan(0);
    for (const id of onSale) expect(WITHDRAWN_FREE_AGENT_TIERS).not.toContain(id);
  });

  it("still finds the three surfaces that sell it, so a rename cannot no-op the scan", () => {
    expect(purchaseSurfaces.map(([label]) => label).sort()).toEqual([
      "pages/athlete/upgrade.tsx",
      "pages/landing.tsx",
      "pages/pricing.tsx",
    ]);
  });

  it.each(purchaseSurfaces)("%s warns before the price", (_label, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("CameraMetricCaveat");
    expect(src).toContain('variant="purchase"');
  });

  it.each(purchaseSurfaces)("%s ties the warning to the video entitlement, not to a tier id", (_label, file) => {
    // Naming the tier as a literal on a sales surface is the bug the checkout route already had:
    // withdraw or rename a tier elsewhere and the hardcoded surface keeps its own idea of which
    // one is which. The warning has to follow the entitlement that makes it true.
    expect(readFileSync(file, "utf8")).not.toContain('"ai_coach_video"');
  });
});

describe("the purchase warning is the strong one and cannot be dismissed", () => {
  it("says the video works, the numbers do not, and the buyer is taking the risk", () => {
    // Asserting the substance rather than the exact wording: the sentence may be re-edited, but
    // a version of it that drops any of these three is a different, weaker disclosure.
    expect(CAMERA_ACCURACY_PURCHASE_WARNING).toMatch(/records and saves your video/i);
    expect(CAMERA_ACCURACY_PURCHASE_WARNING).toMatch(/not\s+accurate/i);
    expect(CAMERA_ACCURACY_PURCHASE_WARNING).toMatch(/at your own risk/i);
  });

  it("is never dismissible, whatever a caller passes", () => {
    // A source scan because the component needs a DOM and this suite runs under Node (see
    // vitest.config.ts). It checks the one thing that would matter: the dismiss path is computed
    // from a value that excludes the purchase variant, rather than from the caller's flag.
    const src = readFileSync(join(CLIENT_DIR, "components", "camera-metric-caveat.tsx"), "utf8");
    expect(src).toMatch(/const canDismiss = dismissible && variant !== "purchase"/);
    // ...and the flag itself no longer reaches either of the two places that can hide it.
    expect(src).toMatch(/useState\(\(\) => canDismiss/);
    expect(src).toMatch(/\{canDismiss && \(/);
  });
});
