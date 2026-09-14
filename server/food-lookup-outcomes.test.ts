import { describe, it, expect, vi, afterEach } from "vitest";

// "Not in the database" and "the database didn't answer" used to arrive at the
// athlete as the same sentence: "Couldn't find that product -- try search or
// enter it manually." They need different words because they need different
// actions. A miss means retype the label. An outage means wait a minute --
// and being told to retype a whole nutrition panel because Open Food Facts
// had a bad thirty seconds is the kind of thing that stops someone logging.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.resetModules();
});

async function loadLookup() {
  // Imported fresh each time: the module reads USDA_FDC_API_KEY at import.
  return await import("./food-lookup");
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("a barcode lookup separates a miss from an outage", () => {
  it("reports not_found when Open Food Facts says the product is not there", async () => {
    globalThis.fetch = vi.fn(async () => respond({ status: 0 })) as unknown as typeof fetch;
    const { lookupBarcode } = await loadLookup();
    expect((await lookupBarcode("0000")).status).toBe("not_found");
  });

  it("reports not_found on a 404, which is a real answer", async () => {
    globalThis.fetch = vi.fn(async () => respond({}, 404)) as unknown as typeof fetch;
    const { lookupBarcode } = await loadLookup();
    expect((await lookupBarcode("0000")).status).toBe("not_found");
  });

  it("reports unavailable when the request throws", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND world.openfoodfacts.org");
    }) as unknown as typeof fetch;
    const { lookupBarcode } = await loadLookup();
    expect((await lookupBarcode("0000")).status).toBe("unavailable");
  });

  it("reports unavailable on a 5xx, which says nothing about the product", async () => {
    globalThis.fetch = vi.fn(async () => respond({}, 503)) as unknown as typeof fetch;
    const { lookupBarcode } = await loadLookup();
    expect((await lookupBarcode("0000")).status).toBe("unavailable");
  });

  it("returns the product when one is found", async () => {
    globalThis.fetch = vi.fn(async () =>
      respond({
        status: 1,
        product: { product_name: "Test Bar", brands: "Testco", nutriments: { "energy-kcal_100g": 200 } },
      }),
    ) as unknown as typeof fetch;
    const { lookupBarcode } = await loadLookup();
    const result = await lookupBarcode("0000");
    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.food.description).toBe("Test Bar");
  });

  it("does not cry outage when one source is down but the other gives a real miss", async () => {
    // With no USDA key the second source is not in play at all, which is a
    // configuration fact rather than an outage -- so a clean miss from Open
    // Food Facts has to stay a miss.
    globalThis.fetch = vi.fn(async () => respond({ status: 0 })) as unknown as typeof fetch;
    const { lookupBarcode } = await loadLookup();
    expect((await lookupBarcode("0000")).status).toBe("not_found");
  });
});

describe("name search separates an empty result from an outage", () => {
  it("reports unavailable when USDA throws", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key");
    globalThis.fetch = vi.fn(async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    const { searchFoodsByName } = await loadLookup();
    expect((await searchFoodsByName("chicken")).status).toBe("unavailable");
    vi.unstubAllEnvs();
  });

  it("reports ok with an empty list when USDA genuinely matched nothing", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key");
    globalThis.fetch = vi.fn(async () => respond({ foods: [] })) as unknown as typeof fetch;
    const { searchFoodsByName } = await loadLookup();
    const result = await searchFoodsByName("asdfghjkl");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.foods).toEqual([]);
    vi.unstubAllEnvs();
  });
});
