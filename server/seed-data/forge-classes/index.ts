import type { ForgeClassContent } from "./types";
import { PITCHING_CLASS } from "./pitching";
import { BASKETBALL_SHOOTING_CLASS } from "./basketball-shooting";
import { FOOTBALL_RECEIVING_CLASS } from "./football-receiving";
import { SOCCER_ATTACKING_CLASS } from "./soccer-attacking";
import { VOLLEYBALL_CLASS } from "./volleyball";
import { WRESTLING_CLASS } from "./wrestling";
import { TRACK_SPRINTING_CLASS } from "./track-sprinting";
import { FUNDAMENTALS_CLASS } from "./fundamentals";

/** Every Forge-official class written in the repo, in catalog order. The seed creates each
 * once by name and re-syncs its content on every deploy (server/seed-forge-classes.ts). */
export const FORGE_CLASSES: ForgeClassContent[] = [
  // First in the catalog on purpose: the one class every athlete is meant to read first.
  FUNDAMENTALS_CLASS,
  PITCHING_CLASS,
  BASKETBALL_SHOOTING_CLASS,
  FOOTBALL_RECEIVING_CLASS,
  SOCCER_ATTACKING_CLASS,
  VOLLEYBALL_CLASS,
  WRESTLING_CLASS,
  TRACK_SPRINTING_CLASS,
];
