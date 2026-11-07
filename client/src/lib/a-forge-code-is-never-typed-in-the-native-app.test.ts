import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/* A FORGE CODE IS NEVER TYPED IN THE NATIVE APP (App Review, 2026-11-06).
 *
 * Apple rejected 1.0 (build 695) under Guideline 3.1.1: "The app unlocks or enables additional
 * functionality with mechanisms other than In-App Purchase ... Specifically, the app uses promo
 * code to unlock or enable subscription." The Upgrade screen's Forge CODE box is what the
 * reviewer's screenshot showed, and the comment above it argued the opposite -- that a code
 * writing Forge's own trial row was not a store matter. The row grants the paid Free Agent
 * features, so it is.
 *
 * The rule: every surface that posts a Forge code (`/api/athlete/redeem-code`,
 * `/api/coach/redeem-code`, the `promoCode` field of a signup) draws its entry box only behind
 * `forgeCodeEntryIsAllowed()`, which is false on any native platform. Apple's own offer-code
 * sheet (the "App Store code" button) is the one way a code is redeemed in the app and is NOT a
 * Forge code: `a-launch-code-can-be-redeemed-on-both-rails.test.ts` keeps that button.
 *
 * STATED AS WHAT IS FORBIDDEN, discovered from the directory: a fourth surface that posts a code
 * is found the day it is written, and a surface whose box escapes the condition reds. Comments
 * are stripped first -- the fix's own comments quote the forbidden words -- and every span is
 * bounded by matching its own brackets, never a character count.
 *
 * Mutations, each caught by the right case: the helper returning `true` unconditionally (the
 * behaviour case); the condition removed from the Upgrade card, the signup field or the coach box
 * (the per-surface case names the file); the signup definition reading the helper replaced by the
 * bare role test (the signup case follows `promoCodeApplies` to its declaration); a comment quoting
 * `forgeCodeEntryIsAllowed() &&` above an unconditional box (the strip is what reds it); a surface
 * that imports the helper and never calls it (the condition text is what is read). */

const ROOT = join(import.meta.dirname, "..");
const CLIENT = join(ROOT);
const HELPER = "forgeCodeEntryIsAllowed";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Line-aware comment strip (the two-regex form empties a large file; CLAUDE.md, the hold entry). */
function strip(s: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      out.push("");
      continue;
    }
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      if (!t.includes("*/")) inBlock = true;
      out.push("");
      continue;
    }
    if (t.startsWith("//")) {
      out.push("");
      continue;
    }
    let cut = -1;
    let quote: string | null = null;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "/" && line[i + 1] === "/") {
        cut = i;
        break;
      }
    }
    out.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return out.join("\n");
}

/**
 * The JSX conditional that encloses position `at`: walking backwards with a bracket counter, the
 * first unmatched `(` is the paren of `{cond && (`, and the text between the `{` before it and
 * that paren is the condition. Returns null when the element is not inside such a conditional,
 * which is the failure this test exists for.
 */
function enclosingCondition(src: string, at: number): string | null {
  let paren = 0;
  let brace = 0;
  for (let i = at; i >= 0; i--) {
    const c = src[i];
    if (c === ")") paren++;
    else if (c === "}") brace++;
    else if (c === "{") {
      if (brace > 0) brace--;
      else return null;
    } else if (c === "(") {
      if (paren > 0) {
        paren--;
        continue;
      }
      // The unmatched `(`: the condition runs from the nearest `{` at depth zero to here.
      const open = src.lastIndexOf("{", i);
      if (open < 0) return null;
      const cond = src.slice(open + 1, i).trim();
      return cond.endsWith("&&") ? cond.slice(0, -2).trim() : null;
    }
  }
  return null;
}

/** A `const NAME =` initializer, bounded by its own semicolon at depth zero. */
function constInitializer(src: string, name: string): string | null {
  const m = new RegExp(`const\\s+${name}\\s*=`).exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 0;
  const start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ";" && depth === 0) break;
  }
  return src.slice(start, i);
}

