import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { assertFieldEncryptionConfigured, resetFieldEncryptionKeyForTest } from "./field-encryption";

/** The encryption key has to be checked when the server STARTS, not when two-factor login is
 * first used. A misspelled variable name on the host sat unnoticed for the whole beta because
 * nothing read the key until a settings screen nobody opened. */
describe("field encryption is checked at startup", () => {
  const saved = { key: process.env.PII_ENCRYPTION_KEY, env: process.env.NODE_ENV };
  afterEach(() => {
    process.env.PII_ENCRYPTION_KEY = saved.key;
    process.env.NODE_ENV = saved.env;
    resetFieldEncryptionKeyForTest();
  });

  it("a missing key in production throws a message that names the variable", () => {
    delete process.env.PII_ENCRYPTION_KEY;
    process.env.NODE_ENV = "production";
    resetFieldEncryptionKeyForTest();
    expect(() => assertFieldEncryptionConfigured()).toThrow(/PII_ENCRYPTION_KEY is not set/);
  });

  it("a key of the wrong length throws rather than being accepted", () => {
    process.env.PII_ENCRYPTION_KEY = "abc123";
    process.env.NODE_ENV = "production";
    resetFieldEncryptionKeyForTest();
    expect(() => assertFieldEncryptionConfigured()).toThrow(/32 bytes/);
  });

  it("the server calls it before registering routes, in production", () => {
    const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const call = src.indexOf("assertFieldEncryptionConfigured()");
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(src.indexOf("await registerRoutes(app)"));
    expect(src.slice(call - 80, call)).toContain('NODE_ENV === "production"');
  });
});
