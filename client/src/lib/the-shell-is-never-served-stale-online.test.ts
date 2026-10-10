/**
 * The service worker answers a navigation with the LIVE shell and falls back to the precached
 * one only when the network cannot answer.
 *
 * 2026-10-10: Scott tapped "Notice to Parent or Guardian" in a roster email and got the app's
 * 404 page. The server answered 200 with the right title; the worker on his phone served the
 * index.html it had precached before the deploy that added the route, and that shell's bundle
 * carries the router, so the router had never heard of the path. Every route added in a deploy
 * met the same window.
 *
 * Two halves, like the other scans: the handler is exercised with real promises, and sw.ts is
 * read to prove it is the thing wired into the navigation route (a correct handler nobody calls
 * is the same bug).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { answerNavigation } from "../sw-shell";

const LIVE = () => new Response("<title>live</title>", { status: 200 });
const PRECACHED = () => new Response("<title>precached</title>", { status: 200 });
const body = (r: Response) => r.text();

describe("a navigation is answered by the live shell first", () => {
  it("returns the network's answer when it arrives", async () => {
    const res = await answerNavigation({
      fetchLive: async () => LIVE(),
      precachedShell: async () => PRECACHED(),
    });
    expect(await body(res)).toContain("live");
  });

  it("serves the server's own 404 shell as it came: the server decides what is a page", async () => {
    const res = await answerNavigation({
      fetchLive: async () => new Response("<title>not a page</title>", { status: 404 }),
      precachedShell: async () => PRECACHED(),
    });
    expect(res.status).toBe(404);
    expect(await body(res)).toContain("not a page");
  });

  it("falls back to the precached shell when offline (the fetch rejects)", async () => {
    const res = await answerNavigation({
      fetchLive: async () => {
        throw new TypeError("Load failed");
      },
      precachedShell: async () => PRECACHED(),
    });
    expect(await body(res)).toContain("precached");
  });

  it("falls back to the precached shell on a 5xx: a deploy's 502 is not a page", async () => {
    const res = await answerNavigation({
      fetchLive: async () => new Response("Bad Gateway", { status: 502 }),
      precachedShell: async () => PRECACHED(),
    });
    expect(await body(res)).toContain("precached");
  });

  it("falls back to the precached shell when the network is slower than the timeout", async () => {
    const res = await answerNavigation({
      fetchLive: () => new Promise<Response>((resolve) => setTimeout(() => resolve(LIVE()), 200)),
      precachedShell: async () => PRECACHED(),
      timeoutMs: 20,
    });
    expect(await body(res)).toContain("precached");
  });

  it("does not wait for the timeout when the network has already answered", async () => {
    const started = Date.now();
    await answerNavigation({
      fetchLive: async () => LIVE(),
      precachedShell: async () => PRECACHED(),
      timeoutMs: 5000,
    });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("sw.ts wires that handler into the navigation route", () => {
  const sw = fs.readFileSync(path.resolve(__dirname, "../sw.ts"), "utf8");

  it("imports answerNavigation and hands it the real request and the precached shell", () => {
    expect(sw).toMatch(/import \{ answerNavigation \} from "\.\/sw-shell"/);
    const route = sw.slice(sw.indexOf("new NavigationRoute("));
    expect(route).toContain("answerNavigation(");
    expect(route).toMatch(/fetchLive: \(\) => fetch\(params\.request\)/);
    expect(route).toMatch(/precachedShell: \(\) => precachedShell\(params\)/);
  });

  it("never hands a navigation the precached shell directly (the stale-router bug)", () => {
    expect(sw).not.toMatch(/new NavigationRoute\(\s*createHandlerBoundToURL/);
  });

  it("still keeps API routes out of the navigation fallback", () => {
    const route = sw.slice(sw.indexOf("new NavigationRoute("));
    expect(route).toMatch(/denylist: \[\/\^\\\/api\\\/\/\]/);
  });
});
