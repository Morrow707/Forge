import { describe, expect, it } from "vitest";
import { convertSeasonProgram, seasonBlockPhase } from "./season-program-structure";
import { readSeasonProgramFile, seasonProgramFiles } from "./season-program-files";

describe("a Forge season program's training blocks carry a phase", () => {
  it("maps each season to the phase its blocks train", () => {
    expect(seasonBlockPhase("off_season", 0)).toBe("accumulation");
    expect(seasonBlockPhase("off_season", 1)).toBe("intensification");
    expect(seasonBlockPhase("pre_season", 0)).toBe("realization");
    expect(seasonBlockPhase("in_season", 0)).toBe("realization");
    expect(seasonBlockPhase(null, 0)).toBeNull();
  });

  it("no off-, pre-, in- or post-season block in the files converts to No phase", () => {
    let checked = 0;
    for (const file of seasonProgramFiles()) {
      for (const program of readSeasonProgramFile(file).programs) {
        if (!program.postSeason && !["off_season", "pre_season", "in_season"].includes(program.seasonPhase ?? "")) continue;
        const converted = convertSeasonProgram(program, () => 1);
        for (const block of converted.structure.blocks) {
          expect(block.phase, `${program.name} / ${block.name}`).toBeTruthy();
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(100);
  });
});
