import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import {
  APP_SHELL_FILE,
  PUBLIC_STATIC_OPTIONS,
  prerenderedFileFor,
  servePrerendered,
  spaFallback,
  staticLimiter,
} from "./public-static";

/** A PATH THE APP HAS NO PAGE FOR IS A 404, NOT A 200 WITH THE NOT-FOUND PAGE IN IT.
 *
 * The body is the same either way -- the shell, so the person sees the client's not-found page
 * -- but the status is what a crawler reads, and a 200 for /pricng gets indexed as a page. The
 * shell itself carries noindex, so a signed-in route reached by a crawler is a 200 that says
 * "do not index me" rather than the home page's head under a different URL, which is what
 * index.html became once the prerenderer started overwriting it with the home page.
 */
let dir: string;
let server: Server;
let base: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-404-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<title>HOME</title>");
  fs.writeFileSync(path.join(dir, APP_SHELL_FILE), '<meta name="robots" content="noindex, nofollow" /><title>SHELL</title>');
  fs.writeFileSync(path.join(dir, prerenderedFileFor("/pricing")), "<title>PRICING</title>");
  const app = express();
  app.use(staticLimiter);
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

describe("the SPA fallback's status", () => {
  it("is 404 for a path the client has no page for, with the shell as the body", async () => {
    for (const u of ["/pricng", "/movement/back-squat", "/no-such-page", "/pricing/extra/deep"]) {
      const res = await fetch(`${base}${u}`);
      expect(res.status, u).toBe(404);
      expect(await res.text(), u).toContain("<title>SHELL</title>");
    }
  });

  it("is 200 for the signed-in app and the token landings, on a shell that says noindex", async () => {
    for (const u of ["/coach", "/athlete/calendar", "/admin/exercises", "/documents", "/reset-password?token=x", "/team/ABC123", "/guardian/claim"]) {
      const res = await fetch(`${base}${u}`);
      expect(res.status, u).toBe(200);
      const body = await res.text();
      expect(body, u).toContain("<title>SHELL</title>");
      expect(body, u).toContain('name="robots" content="noindex');
    }
  });

  it("still serves the home page and a prerendered page as themselves", async () => {
    expect(await (await fetch(`${base}/`)).text()).toBe("<title>HOME</title>");
    expect(await (await fetch(`${base}/pricing`)).text()).toBe("<title>PRICING</title>");
  });

  it("falls back to index.html on a dist built before the shell existed", async () => {
    const old = fs.mkdtempSync(path.join(os.tmpdir(), "forge-404-old-"));
    fs.writeFileSync(path.join(old, "index.html"), "<title>OLD</title>");
    const app = express();
    app.use("*", spaFallback(old));
    const s = await new Promise<Server>((resolve) => {
      const srv = app.listen(0, () => resolve(srv));
    });
    const a = s.address();
    const res = await fetch(`http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}/coach`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<title>OLD</title>");
    await new Promise<void>((r) => s.close(() => r()));
    fs.rmSync(old, { recursive: true, force: true });
  });
});
