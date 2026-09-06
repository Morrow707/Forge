import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// An icon-only button renders no text, so unless it carries an accessible
// name a screen reader announces it as "button" and nothing else. There is
// no way to tell "delete this lesson" from "move it up" by listening.
//
// A source-level guard rather than a rendering test: the rule has to hold
// for every such button in the app, and the next one added is exactly the
// one nobody remembers to check.

const CLIENT_SRC = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** The opening tag of every <Button ...> in the source, brace-aware so a
 * `>` inside a JSX expression does not end the tag early. */
function buttonOpeningTags(source: string): { tag: string; bodyStart: number }[] {
  const tags: { tag: string; bodyStart: number }[] = [];
  const re = /<Button\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let i = m.index + m[0].length;
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      i++;
    }
    tags.push({ tag: source.slice(m.index, i + 1), bodyStart: i + 1 });
  }
  return tags;
}

describe("icon-only buttons have an accessible name", () => {
  it("finds no unnamed one anywhere in the client", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(CLIENT_SRC)) {
      const source = readFileSync(file, "utf8");
      for (const { tag, bodyStart } of buttonOpeningTags(source)) {
        if (!tag.includes('size="icon"')) continue;
        if (tag.includes("aria-label")) continue;
        // Visually hidden text counts as a name too.
        const close = source.indexOf("</Button>", bodyStart);
        const body = close > 0 ? source.slice(bodyStart, close) : "";
        if (body.includes("sr-only")) continue;
        offenders.push(`${file.slice(CLIENT_SRC.length + 1)}:${source.slice(0, bodyStart).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("actually inspects buttons, rather than passing on an empty sweep", () => {
    // A guard whose scan silently matched nothing would also report no
    // offenders, which is the failure mode worth ruling out.
    const total = tsxFiles(CLIENT_SRC)
      .map((f) => buttonOpeningTags(readFileSync(f, "utf8")).filter((t) => t.tag.includes('size="icon"')).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(20);
  });
});
