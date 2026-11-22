/**
 * THE FORGE SEASON PROGRAMS ON REAL POSTGRES (2026-11-22).
 *
 * Every group file in server/seed-data/season-programs/ is seeded against a library holding every
 * name the files use, under a library owner, the way server/seed.ts runs it. Then:
 *   - a second seed changes nothing (create once, by exact name);
 *   - every program is unposted, and carries its tags and its layers;
 *   - an athlete assigned a program with a position layer, set up for that position, reads the
 *     swapped exercise back from getWorkoutDayDetail with the extra care drills, and the program
 *     row itself still holds the original exercise; the same athlete with no setup reads the
 *     program as written;
 *   - a girls'-team assignment gets the warm-up additions, and the coach's view says so.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { assignmentSeasonSetups, assignments, coachAthletes, exercises, programDays, programExercises, programWeeks, programs } from "@shared/schema";
import { db, makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";
import { readSeasonProgramFile, seasonProgramFiles } from "./season-program-files";
import { exerciseNamesIn, type FileProgram } from "./season-program-structure";
import { seedSeasonPrograms } from "./seed-season-programs";
import { storage } from "./storage";
import { GIRLS_TEAM_LABEL, positionLabel } from "@shared/season-program-layers";

const FILES = seasonProgramFiles();
const ENTRIES = FILES.flatMap((f) => readSeasonProgramFile(f).programs);
const ALL_NAMES = [...new Set(ENTRIES.flatMap(exerciseNamesIn))];
const DATE = "2027-01-04";
/** Inserting the library and seeding every group file is a few hundred statements each. */
const SETUP_TIMEOUT_MS = 120_000;
const SEED_TIMEOUT_MS = 300_000;
/** The words the strict seed's error carries. */
const STRICT_REFUSAL = "not in the visible library";

/** A program whose position layer swaps an exercise one of its own days really holds. */
function programWithAPositionSwap(): { program: FileProgram; position: string; replace: string; with: string; dayTitle: string } {
  const found = ENTRIES.flatMap((program) =>
    Object.entries(program.positionLayers ?? {}).flatMap(([position, layer]) =>
      (layer.swaps ?? []).flatMap((swap) =>
        (program.blocks?.[0]?.days ?? [])
          .filter((d) => (d.exercises ?? []).some((e) => e.exercise === swap.replace))
          .filter(() => (layer.addCare ?? []).length > 0)
          .map((d) => ({ program, position, replace: swap.replace, with: swap.with, dayTitle: d.title })),
      ),
    ),
  );
  if (found.length === 0) throw new Error("no season program has a position swap on one of its days");
  return found[0];
}

let ownerId: number;

async function firstDayOf(programName: string, dayTitle?: string) {
  const [program] = await db.select().from(programs).where(eq(programs.name, programName));
  const weeks = await db.select().from(programWeeks).where(eq(programWeeks.programId, program.id));
  const week1 = weeks.find((w) => w.weekNumber === 1)!;
  const days = await db.select().from(programDays).where(eq(programDays.weekId, week1.id));
  const day = dayTitle ? days.find((d) => d.title === dayTitle)! : days.sort((a, b) => a.dayNumber - b.dayNumber)[0];
  return { program, day };
}

async function assignWithSetup(programId: number, setup: { position: string | null; teamGender: string | null } | null) {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: athlete.id });
  const [assignment] = await db
    .insert(assignments)
    .values({ programId, athleteId: athlete.id, coachId: coach.id, startDate: DATE })
    .returning();
  if (setup) await db.insert(assignmentSeasonSetups).values({ assignmentId: assignment.id, ...setup });
  return { coach, athlete, assignment };
}

beforeAll(async () => {
  await resetDatabase();
  const owner = await makeCoach({ role: "admin", name: "Forge" });
  ownerId = owner.id;
  await db.insert(exercises).values(ALL_NAMES.map((name) => ({ coachId: ownerId, name })));
}, SETUP_TIMEOUT_MS);

