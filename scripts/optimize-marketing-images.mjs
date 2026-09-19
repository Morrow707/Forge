/** Emits a WebP beside every marketing PNG.
 *
 * The screenshots on the landing and audience pages are ~960kB of PNG, one of them 396kB, and
 * they are the largest thing on the page a first-time visitor loads. PNG is the wrong format for
 * a photograph-like screenshot: it is lossless, which nobody needs for a picture of a dashboard.
 *
 * Emits ALONGSIDE rather than replacing, and the markup uses <picture> with the PNG as the
 * fallback source -- so a browser that cannot read WebP still gets an image, and the original
 * stays in git as the thing a designer edits.
 *
 * Idempotent: skips a WebP that is already newer than its PNG, so a rebuild costs nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, "..", "client", "public", "marketing");

const pngs = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
let converted = 0;
let savedBytes = 0;

for (const file of pngs) {
  const src = path.join(dir, file);
  const out = src.replace(/\.png$/, ".webp");
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) continue;
  // quality 82 is the usual sweet spot for UI screenshots: text stays crisp, gradients stay
  // clean, and the file lands well under half the PNG.
  await sharp(src).webp({ quality: 82 }).toFile(out);
  const before = fs.statSync(src).size;
  const after = fs.statSync(out).size;
  savedBytes += before - after;
  converted++;
  console.log(`  ${file}: ${(before / 1024).toFixed(0)}kB -> ${(after / 1024).toFixed(0)}kB webp`);
}

console.log(
  converted === 0
    ? "Marketing images already optimized."
    : `Optimized ${converted} marketing image(s), ${(savedBytes / 1024).toFixed(0)}kB saved.`,
);
