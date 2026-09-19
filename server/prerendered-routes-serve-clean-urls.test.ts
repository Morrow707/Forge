import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { PUBLIC_STATIC_OPTIONS, prerenderedFileFor, servePrerendered, spaFallback } from "./public-static";

/** A prerendered public route has to answer at its CLEAN URL with a 200 and its own head.
 *
 * The first prerender wrote `pricing/index.html` and every request for /pricing got a 301 to
 * /pricing/ -- a redirect the sitemap, the canonical tag and every shared link disagreed with.
 * Nothing in the suite noticed because the client router tolerates the slash. This test serves
 * files named by prerenderedFileFor through the exact options serveStatic uses, so the naming and
 * the serving cannot drift apart again without this going red.
 */

const routes = ["/pricing", "/movements", "/movements/back-squat"];
let dir: string;
let server: Server;
let base: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-prerender-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<title>ROOT</title>");
  for (const r of routes) {
    const out = path.join(dir, prerenderedFileFor(r));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `<title>${r}</title>`);
  }
  // A directory that shares a name with a route -- exactly the shape the old prerender produced
  // and the shape /movements has beside /movements/* -- must not turn into a redirect.
  fs.mkdirSync(path.join(dir, "pricing"), { recursive: true });

  const app = express();
  app.use(servePrerendered(dir));
  app.use(express.static(dir, PUBLIC_STATIC_OPTIONS));
  app.use("*", spaFallback(dir));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("the SPA fallback", () => {
  it("answers a client route with the app", async () => {
    const res = await fetch(`${base}/admin/exercises`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<title>ROOT</title>");
  });

  it("answers a missing asset with a real 404, not the app's HTML", async () => {
    // This was a 200 with index.html for as long as the check existed: mounted under
    // app.use("*"), req.path is "/" and the extension test never matched. A stale tab asking
    // for a replaced chunk needs the 404 to trigger its own reload.
    for (const u of ["/assets/index-deadbeef.js", "/missing.css", "/x.js?v=1"]) {
      const res = await fetch(`${base}${u}`);
      expect(res.status, u).toBe(404);
      expect(res.headers.get("content-type")).toContain("text/plain");
    }
  });
});

describe("prerendered public routes", () => {
  it.each(routes)("%s is a 200 at the clean URL with its own head, never a redirect", async (r) => {
    const res = await fetch(`${base}${r}`, { redirect: "manual" });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.text()).toBe(`<title>${r}</title>`);
  });

  it("names the root as index.html and everything else as a flat .html file", () => {
    expect(prerenderedFileFor("/")).toBe("index.html");
    expect(prerenderedFileFor("/pricing")).toBe("pricing.html");
    expect(prerenderedFileFor("/movements/back-squat")).toBe("movements/back-squat.html");
  });

  it("a path outside dist or with an extension is not served by the prerender handler", async () => {
    const asset = await fetch(`${base}/pricing.css`, { redirect: "manual" });
    expect(asset.status).toBe(404);
    const escape = await fetch(`${base}/..%2Fpricing`, { redirect: "manual" });
    expect(await escape.text()).not.toBe("<title>/pricing</title>");
  });

  it("a directory at a route's path does not bring the redirect back", async () => {
    // `pricing/` exists on disk above. With express.static's default `redirect: true` this
    // request would be a 301 to /pricing/ regardless of pricing.html.
    const res = await fetch(`${base}/pricing`, { redirect: "manual" });
    expect(res.status).toBe(200);
  });
});
