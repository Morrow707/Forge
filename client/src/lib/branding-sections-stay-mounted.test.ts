import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A COMPONENT IS NEVER DECLARED INSIDE ANOTHER COMPONENT (2026-11-20). The branding page declared
// Section, Gate, Swatches and SuggestedPair inside CoachBranding, so each render made four new
// component types and React rebuilt all five sections on every pick: Scott, on section 2, "i click
// on a color it brings me to the top", and a text box there lost its cursor after each letter.
// FORBIDDEN: a capitalized function or arrow component, indented, inside a top-level component.
// Allowed: one passed straight into a call (forwardRef(function X ...)), and one built by a
// lowercase factory that runs once (lazyDialog).

const CLIENT = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

// An indented component declaration: "  function Section(" or "  const Gate = ({ a }) =>".
const INNER_COMPONENT = /^\s{2,}(?:function ([A-Z]\w*)\s*\(|const ([A-Z]\w*) = (?:\([^)]*\)|[a-z]\w*) =>)/;
// The top-level declaration a line sits under: "export default function CoachBranding(".
const TOP_LEVEL = /^(?:export (?:default )?)?(?:function|const) (\w+)/;

/** Components declared inside another component in this source, as "Outer > Inner". */
export function componentsInsideComponents(src: string): string[] {
  const lines = src.split("\n");
  return lines.flatMap((line, i) => {
    const m = INNER_COMPONENT.exec(line);
    if (!m) return [];
    const previous = lines.slice(0, i).reverse().find((l) => l.trim() !== "") ?? "";
    if (previous.trimEnd().endsWith("(")) return []; // an argument: forwardRef(function X ...)
    const outer = lines.slice(0, i).reverse().map((l) => TOP_LEVEL.exec(l)?.[1]).find(Boolean);
    if (!outer || !/^[A-Z]/.test(outer)) return []; // inside a lowercase factory, made once
    return [`${outer} > ${m[1] ?? m[2]}`];
  });
}

describe("components stay mounted", () => {
  it("no client component declares another component inside itself", () => {
    const found = tsxFiles(CLIENT).flatMap((f) => componentsInsideComponents(readFileSync(f, "utf8")).map((c) => `${f.slice(CLIENT.length)}: ${c}`));
    expect(found).toEqual([]);
  });

  it("catches the branding page's old shape, and leaves forwardRef and a factory alone", () => {
    expect(componentsInsideComponents("export default function CoachBranding() {\n  const x = 1;\n  function Section({ step }: P) {\n    return null;\n  }\n}")).toEqual([
      "CoachBranding > Section",
    ]);
    expect(componentsInsideComponents("export default function Page() {\n  const Gate = ({ open }: P) => null;\n}")).toEqual(["Page > Gate"]);
    expect(componentsInsideComponents("export const Timer = forwardRef<H, P>(\n  function Timer(p, ref) {\n    return null;\n  });")).toEqual([]);
    expect(componentsInsideComponents("export function lazyDialog() {\n  function LazyDialog(props: P) {\n    return null;\n  }\n}")).toEqual([]);
  });
});
