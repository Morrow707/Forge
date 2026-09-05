// Every priced thing on the platform, in one flat list, for the admin
// Billing page's pricing editor. The numbers themselves still live as coded
// defaults in shared/billing-tiers.ts, shared/free-agent-tiers.ts, and
// shared/video-retention.ts -- that's what /pricing (the public marketing
// page) and server/billing.ts's entitlement logic read, and neither of
// those needs to change shape just because an admin can now override a
// price. This catalog exists purely to enumerate them for display/editing;
// storage.getPricingCatalog merges each entry's defaultCents with any row
// in pricingOverrides sharing its key.
import {
  ORG_BASE_CENTS,
  ORG_PER_ATHLETE_CENTS,
  BILLING_ADD_ONS,
  BILLING_ADD_ON_ORDER,
  COACHES_CORNER_MONTHLY_PRICE_CENTS,
  COACHES_CORNER_FREE_AT_ATHLETE_COUNT,
} from "@shared/billing-tiers";
import {
  FREE_AGENT_TIERS,
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_ADD_ONS,
  FREE_AGENT_ADD_ON_ORDER,
  SKILL_SPORT_UNLOCK_MONTHLY_PRICE_CENTS,
} from "@shared/free-agent-tiers";
import { VIDEO_STORAGE_ADD_ON } from "@shared/video-retention";
import { FORGE_CLASS_LESSON_DEFAULT_PRICE_CENTS } from "@shared/class-pricing";

export type PricingCatalogItem = {
  key: string;
  category: string;
  label: string;
  description: string;
  defaultCents: number;
};

export const PRICING_CATALOG: PricingCatalogItem[] = [
  {
    key: "org_base_fee",
    category: "Org / Coach Plan",
    label: "Base account fee",
    description: "Flat monthly fee every org/coach account pays, before the per-athlete rate.",
    defaultCents: ORG_BASE_CENTS,
  },
  {
    key: "org_per_athlete",
    category: "Org / Coach Plan",
    label: "Per-athlete rate",
    description:
      "Added per athlete on roster, flat at every roster size -- this is the one number every 25-athlete pricing band on /pricing is computed from.",
    defaultCents: ORG_PER_ATHLETE_CENTS,
  },
  ...BILLING_ADD_ON_ORDER.map((id) => ({
    key: `addon_${id}`,
    category: "Org Personalization Add-ons",
    label: BILLING_ADD_ONS[id].label,
    description: BILLING_ADD_ONS[id].description,
    defaultCents: BILLING_ADD_ONS[id].monthlyPriceCents,
  })),
  ...FREE_AGENT_TIER_ORDER.map((id) => ({
    key: `fa_tier_${id}`,
    category: "Free Agent Tiers",
    label: FREE_AGENT_TIERS[id].label,
    description: FREE_AGENT_TIERS[id].description,
    defaultCents: FREE_AGENT_TIERS[id].monthlyPriceCents,
  })),
  ...FREE_AGENT_ADD_ON_ORDER.map((id) => ({
    key: `fa_addon_${id}`,
    category: "Free Agent Sport Add-ons",
    label: FREE_AGENT_ADD_ONS[id].label,
    description: FREE_AGENT_ADD_ONS[id].description,
    defaultCents: FREE_AGENT_ADD_ONS[id].monthlyPriceCents,
  })),
  {
    key: "video_storage_addon",
    category: "Video Storage",
    label: "Extra video storage add-on",
    description: `Raises the per-exercise/per-drill video cap to ${VIDEO_STORAGE_ADD_ON.favoritedCap} favorited / ${VIDEO_STORAGE_ADD_ON.totalCap} total. Works for a coached athlete or a Free Agent.`,
    defaultCents: VIDEO_STORAGE_ADD_ON.monthlyPriceCents,
  },
  {
    key: "coaches_corner",
    category: "Coaches Corner",
    label: "Coaches Corner access",
    description: `Per coach account, sold on its own rather than bundled into a plan. Free for rosters of ${COACHES_CORNER_FREE_AT_ATHLETE_COUNT}+ athletes. Access is still gated on subscription tier in routes.ts -- pricing it here is the first half of that change, not the whole of it.`,
    defaultCents: COACHES_CORNER_MONTHLY_PRICE_CENTS,
  },
  {
    key: "forge_class_lesson_default",
    category: "Classes",
    label: "Forge Class lesson (default price)",
    description:
      "What one lesson of a Forge-official Class is worth to a Free Agent, per lesson, one time -- the default an admin sets classLessons.priceCents to. There is no purchase route yet, so a priced lesson is still enrollable for free; see shared/class-pricing.ts.",
    defaultCents: FORGE_CLASS_LESSON_DEFAULT_PRICE_CENTS,
  },
  {
    key: "skill_sport_unlock",
    category: "Skill Bank",
    label: "Additional sport unlock",
    description:
      "Per sport, per Free Agent -- unlocks that sport's Skill Bank drills beyond their own free signup sport.",
    defaultCents: SKILL_SPORT_UNLOCK_MONTHLY_PRICE_CENTS,
  },
];

export const PRICING_CATALOG_KEYS = new Set(PRICING_CATALOG.map((i) => i.key));
