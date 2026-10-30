import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_FREE_AGENT_TIER_IDS,
  FREE_AGENT_TIERS,
  entitlementsForFreeAgentTier,
} from "@shared/free-agent-tiers";

/**
 * THE SKILLS SIDE IS DRAWN ONLY FOR SOMEONE WHO MAY ACTUALLY USE IT.
 *
 * Skills moved onto the camera tier on 2026-09-19. Scott: "The 4.99 and 9.99 should not have
 * access to the skills and skills library, only exercise."
 *
 * It follows the camera rather than sitting beside it because a skill drill IS a camera
 * measurement: a sprint is timed by the camera and a mechanics drill is scored by it, so a skill
 * session on a tier with no camera runs a stopwatch nobody can read. Selling the skills side
 * without the camera would be selling the half that does not work on its own.
 *
 * THE SHAPE IS THE CAMERA GATE'S, deliberately -- one server function (skillsAccessFor), one
 * client hook that asks it (useSkillsAccess), and no second copy of the rule anywhere. The camera
 * version of this file records why: two copies of a three-branch rule disagree silently, and the
 * disagreement is only ever visible to the person it strands.
 */

const CLIENT_SRC = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(CLIENT_SRC, ...p), "utf8");

/**
 * Comments off before any negative or shape assertion. Every case below that looks for a token has
 * a COMMENT in the file it reads that quotes the very token -- a fix's own explanation names the
 * form it replaced -- and CLAUDE.md records prose-turning-a-scan-green as the worse half of that
 * failure, because nothing announces it.
 *
 * LINE-AWARE, NOT THE TWO-REGEX STRIP CLAUDE.md RECOMMENDS, AND THE REASON IS MEASURED. The cheap
 * version -- strip `/* *\/` blocks, then `//` to end of line -- deleted 413,000 of routes.ts's
 * 734,000 characters and took all five `requireSkillsAccess,` sites with it, because a non-greedy
 * block matcher pairs a `/*` that appears inside a STRING or a regex with the next real `*\/`
 * thousands of lines away, and the `//` pass then eats the tail of every line holding a URL. On a
 * small file you never see it; on this one it silently emptied the haystack and the count case
 * read 0 and said nothing about why.
 *
 * So: a block comment is only recognised when its opener is the first thing on its line, and an
 * end-of-line comment is only cut when the `//` has balanced quotes before it on that line. Both
 * conditions are true of every real comment in this repo and false of every string that merely
 * contains the characters.
 */
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
    if (t.startsWith("/*")) {
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
 * A FUNCTION's body, which is NOT "the next `{` after its name" -- that lands inside the parameter
 * type on `skillsAccessFor(user: { id: number; email: string; role: string })` and inside the
 * return type on anything declaring `Promise<{ ... }>`. Either one hands back a type annotation:
 * it holds the words a forbidden-token check looks for and none of the code, so the check reds on
 * correct source AND the positive assertion beside it reds too. CLAUDE.md has recorded this bug
 * twice, in `admin-identity.ts` and in `admin-billing-assignment.tsx`; it cost this case one run.
 *
 * So: paren-match the signature first, then take the first `{` at ANGLE-BRACKET depth zero, then
 * brace-match that.
 */
function functionBodyAt(s: string, from: number): string {
  const open = s.indexOf("(", from);
  if (open < 0) return "";
  let depth = 0;
  let afterParams = -1;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) {
        afterParams = i + 1;
        break;
      }
    }
  }
  if (afterParams < 0) return "";
  let angle = 0;
  for (let i = afterParams; i < s.length; i++) {
    const c = s[i];
    if (c === "<") angle++;
    else if (c === ">") angle--;
    else if (c === "{" && angle === 0) return blockAt(s, i);
  }
  return "";
}

/** The body of a brace-delimited block starting at `from`, by MATCHING ITS OWN BRACES -- never a
 *  character window, which CLAUDE.md forbids in so many words and which already cost this commit
 *  one false pass: a 'the hold card offers no checkout' case bounded by the next "See plans"
 *  reached past the hold branch into the tier branch beside it and found that branch's upgrade
 *  link. */
function blockAt(s: string, from: number): string {
  const open = s.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return s.slice(open, i + 1);
    }
  }
  return s.slice(open);
}