const POSTS_A_FORGE_CODE = /\/api\/(athlete|coach)\/redeem-code|\bpromoCode\s*:/;
const sources = walk(CLIENT).filter((p) => !p.endsWith("forge-code-entry.ts"));
const surfaces = sources.filter((p) => POSTS_A_FORGE_CODE.test(strip(readFileSync(p, "utf8"))));

describe("the helper answers from the platform", () => {
  beforeEach(() => vi.resetModules());

  it("is false on a native platform and true on the web", async () => {
    vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } }));
    const native = await import("./forge-code-entry");
    expect(native.forgeCodeEntryIsAllowed()).toBe(false);
    vi.resetModules();
    vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
    const web = await import("./forge-code-entry");
    expect(web.forgeCodeEntryIsAllowed()).toBe(true);
  });

  it("asks isNativePlatform, not the iOS check: Google Play's rule is the same", () => {
    const src = strip(readFileSync(join(CLIENT, "lib/forge-code-entry.ts"), "utf8"));
    expect(src).toMatch(/return !Capacitor\.isNativePlatform\(\);/);
    expect(src).not.toMatch(/getPlatform/);
  });
});

describe("every surface that posts a Forge code draws its box behind the helper", () => {
  it("the surfaces are discovered, and there are the three the rejection named", () => {
    const rel = surfaces.map((p) => p.slice(ROOT.length + 1)).sort();
    expect(rel).toEqual([
      "components/account-settings-dialog.tsx",
      "pages/athlete/upgrade.tsx",
      "pages/signup.tsx",
    ]);
  });

  for (const file of surfaces) {
    const rel = file.slice(ROOT.length + 1);
    it(`${rel}: the code input sits inside a conditional that reads ${HELPER}`, () => {
      const src = strip(readFileSync(file, "utf8"));
      expect(src).toMatch(new RegExp(`import \\{ ${HELPER} \\} from "@/lib/forge-code-entry"`));
      // The input that takes the code: the one whose value is the code state or whose id is the
      // field name. Found by what it binds, not by a test id somebody could move.
      const inputs = [...src.matchAll(/<Input\b/g)].map((m) => m.index!);
      const codeInputs = inputs.filter((at) => {
        const close = src.indexOf("/>", at);
        const el = src.slice(at, close);
        return /value=\{(forgeCode|redeemCode|promoCode)\}/.test(el);
      });
      expect(codeInputs.length).toBeGreaterThan(0);
      for (const at of codeInputs) {
        const cond = enclosingCondition(src, at);
        expect(cond, `${rel}: the code input at ${at} is not inside a {cond && ( ... )} conditional`).not.toBeNull();
        // Directly, or through a local const whose initializer reads it (signup's
        // `promoCodeApplies` carries the role rule too).
        const reads = (text: string) => text.includes(`${HELPER}()`);
        const viaConst = cond!
          .split(/[^A-Za-z0-9_]+/)
          .filter(Boolean)
          .some((name) => {
            const init = constInitializer(src, name);
            return init != null && reads(init);
          });
        expect(reads(cond!) || viaConst, `${rel}: the condition "${cond}" never asks ${HELPER}()`).toBe(true);
      }
    });
  }

  it("the Upgrade screen keeps Apple's offer-code sheet and Restore Purchases for the native buyer", () => {
    const src = strip(readFileSync(join(CLIENT, "pages/athlete/upgrade.tsx"), "utf8"));
    expect(src).toMatch(/\{supported && \(\s*<Button[^>]*onClick=\{handleRedeemCode\}/);
    expect(src).toContain("redeemAppleOfferCode");
    expect(src).toContain("Restore Purchases");
  });

  it("the comment strip is load-bearing: a comment quoting the condition does not satisfy the scan", () => {
    const sample = [
      "{/* a comment that says forgeCodeEntryIsAllowed() && ( */}",
      '<Card><Input value={forgeCode} /></Card>',
    ].join("\n");
    const raw = enclosingCondition(sample, sample.indexOf("<Input"));
    const stripped = enclosingCondition(strip(sample), strip(sample).indexOf("<Input"));
    // Raw, the comment's `(` reads as the conditional's paren; stripped, there is none.
    expect(raw).not.toBeNull();
    expect(stripped).toBeNull();
  });
});
