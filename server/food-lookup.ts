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
  // Populated by both lookups below on a best-effort basis -- either
  // source can simply not have a given micro for a given product, same
  // "absent means not provided, not zero" convention as everywhere else
  // these are handled (see foodLogEntries' schema comment). Also always
  // fillable/correctable via the athlete's own manual entry or edit.
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

// Neither lookup below has ever been verified against a live API response --
// see this file's earlier comments on why -- confirmed directly (not just
// assumed) by running the exact fetch() calls below from a dev sandbox: both
// world.openfoodfacts.org and api.nal.usda.gov are rejected at the network
// layer itself ("Host not in allowlist"), before a single byte of a real
// response was ever seen. A wrong nutrientName string fails safe (the field
// comes back null, same as "food has no data for this"), but a wrong unit-
// scale assumption -- the offMicrosMg *1000 conversion below is the one
// actual guess in this file, everything else either needs no conversion or
// was confirmed against a real USDA sample response -- fails silently and
// wrong by a factor of 1000, indistinguishable from a correct value until a
// human notices a preposterous number. These two checks are the fallback for
// that: they can't tell you the mapping IS right, only flag it loudly the
// first time it's obviously wrong, in an environment that can actually reach
// these APIs (e.g. once deployed, or a dev environment with these two hosts
// allowlisted). Nothing here blocks or corrects a candidate -- same
// "flag, don't decide" pattern as the rest of this app -- it's diagnostic
// only, meant to be caught by whoever's watching server logs.
const PLAUSIBLE_MAX: Partial<Record<keyof FoodCandidate, number>> = {
  caloriesKcal: 2000,
  proteinG: 150,
  carbsG: 200,
  fatG: 150,
  fiberG: 50,
  sodiumMg: 5000,
  calciumMg: 2500,
  ironMg: 50,
  vitaminDMcg: 250,
  potassiumMg: 5000,
  magnesiumMg: 1000,
  vitaminB12Mcg: 100,
  zincMg: 50,
};

function flagImplausibleValues(source: string, candidate: FoodCandidate): void {
  for (const [field, max] of Object.entries(PLAUSIBLE_MAX) as [keyof FoodCandidate, number][]) {
    const value = candidate[field];
    if (typeof value === "number" && value > max) {
      console.warn(
        `${source} food lookup: implausible ${field}=${value} for "${candidate.description}"` +
          ` (barcode ${candidate.barcode ?? "n/a"}) -- likely a wrong unit-scale assumption in food-lookup.ts, not a real value. Not auto-corrected; flagging only.`,
      );
    }
  }
}

function flagIfNoNutrientsMatched(
  source: string,
  candidate: FoodCandidate,
  rawNutrientKeysPresent: string[],
): void {
  const coreFieldsAllNull =
    candidate.caloriesKcal == null &&
    candidate.proteinG == null &&
    candidate.carbsG == null &&
    candidate.fatG == null;
  if (coreFieldsAllNull && rawNutrientKeysPresent.length > 0) {
    console.warn(
      `${source} food lookup: none of this file's expected nutrient keys matched a real response for` +
        ` "${candidate.description}" even though the response carried nutrient data -- the field-name` +
        ` mapping in food-lookup.ts is likely wrong. Raw keys the API actually returned:`,
      rawNutrientKeysPresent.join(", "),
    );
  }
}