describe("only the camera tier grants the skills side", () => {
  it("excludes Basic and AI Coach", () => {
    expect(entitlementsForFreeAgentTier("basic").hasSkills).toBe(false);
    expect(entitlementsForFreeAgentTier("ai_coach").hasSkills).toBe(false);
  });

  it("grants it to exactly the tiers that include the camera", () => {
    // Not "to ai_coach_video" -- to whatever has the camera. Stated this way, a later tier that
    // adds video form-check gets skills with it automatically, and a tier that gets skills
    // WITHOUT the camera fails here, which is the combination the whole decision rejects.
    const withSkills = ALL_FREE_AGENT_TIER_IDS.filter((id) => FREE_AGENT_TIERS[id].hasSkills);
    const withCamera = ALL_FREE_AGENT_TIER_IDS.filter(
      (id) => FREE_AGENT_TIERS[id].hasVideoFormCheck,
    );
    expect(withSkills).toEqual(withCamera);
    expect(withSkills.length).toBeGreaterThan(0);
  });

  it("gives an unknown or absent tier nothing", () => {
    expect(entitlementsForFreeAgentTier(null).hasSkills).toBe(false);
    expect(entitlementsForFreeAgentTier("something_else").hasSkills).toBe(false);
  });
});

/** Every athlete-facing page whose content is the skills side. Found by scanning rather than
 * listed, for the reason CLAUDE.md gives for the tracker-dialog scan: the next skills page will
 * not be on anybody's list. skill-workout.tsx sits at the pages root rather than under athlete/
 * because coach self-training reaches it too, so the scan has to look wider than one directory. */
const skillPages = (function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name))
      : /^skill.*\.tsx$/.test(e.name) && join(dir, e.name).includes("/pages/athlete/")
        ? [join(dir, e.name)]
        : [],
  );
})(join(CLIENT_SRC, "pages"))
  .concat(join(CLIENT_SRC, "pages", "skill-workout.tsx"))
  .map((f) => [f.split("/pages/")[1], f] as const);

describe("every athlete skills page is behind the gate", () => {
  it("finds all five, so a moved file cannot empty the scan", () => {
    expect(skillPages.map(([label]) => label).sort()).toEqual([
      "athlete/skill-detail.tsx",
      "athlete/skill-program-builder.tsx",
      "athlete/skill-programs.tsx",
      "athlete/skills.tsx",
      "skill-workout.tsx",
    ]);
  });

  it.each(skillPages)("%s is wrapped in SkillsGate", (_label, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("SkillsGate");
    expect(src).toMatch(/<SkillsGate/);
  });
});

describe("the client asks the server and never works the rule out itself", () => {
  it("useSkillsAccess reads the endpoint and imports no tier table", () => {
    const src = read("hooks", "use-skills-access.ts");
    expect(src).toContain("/api/athlete/skills-access");
    // Importing the tier definitions here would be the second copy of the rule. The three
    // branches (coach or admin, coached athlete, Free Agent tier) live in skillsAccessFor alone.
    expect(src).not.toContain("free-agent-tiers");
  });

  it("unknown is neither yes nor no", () => {
    // Same convention as useCameraAccess: undefined until answered, and every call site requires
    // an explicit true. Defaulting to yes flashes a tab at somebody who cannot use it;
    // defaulting to no flashes its absence at a coached athlete who can.
    const src = read("hooks", "use-skills-access.ts");
    expect(src).toMatch(/allowed: boolean \| undefined/);
    expect(src).toContain("allowed: data?.allowed");
  });

  it("a failed read is reported, not spun through", () => {
    // Leaving `allowed` undefined on error made a failed request look like a slow one, and the
    // gate's spinner never resolved. The hook has to surface the error and a retry, and the gate
    // has to render ReadFailed on it BEFORE it decides to spin.
    const hook = read("hooks", "use-skills-access.ts");
    expect(hook).toContain("failed: isError");
    expect(hook).toContain("refetch");
    const gate = read("components", "skills-gate.tsx");
    expect(gate).toContain("ReadFailed");
    expect(gate.indexOf("access.failed")).toBeLessThan(gate.indexOf("access.allowed === undefined"));
  });

  it("the Library tab strip stops offering skills without access", () => {
    // The gate alone would leave a Skill Programs tab that always turns the athlete away, which
    // reads as a broken tab rather than a tier boundary.
    //
    // THE RULE, NOT A SPELLING -- AND THIS CASE PAID FOR THAT LESSON. It used to assert the
    // literal `useSkillsAccess()?.allowed === true`, and went red on 2026-10-30 when the strip
    // moved to `canRecord`: a change that serves this case's purpose strictly better, since both
    // tabs lead to BUILD surfaces and a parked athlete should get the same answer at the tab as
    // at the page. CLAUDE.md calls this the most-repeated shape here -- "a scan that enumerates
    // accepted forms fails on every correct change, then gets fixed by lengthening the list".
    // So whatever field it reads, the test is: it is compared for an EXPLICIT true (undefined is
    // not permissive), and both skills sections are hidden on anything else.
    const src = strip(read("pages", "athlete", "programs.tsx"));
    const assignment = src.match(/const (\w+) = useSkillsAccess\(\)\??\.\w+ === true;/);
    expect(assignment).not.toBeNull();
    const flag = assignment![1];
    const hidden = src.match(/hiddenSections=\{([^}]*)\}/s);
    expect(hidden).not.toBeNull();
    expect(hidden![1]).toContain(flag);
    expect(hidden![1]).toContain("skillPrograms");
    expect(hidden![1]).toContain("skillBank");
  });
});

