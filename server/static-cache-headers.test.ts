import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMMUTABLE_CACHE_CONTROL,
  LONG_LIVED_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
  cacheControlForStaticPath,
} from "./static-cache-policy";

// The cache policy for the built client (server/static-cache-policy.ts) and the wiring that
// applies it (serveStatic in server/vite.ts). Before this, every hashed chunk went out with
// express.static's default max-age=0 and was revalidated on every page load.

describe("cacheControlForStaticPath", () => {
  it("marks a hashed Vite asset immutable for a year", () => {
    expect(cacheControlForStaticPath("/assets/index-B55Zh5_j.js")).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(cacheControlForStaticPath("/assets/index-Cx1.css")).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(IMMUTABLE_CACHE_CONTROL).toMatch(/max-age=31536000/);
    expect(IMMUTABLE_CACHE_CONTROL).toMatch(/immutable/);
  });

  it("caches the unhashed pose and detection runtimes for a day, never a year", () => {
    for (const p of [
      "/models/MedBallDetector.onnx",
      "/mediapipe-wasm/vision_wasm_internal.wasm",
      "/onnxruntime-wasm/ort-wasm-simd-threaded.wasm",
    ]) {
      expect(cacheControlForStaticPath(p), p).toBe(LONG_LIVED_CACHE_CONTROL);
    }
    expect(LONG_LIVED_CACHE_CONTROL).toBe("public, max-age=86400");
  });

  it("revalidates every entry point: the shell, prerendered pages, the service worker, the manifest", () => {
    for (const p of ["/index.html", "/pricing.html", "/movements/back-squat.html", "/sw.js", "/manifest.webmanifest", "/favicon-32.png"]) {
      expect(cacheControlForStaticPath(p), p).toBe(REVALIDATE_CACHE_CONTROL);
    }
    expect(REVALIDATE_CACHE_CONTROL).toBe("no-cache");
  });
});

describe("serveStatic wiring (server/vite.ts)", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "vite.ts"), "utf8");
  const serveStatic = source.slice(source.indexOf("export function serveStatic("));

  it("passes the policy to express.static through setHeaders", () => {
    expect(serveStatic).toMatch(/express\.static\(distPath, \{ \.\.\.PUBLIC_STATIC_OPTIONS, setHeaders: setStaticCacheHeaders \}\)/);
    expect(source).toMatch(/cacheControlForStaticPath\(/);
  });

  it("marks the documents that go out through sendFile as no-cache before they are served", () => {
    const revalidateAt = serveStatic.indexOf("app.use(revalidateDocuments())");
    const prerenderedAt = serveStatic.indexOf("app.use(servePrerendered(distPath))");
    const fallbackAt = serveStatic.indexOf("spaFallback(distPath)");
    expect(revalidateAt).toBeGreaterThan(-1);
    expect(revalidateAt).toBeLessThan(prerenderedAt);
    expect(prerenderedAt).toBeLessThan(fallbackAt);
  });
});
