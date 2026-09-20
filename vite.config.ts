import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    // `VITE_BUNDLE_STATS=/some/dir npm run build` writes a treemap of what is inside each chunk
    // (dist sizes are visible in the build log; what is IN the 600kB entry is not). Off by default:
    // the report is for a person looking at the bundle, not a build artifact.
    ...(process.env.VITE_BUNDLE_STATS
      ? [
          visualizer({
            filename: path.join(process.env.VITE_BUNDLE_STATS, "bundle-stats.html"),
            template: "treemap",
            gzipSize: true,
          }),
          visualizer({
            filename: path.join(process.env.VITE_BUNDLE_STATS, "bundle-stats.json"),
            template: "raw-data",
            gzipSize: true,
          }),
        ]
      : []),
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
    // What the bundle is compiled FOR. Vite's default ("modules") targets Safari 14 / Chrome 87
    // and adds transforms for anything newer. Nothing this app runs on is that old: the native
    // shell's deployment target is iOS 15 (ios/App/App.xcodeproj -> IPHONEOS_DEPLOYMENT_TARGET),
    // whose WKWebView is Safari 15, and the web build is used from current browsers. Saying so
    // lets esbuild leave native syntax alone instead of rewriting it into something longer.
    target: ["es2020", "safari15", "chrome100", "firefox100", "edge100"],
    // vendor-charts (recharts) is inherently large but lazy -- only fetched
    // by the handful of pages that render a chart, never on initial load --
    // so the default 500kB warning for it is no longer a signal of anything.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // NOT experimentalMinChunkSize. It was tried (10 kB) to fold the ~120 sub-2 kB icon
        // chunks that lazy dialogs leave behind into their importers, and it did -- and it also
        // folded a chart-drawing module into a chunk the coach dashboard imports statically, so
        // the dashboard started downloading recharts (410 kB) on every visit. Rollup's merge
        // only promises not to add imports to a chunk's *direct* importers, and the dashboard
        // was two hops away. Sixty tiny requests are cheaper than that; leave it off.
        // Without this, Rollup names a shared vendor chunk after whichever
        // of its importers it picks arbitrarily -- recharts (only used by
        // a few history/analytics dialogs) was showing up as a 360kB chunk
        // named after shared/testing-metrics.ts, a 28-line file that has
        // nothing to do with charting. Named explicitly so it reads as what
        // it is and stays a stable, cacheable chunk across deploys.
        manualChunks(id) {
          // REACT FIRST, AND THAT ORDER IS THE WHOLE POINT.
          //
          // With only the recharts rule here, Rollup had nowhere else to put React -- it is
          // imported by recharts AND by the entry -- so it hoisted React INTO the recharts
          // chunk. The chunk named "vendor-charts" was really "React plus recharts", the entry
          // had to import it statically to get React at all, and Vite duly emitted a
          // modulepreload for it. So 560kB of charting library was fetched on every first
          // paint, including the landing page and the login form, which render no charts. The
          // comment below claiming recharts is "never on initial load" described the intent and
          // not the build.
          //
          // Naming React explicitly gives it somewhere of its own to go, and recharts goes back
          // to being what it was supposed to be: lazy, fetched by the handful of pages that
          // actually draw a chart.
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/scheduler")) return "vendor-react";
          // Two tiny shared utilities that recharts also uses, pinned here for the same reason
          // React was: left unassigned, Rollup put them in the recharts chunk (they are shared
          // between the entry and it), which meant the entry statically imported vendor-charts
          // for the sake of clsx and a useSyncExternalStore shim -- and dragged 400kB of
          // charting library along behind them. They are a few hundred bytes and the entry
          // needs them on every page, so they belong in the always-loaded chunk.
          if (id.includes("node_modules/use-sync-external-store")) return "vendor-react";
          if (id.includes("node_modules/clsx")) return "vendor-react";
          // vendor-charts (recharts) is inherently large but lazy -- only fetched by the pages
          // that render a chart. Named explicitly so it reads as what it is and stays a stable,
          // cacheable chunk across deploys, rather than being named after whichever importer
          // Rollup happened to pick (it was once named after a 28-line metrics helper).
          if (id.includes("node_modules/recharts")) return "vendor-charts";
          // THE SCHEMA IS NOT A CLIENT MODULE, AND THIS IS WHAT KEEPS IT OFF THE FIRST PAINT.
          //
          // shared/schema.ts is 7,000 lines of Drizzle tables and zod insert schemas, and it
          // drags zod, drizzle-orm and drizzle-zod in with it: ~510 kB of JavaScript. One
          // literal imported from it by the signup form put all of that in the entry chunk --
          // three-fifths of what the login page downloaded. The client modules that still need
          // it (the nutrition panels' meal enums, the program builder's phases) now read
          // shared/schema-constants.ts instead, and whatever still imports the schema itself
          // gets it from this one lazy chunk. It is named so the first-paint test
          // (client/src/lib/bundle-budget.test.ts) can assert it is never preloaded -- a new
          // eager import of the schema fails the build rather than quietly costing 136 kB.
          if (
            id.endsWith("/shared/schema.ts") ||
            id.includes("node_modules/drizzle-orm/") ||
            id.includes("node_modules/drizzle-zod/")
          ) {
            return "vendor-schema";
          }
          // zod on its own, NOT inside vendor-schema: two small shared modules (roster-groups,
          // the institutional agreement) validate with zod and are imported by pages that never
          // touch the schema. Folding zod into the schema chunk would make the roster page
          // download 7,000 lines of table definitions to parse a group name.
          if (id.includes("node_modules/zod/")) return "vendor-zod";
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
