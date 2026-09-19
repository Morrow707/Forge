import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_ROUTES } from "@shared/public-routes";

// A SHARE CARD IS THE ONLY THING MOST PEOPLE SEE BEFORE DECIDING WHETHER TO TAP.
//
// Forge in beta spreads by one coach sending another a link, not by search. Until these tags
// existed, that link rendered in Messages, Slack and everywhere else as a bare URL. The tags are
// easy to add and just as easy to break silently -- a renamed meta tag, a typo in a property
// name, a route added without metadata -- and nothing about a broken card is visible from inside
// the app. Nobody is going to notice by using Forge.
//
// Three failure modes worth catching, all of which produce a WORSE card than having no tags:
//   - a tag whose content is the string "undefined", from an unparsed route field
//   - a relative image URL, which a scraper resolves against its own host and drops
//   - two routes sharing a title, which is what the whole per-route exercise was to fix
const ROOT = join(__dirname, "..", "..", "..");
const indexHtml = readFileSync(join(ROOT, "client", "index.html"), "utf8");

describe("the fallback head in index.html", () => {
  it("carries a full share card", () => {
    for (const tag of [
      'property="og:title"',
      'property="og:description"',
      'property="og:image"',
      'property="og:url"',
      'property="og:site_name"',
      'name="twitter:card"',
      'name="twitter:image"',
      'rel="canonical"',
    ]) {
      expect(indexHtml, `missing ${tag}`).toContain(tag);
    }
  });

  it("uses the large card, not the square crop", () => {
    // summary crops to a square, which turns a dashboard screenshot into a smudge.
    expect(indexHtml).toContain('content="summary_large_image"');
  });

  it("gives absolute image URLs", () => {
    // A relative og:image resolves against the SCRAPER's host, not Forge's, and the card comes
    // back with no picture at all.
    for (const m of indexHtml.matchAll(/(?:og:image|twitter:image)" content="([^"]*)"/g)) {
      expect(m[1], `${m[1]} must be absolute`).toMatch(/^https?:\/\//);
    }
  });

  it("carries the full brand term, not the bare word", () => {
    // "Forge" alone is a common noun and a dozen other products; the brand term has to be the
    // full one everywhere or the search footprint is split across two names.
    expect(indexHtml).toContain("Forge Performance Systems");
  });
});

describe("the per-route metadata", () => {
  it("never leaves a title or description empty", () => {
    for (const r of PUBLIC_ROUTES) {
      expect(r.title?.trim(), `${r.path} title`).toBeTruthy();
      expect(r.description?.trim(), `${r.path} description`).toBeTruthy();
      expect(r.title, `${r.path} title looks unparsed`).not.toContain("undefined");
      expect(r.description, `${r.path} description looks unparsed`).not.toContain("undefined");
    }
  });

  it("gives every indexed route its own title", () => {
    // The bug this whole exercise started from: one title for the entire site, so a bookmark, a
    // tab, a shared link and a search result all said the same thing on every page.
    const titles = PUBLIC_ROUTES.filter((r) => r.index).map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("gives every indexed route its own description", () => {
    const descriptions = PUBLIC_ROUTES.filter((r) => r.index).map((r) => r.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("points every custom share image at a file that exists", () => {
    // A 404 image is the same as no image to a scraper, and the failure is invisible in the app.
    for (const r of PUBLIC_ROUTES) {
      if (!r.image) continue;
      const file = join(ROOT, "client", "public", r.image.replace(/^\//, ""));
      expect(() => readFileSync(file), `${r.path} share image ${r.image} is missing`).not.toThrow();
    }
  });
});

describe("the marketing screenshots", () => {
  // These are the heaviest thing a first-time visitor downloads, and the WebP siblings are
  // COMMITTED rather than generated during the build -- sharp is not a declared dependency and
  // making every Render deploy install a native image library to re-encode five files that
  // change twice a year is the wrong trade.
  //
  // Committed artifacts go stale silently, though: somebody adds a screenshot, references the
  // PNG, and never runs scripts/optimize-marketing-images.mjs. The page still works, it is just
  // quietly heavy again. So the pairing is asserted rather than trusted.
  const dir = join(ROOT, "client", "public", "marketing");
  const files = require("node:fs").readdirSync(dir) as string[];
  const pngs = files.filter((f) => f.endsWith(".png"));

  it("finds the screenshots it is meant to be checking", () => {
    expect(pngs.length).toBeGreaterThan(3);
  });

  it("has a webp beside every png", () => {
    const missing = pngs.filter((f) => !files.includes(f.replace(/\.png$/, ".webp"))).sort();
    expect(
      missing,
      "run: node scripts/optimize-marketing-images.mjs",
    ).toEqual([]);
  });

  it("keeps every webp actually smaller than its png", () => {
    // A re-encode that came out bigger means the quality setting was raised past the point of
    // the exercise, and serving it would be strictly worse than the PNG.
    const { statSync } = require("node:fs");
    for (const png of pngs) {
      const webp = png.replace(/\.png$/, ".webp");
      if (!files.includes(webp)) continue;
      expect(statSync(join(dir, webp)).size, `${webp} is not smaller than ${png}`).toBeLessThan(
        statSync(join(dir, png)).size,
      );
    }
  });
});
