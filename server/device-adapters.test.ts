/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures are literal vendor payloads */
import { describe, expect, it } from "vitest";
import { adapterFor, gymawareAdapter, hawkinAdapter, hawkinMetricKind, parseJsonLines, type FetchLike } from "./device-adapters";
import { AWAITING_PARTNER_ACCESS } from "@shared/device-integrations";

type Call = { url: string; headers: Record<string, string> };

function fakeFetch(routes: Record<string, (url: string) => { status: number; body: string }>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    const res = key ? routes[key](url) : { status: 404, body: "" };
    return { ok: res.status < 400, status: res.status, text: async () => res.body };
  };
  return { fetch: fetchFn, calls };
}

const HAWKIN = "https://cloud.hawkindynamics.com";

describe("Hawkin Dynamics", () => {
  const vendor = () =>
    fakeFetch({
      [`${HAWKIN}/api/token`]: () => ({ status: 200, body: JSON.stringify({ access_token: "access-1", expires_at: 1 }) }),
      [`${HAWKIN}/api/v1/athletes`]: () => ({
        status: 200,
        body: JSON.stringify({ data: [{ id: "h1", name: "Jordan Reyes", active: true, external: { email: "jordan@example.com" } }, { id: "h2", name: "Sam Lee" }] }),
      }),
      [`${HAWKIN}/api/v1?`]: (url) => ({
        status: 200,
        body: JSON.stringify(
          url.includes("cursor=c2")
            ? { data: [{ id: "t2", timestamp: 1763650000, athlete: { id: "h2", name: "Sam Lee" }, testType: { name: "Squat Jump" } }], lastSyncTime: "1763650100", hasMore: false }
            : {
                data: [{ id: "t1", timestamp: 1763647380, athlete: { id: "h1", name: "Jordan Reyes" }, testType: { name: "Countermovement Jump" }, "Jump Height(m)": 0.41 }],
                lastSyncTime: "1763647400",
                hasMore: true,
                nextCursor: "c2",
              },
        ),
      }),
    });

  it("exchanges the Integration Key for an access token and uses the token, never the key, for data", async () => {
    const { fetch, calls } = vendor();
    const adapter = hawkinAdapter(fetch);
    await adapter.listAthletes({ integrationKey: "refresh-key" });
    expect(calls[0]).toMatchObject({ url: `${HAWKIN}/api/token`, headers: { Authorization: "Bearer refresh-key" } });
    expect(calls[1].headers.Authorization).toBe("Bearer access-1");
  });

  it("lists athletes with the email Hawkin carries", async () => {
    const { fetch } = vendor();
    expect(await hawkinAdapter(fetch).listAthletes({ integrationKey: "k" })).toEqual([
      { vendorAthleteId: "h1", name: "Jordan Reyes", email: "jordan@example.com" },
      { vendorAthleteId: "h2", name: "Sam Lee", email: null },
    ]);
  });

  it("follows the pages and hands back lastSyncTime as the next cursor", async () => {
    const { fetch, calls } = vendor();
    const out = await hawkinAdapter(fetch).fetchReadingsSince({ integrationKey: "k" }, "1763600000", new Date(0));
    expect(out.readings.map((r) => [r.vendorReadingId, r.vendorAthleteId, r.metricKind])).toEqual([
      ["t1", "h1", "countermovement_jump"],
      ["t2", "h2", "force_plate_test"],
    ]);
    expect(out.readings[0].recordedAt.toISOString()).toBe(new Date(1763647380000).toISOString());
    expect(out.nextCursor).toBe("1763650100");
    expect(calls.some((c) => c.url.includes("syncFrom=1763600000"))).toBe(true);
  });

  it("with no cursor, starts from the lookback window in Unix seconds", async () => {
    const { fetch, calls } = vendor();
    await hawkinAdapter(fetch).fetchReadingsSince({ integrationKey: "k" }, null, new Date(1763000000000));
    expect(calls.find((c) => c.url.includes("/api/v1?"))?.url).toContain("syncFrom=1763000000");
  });

  it("uses the region's host", async () => {
    const { fetch, calls } = fakeFetch({ "https://eu.cloud.hawkindynamics.com/api/token": () => ({ status: 200, body: '{"access_token":"a"}' }) });
    expect((await hawkinAdapter(fetch).validate({ integrationKey: "k", region: "Europe" })).ok).toBe(true);
    expect(calls[0].url).toBe("https://eu.cloud.hawkindynamics.com/api/token");
  });

  it("a refused key is a sentence for the coach, not a throw", async () => {
    const { fetch } = fakeFetch({ [`${HAWKIN}/api/token`]: () => ({ status: 401, body: "" }) });
    const v = await hawkinAdapter(fetch).validate({ integrationKey: "bad" });
    expect(v).toMatchObject({ ok: false, status: "error" });
    expect(v.ok ? "" : v.message).toContain("refused the key");
  });

  it("names the test type", () => {
    expect(hawkinMetricKind("Countermovement Jump")).toBe("countermovement_jump");
    expect(hawkinMetricKind(null)).toBe("force_plate_test");
  });
});

