import { describe, expect, it } from "vitest";
import { redactForLog } from "./log-redaction";

// This used to walk the top-level keys of a plain object and hand back
// anything else untouched, so two of the three shapes a response takes --
// an array, and a secret one level down -- went to the log in full.

describe("redactForLog", () => {
  it("redacts a secret at the top level", () => {
    expect(redactForLog({ id: 1, nativeToken: "abc" })).toEqual({
      id: 1,
      nativeToken: "[redacted]",
    });
  });

  it("redacts a secret nested inside an object", () => {
    expect(redactForLog({ user: { id: 1, nativeToken: "abc" } })).toEqual({
      user: { id: 1, nativeToken: "[redacted]" },
    });
  });

  it("redacts secrets inside an array response", () => {
    expect(redactForLog([{ id: 1, token: "abc" }, { id: 2, token: "def" }])).toEqual([
      { id: 1, token: "[redacted]" },
      { id: 2, token: "[redacted]" },
    ]);
  });

  it("redacts a secret inside an array nested in an object", () => {
    expect(redactForLog({ sessions: [{ mfaToken: "abc" }] })).toEqual({
      sessions: [{ mfaToken: "[redacted]" }],
    });
  });

  it("covers every key it claims to", () => {
    const body = {
      secret: "a",
      otpauthUri: "b",
      mfaToken: "c",
      nativeToken: "d",
      token: "e",
      passwordHash: "f",
      backupCodes: ["g"],
    };
    for (const value of Object.values(redactForLog(body) as Record<string, unknown>)) {
      expect(value).toBe("[redacted]");
    }
  });

  it("leaves ordinary values alone", () => {
    const body = { id: 1, name: "Sam", nested: { count: 2 }, list: [1, 2] };
    expect(redactForLog(body)).toEqual(body);
  });

  it("passes primitives and null through", () => {
    expect(redactForLog(null)).toBeNull();
    expect(redactForLog("plain")).toBe("plain");
    expect(redactForLog(7)).toBe(7);
  });

  it("terminates on a cyclic body instead of overflowing the stack", () => {
    const cyclic: any = { token: "abc" };
    cyclic.self = cyclic;
    expect(() => redactForLog(cyclic)).not.toThrow();
  });
});
