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

// Neither fetch below had a timeout, and fetch has no default one. A barcode
// scan is a foreground action an athlete is standing still for, so an Open
// Food Facts instance that accepts the connection and then stalls used to
// leave the scan spinning with no way out but killing the app. Eight seconds
// is generous for a single JSON GET and short enough to fall through to the
// next source while the athlete is still holding the packet.
const LOOKUP_TIMEOUT_MS = 8000;

/** Distinguishes "this product is not in the database" from "the database did
 * not answer". Both used to arrive as null, and the route turned both into
 * "Couldn't find that product -- try search or enter it manually." -- which
 * sends an athlete off to retype an entire nutrition label when the real
 * answer was "try again in a minute". */
export type FoodLookupOutcome =
  | { status: "found"; food: FoodCandidate }
  | { status: "not_found" }
  | { status: "unavailable" };

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
// One basis for the whole product, chosen once, rather than per nutrient.
//
// Open Food Facts populates _serving and _100g independently, and plenty of
// products carry _serving for the headline macros and only _100g for the
// minerals. Falling back per nutrient therefore built a single entry out of
// both, labelled with the product's serving size: for a 30 g serving the
// per-100 g figures were more than three times too high, and for a 250 g
// serving they were well under half what they should be. Silently, and on
// numbers a coach reads as an athlete's intake.
//
// Preferring energy is deliberate -- it is the field OFF populates most
// reliably, so it is the best single signal for whether this product has
// real per-serving data at all. When it does not, everything comes from
// _100g together and the entry is labelled "100 g" so nobody reads it as
// one serving.
export function offBasis(n: Record<string, number | undefined>): "serving" | "100g" {
  return n["energy-kcal_serving"] != null ? "serving" : "100g";
}
export function offValue(
  n: Record<string, number | undefined>,
  key: string,
  basis: "serving" | "100g",
): number | undefined {
  // Deliberately does NOT fall back to the other basis: a missing nutrient
  // is "not provided", which the rest of this pipeline already handles, and
  // that is far better than a number on the wrong scale.
  return basis === "serving" ? n[`${key}_serving`] : n[`${key}_100g`];
}
function offMicrosMg(
  n: Record<string, number | undefined>,
  key: string,
  basis: "serving" | "100g",
): number | null {
  const raw = offValue(n, key, basis);
  return raw == null ? null : round(raw * 1000, 1);
}
function offMicrosMcg(
  n: Record<string, number | undefined>,
  key: string,
  basis: "serving" | "100g",
): number | null {
  const raw = offValue(n, key, basis);
  return raw == null ? null : round(raw, 1);
}

