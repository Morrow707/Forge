import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A PRODUCTION SERVER STILL VERIFIES A SANDBOX PURCHASE (2026-10-08). Apple's SignedDataVerifier
// is bound to one environment and throws INVALID_ENVIRONMENT for the other. With one verifier,
// the launch-day switch to production would have refused every sandbox-signed purchase from
// that moment on -- and App Review tests purchases in the sandbox, as does every TestFlight
// tester. Apple's guidance: verify against production, retry against sandbox on a mismatch.
// This fakes the library's verifier (same constructor contract, same exception) and drives
// both verify paths through every configuration that matters.
vi.mock("@apple/app-store-server-library", async (importOriginal) => {
  const real = await importOriginal<typeof import("@apple/app-store-server-library")>();
  class FakeVerifier {
    constructor(_certs: Buffer[], _online: boolean, public env: string, _bundle: string, appAppleId?: number) {
      if (env === real.Environment.PRODUCTION && appAppleId === undefined) throw new Error("appAppleId is required when the environment is Production");
    }
    async verifyAndDecodeTransaction(payload: string) {
      const p = JSON.parse(payload);
      if (p.bad) throw new real.VerificationException(real.VerificationStatus.VERIFICATION_FAILURE);
      if (p.environment !== this.env) throw new real.VerificationException(real.VerificationStatus.INVALID_ENVIRONMENT);
      return { originalTransactionId: "1", productId: p.productId, expiresDate: 4102444800000, environment: p.environment };
    }
    async verifyAndDecodeNotification(payload: string) {
      const p = JSON.parse(payload);
      if (p.environment !== this.env) throw new real.VerificationException(real.VerificationStatus.INVALID_ENVIRONMENT);
      return { notificationType: "DID_RENEW", data: { signedTransactionInfo: JSON.stringify({ environment: p.environment, productId: p.productId }) } };
    }
  }
  return { ...real, SignedDataVerifier: FakeVerifier };
});

const BASIC = "com.foreperformancesystems.forge.freeagent.basic_v2";
const tx = (environment: string, extra: Record<string, unknown> = {}) => JSON.stringify({ environment, productId: BASIC, ...extra });

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ["APPLE_IAP_ENVIRONMENT", "APPLE_APP_APPLE_ID"]) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  return await import("./apple-iap");
}

const saved = { ...process.env };
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe("the order of environments tried", () => {
  it("is production then sandbox on a production server, sandbox alone otherwise", async () => {
    const m = await load({ APPLE_IAP_ENVIRONMENT: "production", APPLE_APP_APPLE_ID: "1234567890" });
    expect(m.verifierEnvironmentsToTry("Production" as any)).toEqual(["Production", "Sandbox"]);
    expect(m.verifierEnvironmentsToTry("Sandbox" as any)).toEqual(["Sandbox"]);
  });
});

describe("a production server", () => {
  it("verifies a production purchase and records its environment", async () => {
    const m = await load({ APPLE_IAP_ENVIRONMENT: "production", APPLE_APP_APPLE_ID: "1234567890" });
    const r = await m.verifyAppleTransaction(tx("Production"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transaction.environment).toBe("Production");
  });

  it("STILL verifies a sandbox purchase (App Review, TestFlight) and records that it was sandbox", async () => {
    const m = await load({ APPLE_IAP_ENVIRONMENT: "production", APPLE_APP_APPLE_ID: "1234567890" });
    const r = await m.verifyAppleTransaction(tx("Sandbox"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transaction.environment).toBe("Sandbox");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("verified in Sandbox while this server is configured for Production"));
  });

  it("does not retry a bad signature against sandbox", async () => {
    const m = await load({ APPLE_IAP_ENVIRONMENT: "production", APPLE_APP_APPLE_ID: "1234567890" });
    const r = await m.verifyAppleTransaction(tx("Production", { bad: true }));
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("with no APPLE_APP_APPLE_ID cannot build the production verifier but still serves sandbox", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await load({ APPLE_IAP_ENVIRONMENT: "production" });
    expect((await m.verifyAppleTransaction(tx("Production"))).ok).toBe(false);
    expect((await m.verifyAppleTransaction(tx("Sandbox"))).ok).toBe(true);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("could not build the Production verifier"), expect.anything(), expect.stringContaining("APPLE_APP_APPLE_ID"));
  });

  it("verifies a sandbox renewal notification with the verifier that accepted it", async () => {
    const m = await load({ APPLE_IAP_ENVIRONMENT: "production", APPLE_APP_APPLE_ID: "1234567890" });
    const n = await m.verifyAppleNotification(JSON.stringify({ environment: "Sandbox", productId: BASIC }));
    expect(n?.kind).toBe("renewed");
    expect(n?.transaction?.environment).toBe("Sandbox");
  });
});

describe("a sandbox server (today)", () => {
  it("verifies sandbox and refuses a production-signed payload, trying one environment only", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await load({ APPLE_IAP_ENVIRONMENT: "sandbox" });
    expect((await m.verifyAppleTransaction(tx("Sandbox"))).ok).toBe(true);
    expect(await m.verifyAppleTransaction(tx("Production"))).toEqual({ ok: false, reason: "invalid" });
    expect(console.warn).not.toHaveBeenCalled();
  });
});
