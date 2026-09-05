// Single source of truth for Forge's org/school pricing structure -- every
// price, roster band, and per-band feature inclusion lives here and nowhere
// else, so the /pricing page, the admin billing-assignment dropdown, and
// server/billing.ts's entitlement resolution can never drift out of sync
// with each other. This is what "locking in" the pricing structure actually
// means: the numbers are real, typed, committed code, not a number that only
// ever existed in a chat transcript.
//
// IMPORTANT: none of this is enforced anywhere yet. See server/billing.ts's
// ENFORCEMENT_ENABLED and users.isBetaAccount for the two independent
// switches that gate whether any of it actually restricts anyone -- both
// default to "don't restrict," on purpose, while still in beta.
//
// Pricing model: a flat $10.00 base fee plus $3.50/athlete, with NO volume
// discount at any roster size. The previous design (Solo/Coach/Growth/
// Program/Enterprise, each with its own price + a cheap per-athlete overage
// that got cheaper at bigger tiers) went net-negative at scale once real
// video-storage cost was modeled against it: Render's persistent-disk rate
// ($0.25/GB/mo) times a roster's actual video usage grows linearly with
// athlete count forever, while that structure's revenue flattened out at
// Enterprise's unlimited-athlete $599/mo flat cap -- a 1,000-athlete school
// with even moderate video adoption cost more in storage alone than the
// whole subscription. A flat, non-discounted per-athlete rate fixes this by
// construction: margin-per-athlete can't erode as N grows, so total margin
// scales up with roster size instead of collapsing. Verified against a
// three-point video-adoption stress test (30% of roster actively
// video-tracking as the expected case, 50% and 100% as stress cases) --
// every band stays margin-positive even in the 100% case.
//
// Presented to customers in 25-athlete bands (a customer pays for a band's
// ceiling, not their exact headcount) since a stepped ladder sells better
// than "exactly $3.50 x your roster" -- but the underlying rate never
// changes band to band, which is the actual fix.
export const ORG_BASE_CENTS = 1000; // $10.00 flat account fee
export const ORG_PER_ATHLETE_CENTS = 350; // $3.50/athlete, flat, every band, no discount

export type BillingTierId = string;
export type AddOnId = "custom_colors" | "team_identity" | "workflow" | "full_bundle" | "personal_page";

export interface BillingTierDef {
  id: BillingTierId;
  label: string;
  monthlyPriceCents: number;
  /** Upper end of this band's roster range -- never null here (unlike the
   * old Enterprise tier's unlimited cap, which was the single biggest
   * source of the negative-margin problem this model replaces). A roster
   * that outgrows the top band moves to a new, larger band at the same
   * flat per-athlete rate; the formula has no ceiling. */
  athleteCapIncluded: number;
  /** Always 0 -- there is no overage rate. Exceeding a band's cap means
   * moving up a band, not paying a cheap per-athlete add-on on top of a
   * flat base (that combination is exactly what let a rational customer
   * stay on the cheapest old tier long past when they should have
   * upgraded). */
  perAthleteOverageCents: 0;
  /** Bundled in for every band above the two starter bands (16 athletes and
   * up is "coached program," not "one team"), matching the old tier
   * structure's qualitative shape (small/individual tiers = basic, bigger
   * orgs = full features) even though the discrete Growth/Program/
   * Enterprise names are gone. Solo/Coach-equivalent starter bands can
   * still buy personalization a la carte via the add-ons below. */
  includesFullPersonalization: boolean;
  includesMultiTeam: boolean;
  /** Roster floor for this band -- not part of BillingTierDef's original
   * shape, but every caller that needs to show a range (the pricing page,
   * the admin dropdown) wants both ends, and re-deriving it from the
   * previous band in the order elsewhere would just duplicate this same
   * loop. */
  athleteFloor: number;
}

function bandPriceCents(athleteCapIncluded: number): number {
  return ORG_BASE_CENTS + athleteCapIncluded * ORG_PER_ATHLETE_CENTS;
}

// Band boundaries: 0-15 (small team), 16-30 (next jump) -- both flat prices,
// not part of the per-athlete formula's climb, same as the two tiers they
// replace -- then every 25 athletes from 31 up through 1,000. Nothing stops
// a roster bigger than 1,000; buildBands only enumerates this far because
// that's as far as anyone's actually asked to see priced out. A school
// beyond it prices the same way: $10 + $3.50 x their band ceiling, in the
// next 25-athlete step.
function buildBands(): BillingTierDef[] {
  const ranges: [number, number][] = [
    [0, 15],
    [16, 30],
  ];
  let start = 31;
  while (start <= 1000) {
    const end = Math.min(start + 24, 1000);
    ranges.push([start, end]);
    start += 25;
  }
  return ranges.map(([lo, hi]) => ({
    id: `${lo}-${hi}`,
    label: `${lo}-${hi} athletes`,
    monthlyPriceCents: bandPriceCents(hi),
    athleteCapIncluded: hi,
    athleteFloor: lo,
    perAthleteOverageCents: 0,
    includesFullPersonalization: lo > 30,
    includesMultiTeam: lo > 30,
  }));
}

