import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Switched from the default generateSW strategy to injectManifest so
      // the service worker can also handle Web Push (`push` /
      // `notificationclick`) -- generateSW auto-generates the whole worker
      // and has no hook for custom event listeners. client/src/sw.ts now
      // owns precaching + the SPA offline fallback directly (previously
      // configured here via `workbox` options) alongside the push handling.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Forge",
        short_name: "Forge",
        description: "Coach. Program. Perform.",
        theme_color: "#F65B23",
        background_color: "#0B0B0F",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        // Vite already code-splits aggressively; keep the same "big client
        // chunks still get precached" behavior generateSW had by default.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // The MediaPipe pose-tracking WASM runtime (copied into public/ by
        // scripts/copy-mediapipe-wasm.mjs) is 3 files at ~11-12MB each --
        // an order of magnitude over maximumFileSizeToCacheInBytes above,
        // which fails the production build rather than just skipping them
        // (workbox-build treats an oversized file as fatal, not a warning).
        // They're only needed by the camera bar-tracking feature, not the
        // app shell, so there's no reason to precache them at install time
        // anyway -- sw.ts adds a runtime cache for them instead, so they're
        // still cached after the first time a set gets tracked. Same
        // reasoning and same runtime-cache treatment for onnxruntime-wasm
        // (copy-onnxruntime-wasm.mjs) -- implement-detection.ts's own ONNX
        // runtime, 14-25MB per file, only touched by the object-detection
        // corroboration signal.
        globIgnores: ["**/mediapipe-wasm/**", "**/onnxruntime-wasm/**"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
    // onnxruntime-web's "./wasm" subpath resolves by default to its
    // "bundle" build (ort.wasm.bundle.min.mjs), which embeds a
    // `new URL("ort-wasm-simd-threaded.wasm", import.meta.url)` specifically
    // so bundlers auto-detect and copy the binary themselves -- Vite obliges,
    // emitting a SECOND, unused 14MB copy into assets/ (implement-detection.ts
    // already points onnxruntime-web at the one copy-onnxruntime-wasm.mjs
    // deployed to public/onnxruntime-wasm/ via ort.env.wasm.wasmPaths, so the
    // bundler-managed copy is pure dead weight, and its size fails the PWA
    // precache build the same way the original whole-dist-folder copy did).
    // This custom condition (documented in onnxruntime-web's own package.json
    // exports map, not this codebase's invention) selects the non-bundle
    // variant instead, which has no such static reference and defers entirely
    // to wasmPaths at runtime, matching how this app already manages the file.
    conditions: ["onnxruntime-web-use-extern-wasm"],
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: true,
    // vendor-charts (recharts) is inherently large but lazy -- only fetched
    // by the handful of pages that render a chart, never on initial load --
    // so the default 500kB warning for it is no longer a signal of anything.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Without this, Rollup names a shared vendor chunk after whichever
        // of its importers it picks arbitrarily -- recharts (only used by
        // a few history/analytics dialogs) was showing up as a 360kB chunk
        // named after shared/testing-metrics.ts, a 28-line file that has
        // nothing to do with charting. Named explicitly so it reads as what
        // it is and stays a stable, cacheable chunk across deploys.
        manualChunks(id) {
          if (id.includes("node_modules/recharts")) return "vendor-charts";
          if (id.includes("node_modules/date-fns")) return "vendor-date";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
