// The personalization artifact's build of the real client: same source and aliases as the app,
// relative asset paths, no service worker, and the replay layer loaded before the app.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const OUT = process.env.ARTIFACT_OUT ?? "/tmp/forge-artifact";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "forge-artifact-replay",
      transformIndexHtml(html: string) {
        return html.replace("<head>", '<head>\n    <script src="./fixtures.js"></script>\n    <script src="./replay.js"></script>');
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
    conditions: ["onnxruntime-web-use-extern-wasm"],
  },
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: false,
  build: {
    outDir: OUT,
    emptyOutDir: true,
    sourcemap: false,
    target: ["es2020", "safari15", "chrome100", "firefox100", "edge100"],
    chunkSizeWarningLimit: 8000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