describe("seeding the season programs", () => {
  it("creates every entry once, unposted, and a second run changes nothing", async () => {
    const first = await seedSeasonPrograms(ownerId);
    expect(first.unresolved).toEqual([]);
    expect(first.created).toHaveLength(ENTRIES.length);
    const rows = await db.select().from(programs).where(eq(programs.coachId, ownerId));
    expect(rows).toHaveLength(ENTRIES.length);
    expect(rows.every((r) => r.isPublished === false)).toBe(true);

    const second = await seedSeasonPrograms(ownerId);
    expect(second.created).toEqual([]);
    expect(second.skippedExisting).toBe(ENTRIES.length);
    expect(await db.select().from(programs).where(eq(programs.coachId, ownerId))).toHaveLength(ENTRIES.length);
  }, SEED_TIMEOUT_MS);

  it("refuses an unknown name loudly when strict", async () => {
    const rows = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.coachId, ownerId));
    const other = await makeCoach({ role: "admin" });
    await expect(seedSeasonPrograms(other.id, { strict: true })).rejects.toThrow(STRICT_REFUSAL);
    expect(rows.length).toBe(ALL_NAMES.length);
  });

  it("carries the tags, the warm-up and the care drills at the end", async () => {
    const sample = ENTRIES.find((e) => e.seasonPhase === "off_season" && (e.blocks?.[0]?.days?.[0]?.care ?? []).length > 0)!;
    const { program, day } = await firstDayOf(sample.name);
    expect(program.seasonPhase).toBe("off_season");
    expect(program.sport).toBe(sample.sport);
    const items = (day.warmup?.items ?? []).length;
    expect(items).toBeGreaterThan(0);
    const rows = await db.select().from(programExercises).where(eq(programExercises.dayId, day.id));
    const sorted = rows.sort((a, b) => a.orderIndex - b.orderIndex);
    expect(sorted[sorted.length - 1].notes).toBe("End-of-session care");
  });
});

describe("the layers, read back for one athlete", () => {
  it("swap a position's exercise and add its care drills, and leave the program as written", async () => {
    const pick = programWithAPositionSwap();
    const { program, day } = await firstDayOf(pick.program.name, pick.dayTitle);
    const nameToId = new Map(
      (await db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(inArray(exercises.name, [pick.replace, pick.with])))
        .map((r) => [r.name, r.id]),
    );

    const withSetup = await assignWithSetup(program.id, { position: pick.position.toUpperCase(), teamGender: null });
    const detail = await storage.getWorkoutDayDetail(withSetup.athlete.id, withSetup.assignment.id, day.id, DATE);
    const swapped = detail!.day.exercises.find((e) => e.layerSwappedFrom?.name === pick.replace);
    expect(swapped?.exercise.id).toBe(nameToId.get(pick.with));
    expect(detail!.layers.labels).toEqual([positionLabel(pick.position)]);
    expect(detail!.day.layerCare.length).toBeGreaterThan(0);

    // The program row still holds the original exercise.
    const stored = await db.select().from(programExercises).where(eq(programExercises.dayId, day.id));
    expect(stored.some((r) => r.exerciseId === nameToId.get(pick.replace))).toBe(true);

    // The coach's view of the same day says the same thing.
    const coachView = await storage.getAssignmentDayLayersForCoach(withSetup.coach.id, withSetup.assignment.id, day.id);
    expect(coachView!.swaps.map((s) => s.from)).toContain(pick.replace);

    // No setup, no layer: the program as written.
    const plain = await assignWithSetup(program.id, null);
    const plainDetail = await storage.getWorkoutDayDetail(plain.athlete.id, plain.assignment.id, day.id, DATE);
    expect(plainDetail!.day.exercises.some((e) => e.exercise.id === nameToId.get(pick.replace))).toBe(true);
    expect(plainDetail!.day.exercises.every((e) => e.layerSwappedFrom == null)).toBe(true);
    expect(plainDetail!.day.layerCare).toEqual([]);
  });

  it("add the girls'-team warm-up drills for a girls' team only", async () => {
    const sample = ENTRIES.find((e) => (e.girlsTeam?.addWarmup ?? []).length > 0);
    if (!sample) throw new Error("no season program has a girls' team layer");
    const { program, day } = await firstDayOf(sample.name);
    const own = (day.warmup?.items ?? []).length;

    const girls = await assignWithSetup(program.id, { position: null, teamGender: "girls" });
    const girlsDetail = await storage.getWorkoutDayDetail(girls.athlete.id, girls.assignment.id, day.id, DATE);
    expect(girlsDetail!.day.warmup!.items.length).toBe(own + sample.girlsTeam!.addWarmup!.length);
    expect(girlsDetail!.layers.labels).toEqual([GIRLS_TEAM_LABEL]);
    const coachView = await storage.getAssignmentDayLayersForCoach(girls.coach.id, girls.assignment.id, day.id);
    expect(coachView!.addWarmup.length).toBe(sample.girlsTeam!.addWarmup!.length);

    const boys = await assignWithSetup(program.id, { position: null, teamGender: "boys" });
    const boysDetail = await storage.getWorkoutDayDetail(boys.athlete.id, boys.assignment.id, day.id, DATE);
    expect(boysDetail!.day.warmup!.items.length).toBe(own);
    expect(boysDetail!.layers.labels).toEqual([]);
  });
});
