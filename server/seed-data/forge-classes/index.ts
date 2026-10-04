import type { ForgeClassContent } from "./types";
import { PITCHING_CLASS } from "./pitching";
import { BASKETBALL_SHOOTING_CLASS } from "./basketball-shooting";

/** Every Forge-official class written in the repo, in catalog order. The seed creates each
 * once by name and re-syncs its content on every deploy (server/seed-forge-classes.ts). */
export const FORGE_CLASSES: ForgeClassContent[] = [PITCHING_CLASS, BASKETBALL_SHOOTING_CLASS];
