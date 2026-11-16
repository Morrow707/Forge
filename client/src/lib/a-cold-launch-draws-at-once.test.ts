import { beforeEach, describe, expect, it, vi } from "vitest";

/** The phone draws at once from who was signed in last time (lib/last-signed-in-user.ts), and
 *  only when its sign-in token names that same account. */
const store = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

async function load(native: boolean) {
  vi.resetModules();
  vi.doMock("@capacitor/core", () => ({
    Capacitor: { isNativePlatform: () => native, getPlatform: () => (native ? "ios" : "web") },
  }));
  vi.stubGlobal("window", { localStorage });
  const q = await import("./queryClient");
  const m = await import("./last-signed-in-user");
  return { ...q, ...m };
}

describe("a cold launch draws at once", () => {
  beforeEach(() => store.clear());

  it("the phone uses the last signed-in user when its token names that account", async () => {
    const m = await load(true);
    m.setNativeToken("7.42.9999999999999.abc");
    m.rememberSignedInUser({ id: 7 });
    expect(m.readLastSignedInUser()).toEqual({ id: 7 });
  });

  it("a different account's token, no token, or a sign-out uses nothing", async () => {
    const m = await load(true);
    m.rememberSignedInUser({ id: 7 });
    m.setNativeToken("8.42.9999999999999.abc");
    expect(m.readLastSignedInUser()).toBeUndefined();
    m.setNativeToken(null);
    expect(m.readLastSignedInUser()).toBeUndefined();
    m.setNativeToken("7.42.9999999999999.abc");
    m.rememberSignedInUser(null);
    expect(m.readLastSignedInUser()).toBeUndefined();
  });

  it("the web never uses it", async () => {
    const m = await load(false);
    store.set("forge-last-signed-in-user", JSON.stringify({ id: 7 }));
    expect(m.readLastSignedInUser()).toBeUndefined();
  });
});
