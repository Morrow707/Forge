// Copies the MediaPipe Tasks Vision WASM runtime out of node_modules into
// client/public so it's served same-origin (fast, no CDN dependency, and
// cacheable by the PWA service worker) instead of pointing FilesetResolver
// at a public CDN. Runs as a pre-step before dev/build; output is
// gitignored since it's just a build artifact copied from an installed
// dependency, not source.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(__dirname, "..", "client", "public", "mediapipe-wasm");

if (!existsSync(src)) {
  console.error("MediaPipe wasm assets not found in node_modules -- run npm install first.");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Copied MediaPipe WASM assets to client/public/mediapipe-wasm");