const BILLING_BANDS: BillingTierDef[] = buildBands();

export const BILLING_TIERS: Record<BillingTierId, BillingTierDef> = Object.fromEntries(
  BILLING_BANDS.map((tier) => [tier.id, tier]),
);

// Ordered smallest-to-largest roster, for rendering the /pricing page and
// the admin assignment dropdown in a sensible order without re-sorting.
export const BILLING_TIER_ORDER: BillingTierId[] = BILLING_BANDS.map((tier) => tier.id);

/** The band a given roster size actually falls into -- e.g. a ~900-athlete
 * program lands in the 881-905 band. Used by the pricing page to show a
 * few representative checkpoints without hand-duplicating numbers already
 * computed above. Clamps to the largest defined band for anything past
 * 1,000 rather than returning undefined -- the formula has no real ceiling,
 * this table just stops enumerating past the largest roster anyone's asked
 * about. */
export function bandForAthleteCount(n: number): BillingTierDef {
  for (const tier of BILLING_BANDS) {
    if (n <= tier.athleteCapIncluded) return tier;
  }
  return BILLING_BANDS[BILLING_BANDS.length - 1];
}

export interface AddOnDef {
  id: AddOnId;
  label: string;
  monthlyPriceCents: number;
  description: string;
}

// Add-ons only matter on the two starter bands (0-15, 16-30) -- every band
// above 30 athletes already includes full personalization via
// includesFullPersonalization, so there's nothing for them to buy here (see
// getEntitlements in server/billing.ts).
export const BILLING_ADD_ONS: Record<AddOnId, AddOnDef> = {
  custom_colors: {
    id: "custom_colors",
    label: "Custom Colors",
    monthlyPriceCents: 999,
    description: "Exact hex colors, eyedropper, WCAG contrast guardrail -- logo and a primary color are already free at every tier.",
  },
  team_identity: {
    id: "team_identity",
    label: "Team Identity",
    monthlyPriceCents: 799,
    description: "Motto, mission/About page, public contact email, athlete welcome message.",
  },
  workflow: {
    id: "workflow",
    label: "Workflow Customization",
    monthlyPriceCents: 799,
    description: "Nav tab hiding/renaming, dashboard widget show/hide.",
  },
  full_bundle: {
    id: "full_bundle",
    label: "Full Personalization Bundle",
    monthlyPriceCents: 2499,
    description: "Custom Colors + Team Identity + Workflow Customization together, at a discount over buying separately.",
  },
  // Distinct from custom_colors above -- that one governs the org-wide
  // header/nav re-skin (brandPrimaryColor/brandSecondaryColor), where a
  // primary color is already free at every tier and only the secondary
  // color is gated. This one is a coach's athletes' actual exercise-logging
  // screen -- the backdrop behind the set-paging controls, the Watch Demo
  // button, the completed-set indicator, and the set-paging arrows -- and
  // is entirely paid, nothing free, for any tier that hasn't bought it or
  // doesn't include full personalization. See shared/schema.ts's
  // users.exercisePageTheme for exactly what it drives.
  personal_page: {
    id: "personal_page",
    label: "Personal Page",
    monthlyPriceCents: 999,
    description: "Recolor your athletes' exercise-logging screen -- the backdrop, the Watch Demo button, the completed-set indicator, and the set-paging arrows -- all yours, not just Forge's defaults.",
  },
};

export const BILLING_ADD_ON_ORDER: AddOnId[] = [
  "custom_colors",
  "team_identity",
  "workflow",
  "personal_page",
  "full_bundle",
];

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------- Coaches Corner ----------------
// The Coaches Corner (coach-education tracks -- see the academy routes in
// server/routes.ts) had a gate, an entitlement check and a hardcoded comp
// list, and no price anywhere. It was reachable only by being on tier
// "pro", a tier whose only price lived in a dead const in server/billing.ts
// that nothing read. So the honest description of the product was "cannot
// be bought."
//
// It is priced here as a standalone monthly add-on on the coach account,
// deliberately NOT as a perk of a coach plan tier. Two reasons. A coach who
// wants the Corner shouldn't have to move plans to get it, and a coach who
// doesn't want it shouldn't be carrying it in a tier price. And the org
// plan above has no tiers to hang it off in the first place -- the model is
// a flat base fee plus a flat per-athlete rate, with bands that are a
// presentation of that formula, not products with different feature sets.
export const COACHES_CORNER_MONTHLY_PRICE_CENTS = 1999;

// Rosters at or above this size get the Corner at no charge. At the flat
// per-athlete rate above, a 100-athlete org is already paying
// $10 + 100 x $3.50 = $360/mo, so another $19.99 is noise on their invoice
// and friction on the sale.
//
// NOT yet wired into hasCoachesCornerAccess in server/routes.ts -- that
// still gates on tier "pro" plus a hardcoded comp list, and changing who
// can reach a feature is a separate change from giving the feature a price.
// This is the number that change should read when it happens.
export const COACHES_CORNER_FREE_AT_ATHLETE_COUNT = 100;