describe("hiding a tab is not the permission check", () => {
  const routes = readFileSync(join(CLIENT_SRC, "..", "..", "server", "routes.ts"), "utf8");

  it("the skills side is gated server-side in both populations' shapes", () => {
    // requireSkillsAccess is the three-branch rule, for routes a coached athlete reaches too;
    // requirePaidAiAccess("skillsAi") is the Free-Agent-only one, where requireFreeAgent has
    // already established there is no coach. Both have to exist -- collapsing to one would
    // either lock out coached athletes or stop asking about the tier.
    expect(routes).toContain("async function skillsAccessFor(");
    expect([...routes.matchAll(/\brequireSkillsAccess,/g)].length).toBeGreaterThanOrEqual(4);
    expect([...routes.matchAll(/requirePaidAiAccess\("skillsAi"\)/g)].length).toBeGreaterThanOrEqual(7);
  });

  it("a skill program cannot be written by someone who cannot read one", () => {
    // The reads were gated and the three writes were not, which is the wrong way round: a Free
    // Agent on a tier without skills could not list their skill programs but could still create,
    // edit and delete them. Each write now names the gate on its own line.
    for (const verb of ["post", "put", "delete"]) {
      const re = new RegExp(
        `app\\.${verb}\\(\\s*"/api/athlete/skill-programs(/:id)?",[\\s\\S]{0,200}?requirePaidAiAccess\\("skillsAi"\\)`,
      );
      expect(routes).toMatch(re);
    }
  });

  it("the client hook is presentation, and says so", () => {
    expect(read("hooks", "use-skills-access.ts")).toMatch(/NOT A PERMISSION CHECK/);
  });
});


/**
 * THE OFF-SEASON HOLD SPLIT THE SKILLS QUESTION IN TWO (2026-10-30).
 *
 * Scott asked for it in two words -- "let's add that" -- against the one item left open when the
 * roster hold shipped: requireSkillsAccess gates the READS, so a parked athlete on no paid tier
 * lost the sprint times and mechanics scores their coach's program had already produced.
 *
 * The carve-out is the class gate's, one surface over: held = Free Agent for anything they would
 * BUY, coached for anything the program already bought and GAVE them. So `allowed` now answers
 * "may they open the skills side" and `canRecord` answers "may they start something new", and the
 * five GETs and four writes are gated by one each.
 *
 * WHAT IS ASSERTED HERE IS STRUCTURE, and the behaviour is in
 * server/an-off-season-hold.itest.ts -- a scan over a decision can only see the words the
 * decision is written with, never which way it goes (the form-check-destination.ts lesson). In
 * particular the ORDER of the paid check against the hold check decides whether a parked athlete
 * who BOUGHT the plan keeps recording, and no scan can see that; the itest drives it.
 */
