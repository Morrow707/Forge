import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANVIL_NEVER_MODELS,
  ESCALATION_RECIPIENT,
  EXCLUSION_FINDING_AUDIENCE,
} from "./anvil-never-models";

const SHARED = import.meta.dirname ?? __dirname;

/**
 * Line-aware comment strip, the same one the sibling Anvil tests carry. The two-regex version
 * pairs a `/*` inside a string with the next real closer thousands of lines away; measured at
 * 413,000 of 734,000 characters of routes.ts deleted silently.
 */
function stripComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    const t = line.trimStart();
    if (inBlock) {
      out.push("");
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      out.push("");
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//")) {
      out.push("");
      continue;
    }
    let cut = -1;
    let dq = 0;
    let sq = 0;
    let bt = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === '"') dq ^= 1;
      else if (c === "'") sq ^= 1;
      else if (c === "`") bt ^= 1;
      else if (c === "/" && line[i + 1] === "/" && !dq && !sq && !bt) {
        cut = i;
        break;
      }
    }
    out.push(cut === -1 ? line : line.slice(0, cut));
  }
  return out.join("\n");
}

/**
 * A module is exempt from the scan if it DECLARES A PROHIBITION -- an export whose name says
 * FORBIDDEN or NEVER. Naming a topic in order to refuse it is the opposite of modelling it, and
 * `anvil-vocabulary.ts` has to carry the word "concussion" precisely so no screen can.
 *
 * DERIVED FROM A CONSTRUCT IN THE FILE, NEVER FROM A FILENAME, which is what keeps it from
 * rotting: a future module that wants this exemption has to declare a prohibition to earn it, and
 * renaming the export away loses it. The first draft of this scan had no exemption at all and
 * correctly went red on `anvil-vocabulary.ts`; a list of exempt filenames would have been the
 * wrong cure and is what this repo keeps unshipping.
 */
function declaresAProhibition(code: string): boolean {
  return /export\s+(?:const|type|function)\s+\w*(?:FORBIDDEN|NEVER)\w*/.test(code);
}

/** Every Anvil module, discovered rather than listed, excluding this declaration and the tests. */
function anvilModules(): Array<{ name: string; code: string }> {
  return readdirSync(SHARED)
    .filter((f) => /^anvil-.*\.ts$/.test(f) && !f.endsWith(".test.ts"))
    .filter((f) => f !== "anvil-never-models.ts")
    .map((name) => ({ name, code: stripComments(readFileSync(join(SHARED, name), "utf8")) }));
}

describe("what the Anvil never models is a declaration with reasons, not an absence", () => {
  it("names each topic with the reason it is refused", () => {
    expect(ANVIL_NEVER_MODELS.length).toBeGreaterThanOrEqual(3);
    for (const { topic, why } of ANVIL_NEVER_MODELS) {
      expect(topic.trim()).not.toBe("");
      expect(
        why.length,
        `"${topic}" is refused with no reason. The next person will read a bare list as caution ` +
          "and argue it away.",
      ).toBeGreaterThan(60);
    }
  });

  it("covers the three the 2026-11-06 pass settled", () => {
    const topics = ANVIL_NEVER_MODELS.map((t) => t.topic.toLowerCase());
    expect(topics).toContain("concussion");
    expect(topics.some((t) => t.includes("red-s"))).toBe(true);
    expect(topics.some((t) => t.includes("eating"))).toBe(true);
  });

  it("gives a DIFFERENT reason for concussion and for RED-S", () => {
    // They are refused for genuinely different reasons and collapsing them loses the sharper one:
    // RED-S can present with readings that look BETTER, so a model does not merely miss it.
    const by = (k: string) =>
      ANVIL_NEVER_MODELS.find((t) => t.topic.toLowerCase().includes(k))?.why ?? "";
    expect(by("concussion")).not.toBe(by("red-s"));
    expect(by("red-s").toLowerCase()).toMatch(/better|opposite/);
  });
});

describe("no Anvil module models any of them", () => {
  it("finds the modules by what they are, not from a list", () => {
    const names = anvilModules().map((m) => m.name);
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(names).toContain("anvil-inputs.ts");
    expect(names).toContain("anvil-sway.ts");
  });

  it("refuses the forbidden topics in Anvil module CODE, comments stripped", () => {
    const offences: string[] = [];
    for (const { name, code } of anvilModules()) {
      if (declaresAProhibition(code)) continue;
      const body = code.toLowerCase();
      for (const { topic } of ANVIL_NEVER_MODELS) {
        if (body.includes(topic.toLowerCase())) offences.push(`${name}: "${topic}"`);
      }
    }
    expect(
      offences,
      "An Anvil module names a topic the Anvil does not model. The reasons are in " +
        "shared/anvil-never-models.ts; explaining the refusal belongs in a comment, modelling it " +
        "does not belong anywhere.",
    ).toEqual([]);
  });

  it("the exemption is earned by a construct, so renaming the export loses it", () => {
    const vocab = stripComments(readFileSync(join(SHARED, "anvil-vocabulary.ts"), "utf8"));
    expect(declaresAProhibition(vocab), "anvil-vocabulary.ts declares a prohibition").toBe(true);
    expect(
      declaresAProhibition(vocab.replace(/FORBIDDEN/g, "LISTED")),
      "rename the prohibition away and the exemption goes with it",
    ).toBe(false);
    // And a module that merely MENTIONS the word in code earns nothing.
    expect(declaresAProhibition('const x = "concussion";')).toBe(false);
  });

  it("the comment strip is load-bearing here, proven rather than assumed", () => {
    // The modules DO discuss these topics in prose -- anvil-inputs.ts explains the exclusion
    // channel and anvil-growth.ts explains what it will not approximate -- so without the strip
    // this scan reds on correct source. Proven directly, since no mutation of the code exercises it.
    const raw = readdirSync(SHARED)
      .filter((f) => /^anvil-.*\.ts$/.test(f) && !f.endsWith(".test.ts"))
      .filter((f) => f !== "anvil-never-models.ts")
      .map((f) => readFileSync(join(SHARED, f), "utf8").toLowerCase())
      .join("\n");
    const topics = ANVIL_NEVER_MODELS.map((t) => t.topic.toLowerCase());
    expect(
      topics.some((t) => raw.includes(t)),
      "if no module mentions these in prose the strip proves nothing and this case is theatre",
    ).toBe(true);
  });
});

describe("who a finding goes to is unresolved, and unresolved is not a default", () => {
  it("is blocked on the counsel question, named", () => {
    expect(ESCALATION_RECIPIENT.resolved).toBe(false);
    if (!ESCALATION_RECIPIENT.resolved) {
      expect(ESCALATION_RECIPIENT.blockedOn).toMatch(/mandatory reporting|follow-up 3/i);
      expect(ESCALATION_RECIPIENT.blockedOn.length).toBeGreaterThan(80);
    }
    // A default here would be invisible, wrong half the time, and the half it is wrong about is
    // a child. The answer decides which PATH exists, not which option is configured.
  });

  it("shows an exclusion finding to the athlete and nobody else meanwhile", () => {
    expect(EXCLUSION_FINDING_AUDIENCE).toBe("athlete_only_pending_counsel");
    // The only option that cannot be wrong: it tells the person the data is about what their own
    // data says, and asserts nothing to anybody who might owe a duty nobody has established.
  });
});
