import { beforeEach, describe, expect, it, vi } from "vitest";

// The debug console is the only instrument that works on a phone, and a force close used to
// take it. See debug-console.ts.
// The unit suite runs in node; a Map-backed localStorage is all the module needs.
function installLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

describe("the debug console survives a force close", () => {
  beforeEach(() => {
    vi.resetModules();
    installLocalStorage();
    vi.useFakeTimers();
  });

  it("persists lines and reads them back on the next launch, marked as the previous run", async () => {
    const first = await import("./debug-console");
    first.logDebug("SAVE", "log POST ok");
    vi.advanceTimersByTime(300);
    expect(localStorage.getItem("forge.debugConsole")).toContain("log POST ok");

    vi.resetModules();
    const second = await import("./debug-console");
    let seen: { tag: string; message: string }[] = [];
    second.subscribeDebug((entries) => {
      seen = entries;
    });
    expect(seen.map((e) => e.message)).toContain("log POST ok");
    expect(seen[seen.length - 1].message).toMatch(/app relaunched/);
  });

  it("clearing the console clears the stored copy too", async () => {
    const mod = await import("./debug-console");
    mod.logDebug("CAM", "x");
    vi.advanceTimersByTime(300);
    mod.clearDebug();
    expect(localStorage.getItem("forge.debugConsole")).toBeNull();
  });
});
