import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/** The build-time render of the public pages: client/src/entry-prerender.tsx compiled for Node,
 * so scripts/prerender.ts can call renderToString on the real page components and bake their
 * markup into the static HTML the server hands a crawler.
 *
 * Its own config rather than a second target in vite.config.ts because that one is the BROWSER
 * build -- the PWA plugin that writes the service worker, the Smart App Banner, the chunk rules
 * and `emptyOutDir` all belong to it and none belongs here. Only the aliases are shared, and
 * they are repeated rather than imported so this file cannot drag the browser plugins in. The
 * output is dist/prerender, beside dist/public, and is never served: nothing in server/ reads
 * it, and the Capacitor webDir is dist/public alone. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    // The browser build already copies client/public (fonts, the 36 MB of pose runtimes) into
    // dist/public; this bundle is one JavaScript file and needs none of it.
    copyPublicDir: false,
    ssr: path.resolve(import.meta.dirname, "client", "src", "entry-prerender.tsx"),
    outDir: path.resolve(import.meta.dirname, "dist", "prerender"),
    emptyOutDir: true,
    target: "node20",
    rollupOptions: { output: { format: "es" } },
  },
  ssr: {
    // Everything under node_modules is left to Node to resolve at run time, except packages
    // that ship only an ESM browser build or reach for `window` at import; none of the public
    // pages' dependencies does today, so nothing is listed.
    noExternal: [],
  },
});