describe("a parked seat reads its skill history and records nothing new", () => {
  const routes = readFileSync(join(CLIENT_SRC, "..", "..", "server", "routes.ts"), "utf8");
  const bare = strip(routes);

  it("the reads and the writes are gated by different middlewares, one each", () => {
    // Five GETs open and four writes refused. Stated as a count rather than a list of paths: a
    // tenth skills route added next year has to be classified as one or the other to pass.
    expect([...bare.matchAll(/\brequireSkillsAccess,/g)].length).toBe(5);
    expect([...bare.matchAll(/\brequireSkillsRecording,/g)].length).toBe(4);
    expect(bare).toContain("async function requireSkillsRecording(");
  });

  it("the recording gate decides on canRecord and never on allowed", () => {
    // The whole point. A recording gate that read `allowed` would be the old single boolean with
    // a new name, and a parked athlete would be recording again.
    const body = functionBodyAt(bare, bare.indexOf("async function requireSkillsRecording("));
    expect(body).toContain("access.canRecord");
    expect(body).not.toMatch(/if \(!access\.allowed\)/);
  });

  it("the resolver reads the SEATS, because athleteHasCoach cannot see a parked one", () => {
    // athleteHasCoach resolves through getCoachesForAthlete, where isNull(heldAt) has already
    // dropped the parked seats -- so it answers the same "no" for a parked athlete as for one who
    // never had a coach, which is exactly the distinction this feature turns on. FORBIDDEN FORM
    // rather than a required spelling: whatever the resolver is rewritten to look like, it may
    // not go back to asking the question that cannot tell those two apart.
    const body = functionBodyAt(bare, bare.indexOf("async function skillsAccessFor("));
    expect(body).toContain("getCoachSeatsForAthlete");
    expect(body).not.toContain("athleteHasCoach");
  });

  it("every branch of the resolver answers both questions", () => {
    // A branch that returned `allowed` without `canRecord` would read as undefined on the client,
    // and every client call site requires an explicit true -- so the control would vanish for
    // somebody who has it, silently. The compiler catches a missing key only because the type
    // requires it; this catches the type being loosened to optional.
    const client = strip(read("hooks", "use-skills-access.ts"));
    expect(client).toMatch(/canRecord: boolean;/);
    expect(client).not.toMatch(/canRecord\?:/);
    const server = bare.slice(bare.indexOf("export type SkillsAccess = {"));
    expect(server.slice(0, server.indexOf("};"))).toMatch(/canRecord: boolean;/);
  });

  it("the client's copy of the type carries every reason the server can send", () => {
    // The client DECLARES its own SkillsAccess rather than importing the server's, so a reason
    // added on one side typechecks cleanly on the other and the divergence is invisible -- the
    // shape CLAUDE.md has recorded costing a bug six times. Held equal here instead.
    const reasonsIn = (s: string, after: string) => {
      const at = s.indexOf(after);
      const chunk = s.slice(at, s.indexOf(";", s.indexOf("tier_excludes_skills", at)));
      return [...chunk.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    };
    const serverReasons = reasonsIn(bare, "export type SkillsAccess = {");
    const clientReasons = reasonsIn(strip(read("hooks", "use-skills-access.ts")), "export type SkillsAccessReason =");
    expect(clientReasons).toEqual(serverReasons);
    expect(serverReasons).toContain("held_seat_history_only");
  });

  it("SkillsGate refuses on the boolean and only varies the WORDS by reason", () => {
    // All five pages it wraps are build-or-record surfaces, so a parked athlete is refused at all
    // five -- passing them through on `allowed` would hand them a New Skill Program button whose
    // every write answers 402. Decided by `canRecord !== true` so a LATER reason that cannot
    // record is refused by default rather than slipping past a list of the ones known today.
    const gate = strip(read("components", "skills-gate.tsx"));
    expect(gate).toContain("access.canRecord !== true");
    expect(gate).not.toMatch(/if \(!access\.allowed\)/);
    // And the hold's own copy sits INSIDE that refusal, never as a separate top-level branch that
    // could be reached while canRecord is still unknown.
    const refusal = gate.slice(gate.indexOf("access.canRecord !== true"));
    expect(refusal).toContain("held_seat_history_only");
    expect(refusal.indexOf("held_seat_history_only")).toBeLessThan(refusal.indexOf("See plans"));
  });

  it("the hold card offers the coach, not a checkout", () => {
    // A parked athlete is not short of a plan; their coach parked them. "See plans" as the
    // headline would answer a question they did not ask, and this repo's rule is that a refusal
    // names what DOES work -- here, that their numbers are still on file and their coach is the
    // way back.
    const gate = strip(read("components", "skills-gate.tsx"));
    const card = blockAt(gate, gate.indexOf("access.reason === \"held_seat_history_only\""));
    expect(card).not.toBe("");
    expect(card).toMatch(/on hold/i);
    expect(card).toMatch(/still on file|still counts/i);
    expect(card).toMatch(/coach brings you back|your coach/i);
    expect(card).not.toContain("/athlete/upgrade");
  });
});
