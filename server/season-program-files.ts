/**
 * WHERE THE FORGE SEASON PROGRAM FILES LIVE (2026-11-22), and how they are read. No database, so
 * the unit test reads the same files the seed does. Every `*.json` in the folder is a group file.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SeasonProgramFile } from "./season-program-structure";

/** The folder the group files live in. */
export const SEASON_PROGRAMS_DIR = join(import.meta.dirname, "seed-data", "season-programs");

// A group file: any name ending .json. Matches "group-c.json"; rejects "group-c.json.bak" and "SPEC.md".
// https://regex101.com/?regex=%5C.json%24&testString=group-c.json
const PROGRAM_FILE = /\.json$/;

/** Every group file in the folder, sorted by name so the seed order is stable. */
export function seasonProgramFiles(dir = SEASON_PROGRAMS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => PROGRAM_FILE.test(f))
    .sort()
    .map((f) => join(dir, f));
}

export function readSeasonProgramFile(path: string): SeasonProgramFile {
  return JSON.parse(readFileSync(path, "utf8")) as SeasonProgramFile;
}

