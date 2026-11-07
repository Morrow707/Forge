import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * A REPS FIELD SUMMONS THE NUMBER PAD, ON EVERY FORM THAT HAS ONE.
 *
 * Scott, 2026-11-06, on the program builder on his phone: "when I enter sets the number pad
 * shows up, but when I go to enter reps the whole keyboard pops up, can't have this it has to
 * be a numerical pad too, reps will never be letters always a number."
 *
 * Reps are stored as TEXT on purpose (three seeded programs carry "8-10"), so the field cannot
 * become type="number" without blanking every range already on file. What decides the phone's
 * keyboard on a text field is `inputMode`: "numeric" summons the digit pad on iOS, nothing
 * summons the full keyboard. Sets and rest are type="number" and were already fine.
 *
 * The rule, stated as what is FORBIDDEN rather than as a list of files: no element that labels
 * itself "Reps" may be drawn without a numeric input mode, and no field helper may swallow the
 * prop on the way to the <Input>. The forms are DISCOVERED from the client directory, so a fifth
 * form with a reps field is covered the day it is written.
 */

const CLIENT = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Line-aware comment strip: a block comment counts only when `/*` opens its line, and `//`
 *  is cut only where the quotes before it balance, so a URL inside a string survives. */
function strip(src: string): string {
  return src
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      const before = line.slice(0, at);
      const quotes = (before.match(/["'`]/g) ?? []).length;
      return quotes % 2 === 0 ? before : line;
    })
    .join("\n");
}

/** Every JSX element whose props carry label="Reps", bounded by its own closing `/>` or `>`. */
function repsElements(src: string): Array<{ file?: string; text: string }> {
  const out: Array<{ text: string }> = [];
  const re = /label="Reps"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = src.lastIndexOf("<", m.index);
    let depth = 0;
    let end = -1;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (start < 0 || end < 0) throw new Error(`unbounded element around ${m.index}`);
    out.push({ text: src.slice(start, end) });
  }
  return out;
}

const files = walk(path.join(CLIENT, "pages")).concat(walk(path.join(CLIENT, "components")));
const subjects = files
  .map((file) => ({ file: path.relative(CLIENT, file), src: strip(readFileSync(file, "utf8")) }))
  .filter(({ src }) => src.includes('label="Reps"'));

describe("a reps field summons the number pad", () => {
  it("finds the forms that draw a reps field (the premise of the rule)", () => {
    const names = subjects.map((s) => s.file).sort();
    expect(names).toEqual([
      "components/assign-program-dialog.tsx",
      "components/coach-day-edit-dialog.tsx",
      "pages/class-builder.tsx",
      "pages/program-builder.tsx",
      "pages/skill-program-builder.tsx",
    ]);
  });

  it("every element labelled Reps declares inputMode numeric", () => {
    const offenders: string[] = [];
    for (const { file, src } of subjects) {
      for (const el of repsElements(src)) {
        if (!/inputMode="numeric"/.test(el.text)) offenders.push(`${file}: ${el.text.replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every field helper those forms use forwards inputMode to the Input", () => {
    for (const { file, src } of subjects) {
      for (const el of repsElements(src)) {
        const tag = /^<(\w+)/.exec(el.text)![1];
        const decl = src.indexOf(`function ${tag}(`);
        expect(decl, `${file} declares ${tag}`).toBeGreaterThan(-1);
        const body = src.slice(decl, src.indexOf("\n}\n", decl));
        expect(body, `${file} ${tag} forwards inputMode`).toMatch(/inputMode=\{inputMode\}/);
      }
    }
  });

  it("reps stays a text field, because a stored value can read 8-10", () => {
    for (const { file, src } of subjects) {
      for (const el of repsElements(src)) {
        expect(el.text, `${file}: ${el.text}`).not.toMatch(/type="number"/);
      }
    }
  });

  it("the comment strip is load-bearing: prose quoting the attribute does not satisfy the rule", () => {
    const fake = `{/* <FieldInput label="Reps" inputMode="numeric" /> */}\n<FieldInput label="Reps" value={x} />`;
    expect(repsElements(fake).length).toBe(2);
    expect(repsElements(strip(fake)).length).toBe(1);
    expect(repsElements(strip(fake))[0].text).not.toMatch(/numeric/);
  });
});
