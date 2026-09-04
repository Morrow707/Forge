// Copies onnxruntime-web's WASM runtime out of node_modules into client/public --
// same reasoning as copy-mediapipe-wasm.mjs (same-origin, no CDN dependency,
// cacheable by the PWA service worker), for implement-detection.ts's own ONNX
// inference session. Runs as a pre-step before dev/build; output is gitignored,
// same as mediapipe-wasm.
//
// Copies only the specific files the "wasm" execution provider actually needs
// (implement-detection.ts never requests "webgl"/"webgpu"/"node") -- unlike
// copy-mediapipe-wasm.mjs's own "copy the whole thing" choice, onnxruntime-web's
// dist/ ships ~135MB across every backend (webgl, webgpu, node, several Safari-
// compat variants), most of it genuinely irrelevant here and large enough on
// its own to blow the PWA precache size limit. ort-wasm-simd-threaded is the
// primary modern build; the .asyncify variant is the documented older-Safari
// fallback onnxruntime-web's own runtime selects when the primary build's
// required WASM features aren't available -- both copied so that fallback
// actually has something to load, not just the happy path.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "node_modules", "onnxruntime-web", "dist");
const dest = join(__dirname, "..", "client", "public", "onnxruntime-wasm");

const FILES = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
];

if (!existsSync(src)) {
  console.error("onnxruntime-web dist assets not found in node_modules -- run npm install first.");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(src, file), join(dest, file));
}
console.log("Copied onnxruntime-web WASM assets to client/public/onnxruntime-wasm");