async function lookupBarcodeOpenFoodFacts(barcode: string): Promise<FoodLookupOutcome> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      {
        headers: { "User-Agent": "Forge-Fitness-App/1.0" },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      },
    );
    // A 404 from Open Food Facts genuinely means "no such product"; a 5xx or a
    // rate-limit means the database is having a bad day and says nothing about
    // whether the product exists.
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "unavailable" };
    const data = await res.json();
    if (data.status !== 1 || !data.product) return { status: "not_found" };
    const p = data.product;
    const n = p.nutriments ?? {};
    const servingSize = p.serving_size ? String(p.serving_size) : null;
    const basis = offBasis(n);
    const sodiumRaw = offValue(n, "sodium", basis);
    const candidate: FoodCandidate = {
      description: p.product_name?.trim() || p.generic_name?.trim() || "Unknown product",
      brand: p.brands?.split(",")[0]?.trim() || null,
      // Says what the numbers are actually for. Labelling a per-100 g entry
      // with the product's serving size is what made the mismatch invisible.
      servingDescription: basis === "serving" ? servingSize : "100 g",
      caloriesKcal: round(offValue(n, "energy-kcal", basis), 0),
      proteinG: round(offValue(n, "proteins", basis)),
      carbsG: round(offValue(n, "carbohydrates", basis)),
      fatG: round(offValue(n, "fat", basis)),
      fiberG: round(offValue(n, "fiber", basis)),
      sodiumMg: sodiumRaw == null ? null : round(sodiumRaw * 1000, 0),
      calciumMg: offMicrosMg(n, "calcium", basis),
      ironMg: offMicrosMg(n, "iron", basis),
      vitaminDMcg: offMicrosMcg(n, "vitamin-d", basis),
      potassiumMg: offMicrosMg(n, "potassium", basis),
      magnesiumMg: offMicrosMg(n, "magnesium", basis),
      vitaminB12Mcg: offMicrosMcg(n, "vitamin-b12", basis),
      zincMg: offMicrosMg(n, "zinc", basis),
      barcode,
    };
    flagImplausibleValues("Open Food Facts", candidate);
    flagIfNoNutrientsMatched("Open Food Facts", candidate, Object.keys(n));
    return { status: "found", food: candidate };
  } catch (err) {
    // Network failure, DNS, or the timeout above firing. None of these is
    // evidence about the product, so do not let the athlete be told it does
    // not exist.
    console.error("Open Food Facts lookup failed:", err);
    return { status: "unavailable" };
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

async function lookupBarcodeUsda(barcode: string): Promise<FoodLookupOutcome> {
  // Not configured is not the same as unreachable: with no key there is
  // nothing wrong, this source simply is not in play.
  if (!usdaFoodLookupEnabled) return { status: "not_found" };
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(
        barcode,
      )}&dataType=Branded&pageSize=1`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    if (!res.ok) return { status: "unavailable" };
    const data = await res.json();
    const food = data.foods?.[0];
    if (!food || food.gtinUpc !== barcode) return { status: "not_found" };
    return { status: "found", food: usdaFoodToCandidate(food, barcode) };
  } catch (err) {
    console.error("USDA barcode lookup failed:", err);
    return { status: "unavailable" };
  }
}

/** Barcode-first lookup: Open Food Facts, then USDA branded search as a
 * fallback if the former has no match.
 *
 * "unavailable" only survives if BOTH sources failed to answer -- one source
 * being down while the other returns a real miss is still a real miss, and
 * the athlete should be told to enter it manually rather than to retry
 * something that will not start working. */
export async function lookupBarcode(barcode: string): Promise<FoodLookupOutcome> {
  const off = await lookupBarcodeOpenFoodFacts(barcode);
  if (off.status === "found") return off;

  // An unconfigured USDA is not a source that answered -- it is a source that
  // was never asked. Letting its "not_found" count as a vote turned a genuine
  // Open Food Facts outage back into "no such product" on every deployment
  // without a USDA key, which is the default one. Caught by the tests below,
  // not by reading it.
  if (!usdaFoodLookupEnabled) return off;

  const usda = await lookupBarcodeUsda(barcode);
  if (usda.status === "found") return usda;
  // Both were asked and neither could answer.
  if (off.status === "unavailable" && usda.status === "unavailable") {
    return { status: "unavailable" };
  }
  // At least one gave a real answer and it was a miss. Telling the athlete to
  // retry would be telling them to wait for something that will not change.
  return { status: "not_found" };
}

/** Name search against USDA FoodData Central -- covers generic/raw foods
 * (an Open Food Facts barcode lookup can't help with "grilled chicken
 * breast") as well as branded items. Empty array (not an error) if USDA
 * isn't configured or nothing matches. */
export async function searchFoodsByName(
  query: string,
): Promise<{ status: "ok"; foods: FoodCandidate[] } | { status: "unavailable" }> {
  // The route checks usdaFoodLookupEnabled itself and answers 503 with its own
  // "not set up on this server" wording, so reaching here means it is on.
  if (!usdaFoodLookupEnabled) return { status: "ok", foods: [] };
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(
        query,
      )}&pageSize=10`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    // Same distinction the barcode path makes: an empty result set is "no such
    // food", a dead endpoint is not, and telling an athlete their search
    // matched nothing when USDA is down sends them to retype it by hand.
    if (!res.ok) return { status: "unavailable" };
    const data = await res.json();
    return { status: "ok", foods: (data.foods ?? []).map((food: any) => usdaFoodToCandidate(food, null)) };
  } catch (err) {
    console.error("USDA food search failed:", err);
    return { status: "unavailable" };
  }
}
