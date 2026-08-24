// Single source of truth for Forge's pricing structure -- every price, roster
// cap, and per-tier feature inclusion lives here and nowhere else, so the
// /pricing page, the admin billing-assignment form, and server/billing.ts's
// entitlement resolution can never drift out of sync with each other. This
// is what "locking in" the pricing structure actually means: the numbers
// are real, typed, committed code, not a number that only ever existed in a
// chat transcript.
//
// IMPORTANT: none of this is enforced anywhere yet. See server/billing.ts's
// ENFORCEMENT_ENABLED and users.isBetaAccount for the two independent
// switches that gate whether any of it actually restricts anyone -- both
// default to "don't restrict," on purpose, while still in beta.

export type BillingTierId = "solo" | "coach" | "growth" | "program" | "enterprise";
export type AddOnId = "custom_colors" | "team_identity" | "workflow" | "full_bundle";

export interface BillingTierDef {
  id: BillingTierId;
  label: string;
  monthlyPriceCents: number;
  /** null = unlimited (Enterprise only). */
  athleteCapIncluded: number | null;
  /** Flat per-athlete rate charged beyond athleteCapIncluded, rather than a
   * hard cliff at the boundary -- not enforced/billed anywhere yet, just
   * modeled so the number exists. */
  perAthleteOverageCents: number;
  /** Growth and above bundle the full personalization set (custom colors +
   * team identity + workflow customization) in for free -- Solo/Coach only
   * get it via the add-ons below. */
  includesFullPersonalization: boolean;
  /** Whether a second team can carry its own branding override (teams
   * themselves are always free to create at every tier -- this gates only
   * the *branding override* on a non-primary team). */
  includesMultiTeam: boolean;
}

export const BILLING_TIERS: Record<BillingTierId, BillingTierDef> = {
  solo: {
    id: "solo",
    label: "Solo",
    monthlyPriceCents: 1499,
    athleteCapIncluded: 15,
    perAthleteOverageCents: 150,
    includesFullPersonalization: false,
    includesMultiTeam: false,
  },
  coach: {
    id: "coach",
    label: "Coach",
    monthlyPriceCents: 3999,
    athleteCapIncluded: 30,
    perAthleteOverageCents: 150,
    includesFullPersonalization: false,
    includesMultiTeam: false,
  },
  growth: {
    id: "growth",
    label: "Growth",
    monthlyPriceCents: 14900,
    athleteCapIncluded: 100,
    perAthleteOverageCents: 125,
    includesFullPersonalization: true,
    includesMultiTeam: true,
  },
  program: {
    id: "program",
    label: "Program",
    monthlyPriceCents: 24900,
    athleteCapIncluded: 250,
    perAthleteOverageCents: 100,
    includesFullPersonalization: true,
    includesMultiTeam: true,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    monthlyPriceCents: 59900,
    athleteCapIncluded: null,
    perAthleteOverageCents: 0,
    includesFullPersonalization: true,
    includesMultiTeam: true,
  },
};

// Ordered cheapest-to-priciest, for rendering the /pricing page and the
// admin assignment dropdown in a sensible order without re-sorting.
export const BILLING_TIER_ORDER: BillingTierId[] = [
  "solo",
  "coach",
  "growth",
  "program",
  "enterprise",
];

export interface AddOnDef {
  id: AddOnId;
  label: string;
  monthlyPriceCents: number;
  description: string;
}

// Add-ons only matter at Solo/Coach -- Growth and above already include
// everything via includesFullPersonalization, so there's nothing for them
// to buy here (see getEntitlements in server/billing.ts).
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
};

export const BILLING_ADD_ON_ORDER: AddOnId[] = [
  "custom_colors",
  "team_identity",
  "workflow",
  "full_bundle",
];

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