describe("GymAware", () => {
  const lines = (...rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n");

  it("sends HTTP Basic with the Account ID and the token", async () => {
    const { fetch, calls } = fakeFetch({ "https://cloud.gymaware.com/api/athletes": () => ({ status: 200, body: "" }) });
    expect((await gymawareAdapter(fetch).validate({ accountId: "ACC", token: "TOK" })).ok).toBe(true);
    expect(calls[0].headers.Authorization).toBe(`Basic ${Buffer.from("ACC:TOK").toString("base64")}`);
  });

  it("reads the newline-separated athlete stream", async () => {
    const { fetch } = fakeFetch({
      "https://cloud.gymaware.com/api/athletes": () => ({
        status: 200,
        body: lines({ athleteReference: "g1", firstName: "Jordan", lastName: "Reyes" }, { athleteReference: "g2", displayName: "Sam Lee" }),
      }),
    });
    expect(await gymawareAdapter(fetch).listAthletes({ accountId: "a", token: "t" })).toEqual([
      { vendorAthleteId: "g1", name: "Jordan Reyes", email: null },
      { vendorAthleteId: "g2", name: "Sam Lee", email: null },
    ]);
  });

  it("asks /api/reps in windows of at most a month and skips deleted sets", async () => {
    const now = new Date(1763647380000);
    const { fetch, calls } = fakeFetch({
      "https://cloud.gymaware.com/api/reps": () => ({
        status: 200,
        body: lines(
          { reference: "s1", recorded: 1763640000, athleteReference: "g1", exerciseName: "Back Squat", reps: [{ meanVelocity: 0.8 }] },
          { reference: "s2", recorded: 1763640100, athleteReference: "g1", deleted: true },
        ),
      }),
    });
    const out = await gymawareAdapter(fetch, () => now).fetchReadingsSince({ accountId: "a", token: "t" }, null, new Date(now.getTime() - 45 * 86_400_000));
    expect(calls).toHaveLength(2);
    expect(out.nextCursor).toBe("1763647380");
    // Two windows answered the same stream, so s1 arrives twice; the database's unique index is
    // what keeps it once (see the itest), not the adapter.
    expect(out.readings.every((r) => r.vendorReadingId === "s1" && r.metricKind === "bar_velocity_set")).toBe(true);
  });

  it("skips a line that is not JSON rather than failing the stream", () => {
    expect(parseJsonLines('{"a":1}\nnot json\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe("vendors Forge has applied to", () => {
  it.each(["vald", "perch", "catapult"] as const)("%s never pretends to sync and never calls the network", async (vendor) => {
    const { fetch, calls } = fakeFetch({});
    const adapter = adapterFor(vendor, fetch);
    expect(adapter.live).toBe(false);
    expect(await adapter.validate({ x: "y" })).toEqual({ ok: false, status: "awaiting_partner_access", message: AWAITING_PARTNER_ACCESS });
    expect(await adapter.fetchReadingsSince({}, null, new Date())).toEqual({ readings: [], nextCursor: null });
    expect(calls).toHaveLength(0);
  });
});
