import { BILLING_TIERS, type AddOnId, type BillingTierId } from "@shared/billing-tiers";

// Global kill switch -- deliberately not read from render.yaml (it's not
// added there at all), so production stays off the same way local dev does
// unless someone goes and sets this env var by hand. Combined with
// isBetaAccount below, nothing is ever restricted by accident.
export const ENFORCEMENT_ENABLED = process.env.BILLING_ENFORCEMENT_ENABLED === "true";

export interface Entitlements {
  /** null = unlimited. */
  athleteCap: number | null;
  hasCustomColors: boolean;
  hasTeamIdentity: boolean;
  hasWorkflowCustomization: boolean;
  hasMultiTeam: boolean;
}

const UNLIMITED_ENTITLEMENTS: Entitlements = {
  athleteCap: null,
  hasCustomColors: true,
  hasTeamIdentity: true,
  hasWorkflowCustomization: true,
  hasMultiTeam: true,
};

export interface BillingAccount {
  billingTier: string | null;
  billingAddOns: string[] | null;
  isBetaAccount: boolean;
}

/** Resolves what a primary coach's org is actually entitled to. Fully
 * unlocked whenever enforcement is globally off OR the account is still
 * marked beta -- both true by default for every account today, on
 * purpose, so shipping this file doesn't restrict anyone on its own. Only
 * once an admin has explicitly set isBetaAccount=false (via the billing
 * panel) AND BILLING_ENFORCEMENT_ENABLED is set does a real tier/add-on
 * lookup happen. See shared/billing-tiers.ts for what each tier/add-on id
 * actually includes. */
export function getEntitlements(account: BillingAccount): Entitlements {
  if (!ENFORCEMENT_ENABLED || account.isBetaAccount) {
    return UNLIMITED_ENTITLEMENTS;
  }

  const tier = account.billingTier ? BILLING_TIERS[account.billingTier as BillingTierId] : null;
  const addOns = new Set<AddOnId>((account.billingAddOns ?? []) as AddOnId[]);
  const hasFullBundle = addOns.has("full_bundle");

  return {
    athleteCap: tier?.athleteCapIncluded ?? 0,
    hasCustomColors: Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("custom_colors"),
    hasTeamIdentity: Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("team_identity"),
    hasWorkflowCustomization:
      Boolean(tier?.includesFullPersonalization) || hasFullBundle || addOns.has("workflow"),
    hasMultiTeam: Boolean(tier?.includesMultiTeam),
  };
}
