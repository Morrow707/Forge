// Barcode/name lookups against public food databases -- never an AI call,
// just a proxy so the client doesn't need its own CORS/API-key handling.
// Open Food Facts needs no key and is checked first (it's explicitly
// barcode-indexed, the same database MyFitnessPal itself leans on for
// long-tail packaged products). USDA FoodData Central is the fallback --
// stronger on generic/raw foods and government-verified branded data, but
// requires a free API key (https://fdc.nal.usda.gov/api-key-signup) and is
// skipped entirely if USDA_FDC_API_KEY isn't set, same graceful-degrade
// pattern as every other optional integration in this app (see ai.ts,
// email.ts). Manual entry always works regardless of either being
// configured -- see createFoodLogEntrySchema's "manual" source.

const USDA_API_KEY = process.env.USDA_FDC_API_KEY;
export const usdaFoodLookupEnabled = Boolean(USDA_API_KEY);
if (!usdaFoodLookupEnabled) {
  console.warn("USDA food lookup disabled: USDA_FDC_API_KEY not set (Open Food Facts still works).");
}

export type FoodCandidate = {
  description: string;
  brand: string | null;
  servingDescription: string | null;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  // Not populated by either lookup below (Open Food Facts/USDA aren't
  // wired up for these yet) -- always null from lookupBarcode/
  // searchFoodsByName, only ever filled by the AI photo-analysis path
  // (see storage.analyzeMealPhoto) or the athlete's own manual entry/edit.
  calciumMg: number | null;
  ironMg: number | null;
  vitaminDMcg: number | null;
  potassiumMg: number | null;
  magnesiumMg: number | null;
  vitaminB12Mcg: number | null;
  zincMg: number | null;
  barcode: string | null;
};

function round(n: number | null | undefined, digits = 1): number | null {
  if (n == null || Number.isNaN(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

async function lookupBarcodeOpenFoodFacts(barcode: string): Promise<FoodCandidate | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { headers: { "User-Agent": "Forge-Fitness-App/1.0" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const n = p.nutriments ?? {};
    const servingSize = p.serving_size ? String(p.serving_size) : null;
    return {
      description: p.product_name?.trim() || p.generic_name?.trim() || "Unknown product",
      brand: p.brands?.split(",")[0]?.trim() || null,
      servingDescription: servingSize,
      caloriesKcal: round(n["energy-kcal_serving"] ?? n["energy-kcal_100g"], 0),
      proteinG: round(n["proteins_serving"] ?? n["proteins_100g"]),
      carbsG: round(n["carbohydrates_serving"] ?? n["carbohydrates_100g"]),
      fatG: round(n["fat_serving"] ?? n["fat_100g"]),
      fiberG: round(n["fiber_serving"] ?? n["fiber_100g"]),
      sodiumMg: round((n["sodium_serving"] ?? n["sodium_100g"]) * 1000, 0),
      calciumMg: null,
      ironMg: null,
      vitaminDMcg: null,
      potassiumMg: null,
      magnesiumMg: null,
      vitaminB12Mcg: null,
      zincMg: null,
      barcode,
    };
  } catch (err) {
    console.error("Open Food Facts lookup failed:", err);
    return null;
  }
}

function usdaFoodToCandidate(food: any, barcode: string | null): FoodCandidate {
  const nutrientValue = (name: string) =>
    food.foodNutrients?.find((n: any) => n.nutrientName === name)?.value ?? null;
  return {
    description: food.description?.trim() || "Unknown food",
    brand: food.brandOwner?.trim() || food.brandName?.trim() || null,
    servingDescription:
      food.servingSize && food.servingSizeUnit
        ? `${food.servingSize}${food.servingSizeUnit} (per 100g shown)`
        : "per 100g",
    caloriesKcal: round(nutrientValue("Energy"), 0),
    proteinG: round(nutrientValue("Protein")),
    carbsG: round(nutrientValue("Carbohydrate, by difference")),
    fatG: round(nutrientValue("Total lipid (fat)")),
    fiberG: round(nutrientValue("Fiber, total dietary")),
    sodiumMg: round(nutrientValue("Sodium, Na"), 0),
    calciumMg: null,
    ironMg: null,
    vitaminDMcg: null,
    potassiumMg: null,
    magnesiumMg: null,
    vitaminB12Mcg: null,
    zincMg: null,
    barcode,
  };
}

async function lookupBarcodeUsda(barcode: string): Promise<FoodCandidate | null> {
  if (!usdaFoodLookupEnabled) return null;
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(
        barcode,
      )}&dataType=Branded&pageSize=1`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const food = data.foods?.[0];
    if (!food || food.gtinUpc !== barcode) return null;
    return usdaFoodToCandidate(food, barcode);
  } catch (err) {
    console.error("USDA barcode lookup failed:", err);
    return null;
  }
}

/** Barcode-first lookup: Open Food Facts, then USDA branded search as a
 * fallback if the former has no match. Null means neither found it -- the
 * client falls back to search-by-name or full manual entry. */
export async function lookupBarcode(barcode: string): Promise<FoodCandidate | null> {
  const off = await lookupBarcodeOpenFoodFacts(barcode);
  if (off) return off;
  return lookupBarcodeUsda(barcode);
}

/** Name search against USDA FoodData Central -- covers generic/raw foods
 * (an Open Food Facts barcode lookup can't help with "grilled chicken
 * breast") as well as branded items. Empty array (not an error) if USDA
 * isn't configured or nothing matches. */
export async function searchFoodsByName(query: string): Promise<FoodCandidate[]> {
  if (!usdaFoodLookupEnabled) return [];
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(
        query,
      )}&pageSize=10`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.foods ?? []).map((food: any) => usdaFoodToCandidate(food, null));
  } catch (err) {
    console.error("USDA food search failed:", err);
    return [];
  }
}
