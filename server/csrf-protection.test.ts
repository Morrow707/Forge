import { describe, it, expect } from "vitest";
import { verifyRequestOrigin } from "./csrf-protection";

/** The origin check is the whole CSRF defence here (the session cookie is SameSite=None for the
 * native app), so every branch of it is driven with a fake request. The case that matters is
 * `Origin: null`: a browser sends it for a form posted from a sandboxed iframe or a data: URL,
 * and the first version read it as "no Origin header" and let the request through. */
function run(headers: Record<string, string | undefined>, method = "POST") {
  const mw = verifyRequestOrigin(["capacitor://localhost", "https://localhost"]);
  let status: number | null = null;
  let nexted = false;
  const req = { method, headers: { host: "forgeperformancesystems.com", ...headers } } as any;
  const res = { status: (s: number) => ({ json: () => void (status = s) }) } as any;
  mw(req, res, () => void (nexted = true));
  return { status, nexted };
}

describe("verifyRequestOrigin", () => {
  it("lets a same-host Origin through", () => {
    expect(run({ origin: "https://forgeperformancesystems.com" })).toEqual({ status: null, nexted: true });
  });
  it("lets the native app's origins through", () => {
    expect(run({ origin: "capacitor://localhost" }).nexted).toBe(true);
    expect(run({ origin: "https://localhost" }).nexted).toBe(true);
  });
  it("refuses a foreign Origin", () => {
    expect(run({ origin: "https://evil.example" })).toEqual({ status: 403, nexted: false });
  });
  it("REFUSES `Origin: null`, which a sandboxed iframe or data: URL form sends", () => {
    expect(run({ origin: "null" })).toEqual({ status: 403, nexted: false });
    // ...even with a matching Referer beside it: the Origin is the browser's own statement.
    expect(run({ origin: "null", referer: "https://forgeperformancesystems.com/x" })).toEqual({ status: 403, nexted: false });
  });
  it("refuses a malformed Origin the same way", () => {
    expect(run({ origin: "not a url" })).toEqual({ status: 403, nexted: false });
  });
  it("falls back to the Referer only when there is no Origin at all", () => {
    expect(run({ referer: "https://forgeperformancesystems.com/athlete" }).nexted).toBe(true);
    expect(run({ referer: "https://evil.example/page" })).toEqual({ status: 403, nexted: false });
  });
  it("lets a request with neither header through (the webhook case)", () => {
    expect(run({})).toEqual({ status: null, nexted: true });
  });
  it("never judges a safe method", () => {
    expect(run({ origin: "null" }, "GET").nexted).toBe(true);
    expect(run({ origin: "https://evil.example" }, "HEAD").nexted).toBe(true);
  });
});