// Open Food Facts' nutriments object stores most nutrients pre-normalized
// to a taxonomy-defined default unit per nutrient, not uniformly in grams --
// sodium above is the existing proof of this (its raw _100g/_serving value
// is grams, hence the *1000 to mg). The mineral fields below (calcium, iron,
// potassium, magnesium, zinc) follow that same grams-by-default convention;
// vitamin D and B12 are the opposite case -- OFF's default unit for those is
// already micrograms, so no conversion. STILL UNVERIFIED as of 2026-08-26:
// this is the single riskiest guess in this file -- a wrong unit-scale
// assumption here is a silent 1000x-wrong number, not a missing one, and
// research (docs, sample responses, third-party API write-ups) couldn't
// pin down OFF's per-nutrient default-unit table precisely enough to
// confirm it. world.openfoodfacts.org (and every openfoodfacts.org
// subdomain tried) is unreachable from this dev sandbox -- confirmed
// directly, including a raw fetch() identical to the one this file makes,
// rejected at the network layer with "Host not in allowlist," not a
// curl/tooling issue. flagImplausibleValues below is the fallback for this
// specific failure mode (a scaling error usually produces an absurd
// number, e.g. a food supposedly carrying 50 grams of iron); confirming
// this for real needs either allowlisting these two hosts for a dev
// session, or checking server logs once this runs somewhere with real
// network access.
function offMicrosMg(n: Record<string, number | undefined>, key: string): number | null {
  const raw = n[`${key}_serving`] ?? n[`${key}_100g`];
  return raw == null ? null : round(raw * 1000, 1);
}
function offMicrosMcg(n: Record<string, number | undefined>, key: string): number | null {
  const raw = n[`${key}_serving`] ?? n[`${key}_100g`];
  return raw == null ? null : round(raw, 1);
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
    const candidate: FoodCandidate = {
      description: p.product_name?.trim() || p.generic_name?.trim() || "Unknown product",
      brand: p.brands?.split(",")[0]?.trim() || null,
      servingDescription: servingSize,
      caloriesKcal: round(n["energy-kcal_serving"] ?? n["energy-kcal_100g"], 0),
      proteinG: round(n["proteins_serving"] ?? n["proteins_100g"]),
      carbsG: round(n["carbohydrates_serving"] ?? n["carbohydrates_100g"]),
      fatG: round(n["fat_serving"] ?? n["fat_100g"]),
      fiberG: round(n["fiber_serving"] ?? n["fiber_100g"]),
      sodiumMg: round((n["sodium_serving"] ?? n["sodium_100g"]) * 1000, 0),
      calciumMg: offMicrosMg(n, "calcium"),
      ironMg: offMicrosMg(n, "iron"),
      vitaminDMcg: offMicrosMcg(n, "vitamin-d"),
      potassiumMg: offMicrosMg(n, "potassium"),
      magnesiumMg: offMicrosMg(n, "magnesium"),
      vitaminB12Mcg: offMicrosMcg(n, "vitamin-b12"),
      zincMg: offMicrosMg(n, "zinc"),
      barcode,
    };
    flagImplausibleValues("Open Food Facts", candidate);
    flagIfNoNutrientsMatched("Open Food Facts", candidate, Object.keys(n));
    return candidate;
  } catch (err) {
    console.error("Open Food Facts lookup failed:", err);
    return null;
  }
}

// USDA FoodData Central reports each nutrient in its own practical unit
// already (nutrientName here is what to look up; sodium's existing
// unconverted mapping below is the proof -- USDA's "Sodium, Na" is already
// mg, unlike Open Food Facts' gram-default). Partially verified as of
// 2026-08-26: a real, live-fetched FDC API sample response confirmed
// "Energy", "Protein", "Total lipid (fat)", "Carbohydrate, by difference",
// "Fiber, total dietary", "Sodium, Na", "Calcium, Ca", and "Iron, Fe" exactly
// as used below (via a public example response, not a call made from this
// repo). The remaining five -- Vitamin D, Potassium, Magnesium, Vitamin
// B-12, Zinc -- follow the same "Name, Symbol"/USDA-standard-name pattern as
// the confirmed ones but were not seen in a real response; api.nal.usda.gov
// is unreachable from this dev sandbox (confirmed directly, including a raw
// fetch() call identical to the one below -- rejected at the network layer,
// not just a curl/tooling issue), so this couldn't be closed out further
// from here. flagIfNoNutrientsMatched below is the fallback: it can't
// confirm the mapping is right, only flag loudly the first time real
// traffic proves it's wrong.
function usdaFoodToCandidate(food: any, barcode: string | null): FoodCandidate {
  const nutrientValue = (name: string) =>
    food.foodNutrients?.find((n: any) => n.nutrientName === name)?.value ?? null;
  const candidate: FoodCandidate = {
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
    calciumMg: round(nutrientValue("Calcium, Ca"), 0),
    ironMg: round(nutrientValue("Iron, Fe")),
    vitaminDMcg: round(nutrientValue("Vitamin D (D2 + D3)")),
    potassiumMg: round(nutrientValue("Potassium, K"), 0),
    magnesiumMg: round(nutrientValue("Magnesium, Mg"), 0),
    vitaminB12Mcg: round(nutrientValue("Vitamin B-12")),
    zincMg: round(nutrientValue("Zinc, Zn")),
    barcode,
  };
  flagImplausibleValues("USDA", candidate);
  flagIfNoNutrientsMatched(
    "USDA",
    candidate,
    (food.foodNutrients ?? []).map((n: any) => n.nutrientName),
  );
  return candidate;
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
