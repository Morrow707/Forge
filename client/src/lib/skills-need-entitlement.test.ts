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
    expect(src).toMatch(/SkillsAccess \| undefined/);
    expect(src).toContain("return data;");
  });

  it("the Library tab strip stops offering skills without access", () => {
    // The gate alone would leave a Skill Programs tab that always turns the athlete away, which
    // reads as a broken tab rather than a tier boundary.
    const src = read("pages", "athlete", "programs.tsx");
    expect(src).toContain("useSkillsAccess");
    expect(src).toMatch(/hiddenSections=\{[^}]*skillPrograms/s);
    expect(src).toMatch(/useSkillsAccess\(\)\?\.allowed === true/);
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
