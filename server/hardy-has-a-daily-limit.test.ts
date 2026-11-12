import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/* HARDY'S DAILY LIMIT IS TAKEN BEFORE THE MODEL IS ASKED (2026-11-12).
 *
 * The design has said "50 questions a day" since it was written and the route enforced nothing.
 * The counting itself is proven on real Postgres in hardy.itest.ts; this holds the ORDER in the
 * ask route, which no database can show: the count comes after every reply that costs nothing and
 * before the logs are read or the model is called, and it is awaited. */

const src = readFileSync(join(__dirname, "hardy.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** The ask route's own handler: from its registration to the next route registered after it. */
function askHandler(): string {
  const start = src.indexOf('app.post("/api/hardy/ask"');
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf("\n  app.", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("Hardy's daily limit", () => {
  it("is fifty", () => {
    expect(src).toMatch(/export const HARDY_ASKS_PER_DAY = 50;/);
  });

  it("is counted, awaited, before the logs are read and the model is asked", () => {
    const h = askHandler();
    const take = h.indexOf("await takeHardyAsk(user.id)");
    expect(take).toBeGreaterThan(-1);
    expect(take).toBeLessThan(h.indexOf("historyContext("));
    expect(take).toBeLessThan(h.indexOf("askClaudeStructured"));
  });

  it("is counted only after the refusals and the name-the-athlete reply, which cost nothing", () => {
    const h = askHandler();
    const take = h.indexOf("await takeHardyAsk(user.id)");
    expect(h.indexOf("if (!access.allowed)")).toBeLessThan(take);
    expect(h.indexOf("Name the athlete you mean")).toBeLessThan(take);
  });

  it("answers 429 with a sentence that names the way through", () => {
    expect(askHandler()).toContain("res.status(HTTP.tooMany).json({ message: HARDY_LIMIT_MESSAGE })");
    expect(src).toMatch(/HARDY_LIMIT_MESSAGE = `[^`]*Search still finds[^`]*tomorrow/);
  });

  it("counts on the server's day, never the day the phone sends", () => {
    expect(askHandler()).not.toMatch(/takeHardyAsk\(user\.id,/);
  });

  it("does not count a search", () => {
    const start = src.indexOf('app.get("/api/hardy/search"');
    const search = src.slice(start, src.indexOf("\n  app.", start + 1));
    expect(search).not.toContain("takeHardyAsk");
  });
});
