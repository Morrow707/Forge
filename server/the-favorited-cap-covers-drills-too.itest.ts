import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  skillAssignments,
  skillExercises,
  skillProgramDays,
  skillProgramExercises,
  skillProgramWeeks,
  skillPrograms,
  skillSessionLogs,
  uploadedFiles,
} from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";
import { VIDEO_RETENTION, VIDEO_STORAGE_ADD_ON } from "@shared/video-retention";

/**
 * The scan half of this lives in the-favorited-cap-covers-drills-too.test.ts and proves the trim
 * is wired into all three exits from createSkillSessionLog. This half proves it actually trims,
 * through the real method against real Postgres, because the thing that was wrong was a query:
 * the strength twin joins workout tables, so no amount of reading the skill side's call sites
 * would have told you whether the rows it selects are the right rows.
 */

async function oneDrillProgram(coachId: number, athleteId: number) {
  const [drill] = await db
    .insert(skillExercises)
    .values({ coachId, name: "Tee", sports: ["baseball"], skillType: "Hitting" })
    .returning();
  const [program] = await db.insert(skillPrograms).values({ coachId, name: "Hitting" }).returning();
  const [week] = await db.insert(skillProgramWeeks).values({ programId: program.id, weekNumber: 1 }).returning();
  const [day] = await db.insert(skillProgramDays).values({ weekId: week.id, dayNumber: 1, title: "D1" }).returning();
  const [slot] = await db
    .insert(skillProgramExercises)
    .values({ dayId: day.id, skillExerciseId: drill.id, orderIndex: 0, sets: 20, reps: "10" })
    .returning();
  const [other] = await db
    .insert(skillProgramExercises)
    .values({ dayId: day.id, skillExerciseId: drill.id, orderIndex: 1, sets: 20, reps: "10" })
    .returning();
  const [assignment] = await db
    .insert(skillAssignments)
    .values({ skillProgramId: program.id, athleteId, coachId, startDate: "2026-01-05" })
    .returning();
  return { day, slot, other, assignment };
}

// The ownership check in createSkillSessionLog reads uploadedFiles, so a clip needs a row there
// owned by the athlete or the save is refused before it ever reaches the trim.
async function ownedClip(athleteId: number, n: number) {
  const path = `/uploads/form-videos/skill-${athleteId}-${n}.mp4`;
  await db.insert(uploadedFiles).values({ path, uploadedBy: athleteId });
  return path;
}

function makeSaver(athleteId: number, ctx: Awaited<ReturnType<typeof oneDrillProgram>>) {
  return async (n: number, opts: { favorited: boolean; slotId?: number; setNumber?: number }) =>
    storage.createSkillSessionLog(athleteId, {
      skillAssignmentId: ctx.assignment.id,
      skillProgramDayId: ctx.day.id,
      skillProgramExerciseId: opts.slotId ?? ctx.slot.id,
      trackingLevel: "mechanics",
      videoUrl: await ownedClip(athleteId, n),
      videoFavorited: opts.favorited,
      ...(opts.setNumber != null ? { setNumber: opts.setNumber, date: "2026-01-05" } : {}),
    } as never);
}

const favoritedFor = async (athleteId: number) => {
  const rows = await db
    .select({ id: skillSessionLogs.id, favorited: skillSessionLogs.videoFavorited })
    .from(skillSessionLogs)
    .where(eq(skillSessionLogs.athleteId, athleteId));
  return rows.filter((r) => r.favorited).map((r) => r.id);
};

describe("a favorited drill clip is trimmed to the cap", () => {
  beforeEach(resetDatabase);

  it("keeps the newest favorites and un-favorites the oldest past the cap", async () => {
    const coach = await makeCoach();
    // isBetaAccount false: a comped account has an unlimited cap and this would prove nothing.
    const athlete = await makeAthlete({ isBetaAccount: false, dateOfBirth: "1990-01-01" });
    const ctx = await oneDrillProgram(coach.id, athlete.id);
    const save = makeSaver(athlete.id, ctx);

    const saved: number[] = [];
    for (let n = 0; n < VIDEO_RETENTION.favoritedCap + 2; n += 1) {
      const row = await save(n, { favorited: true });
      saved.push(row.id);
    }

    const stillFavorited = await favoritedFor(athlete.id);
    expect(stillFavorited).toHaveLength(VIDEO_RETENTION.favoritedCap);
    // The oldest two lost the flag, and nothing was deleted -- every row is still there with its
    // clip pointer intact, which is the difference between this trim and the total-cap sweep.
    expect(stillFavorited).toEqual(saved.slice(2).sort((a, b) => a - b));
    const all = await db.select().from(skillSessionLogs).where(eq(skillSessionLogs.athleteId, athlete.id));
    expect(all).toHaveLength(VIDEO_RETENTION.favoritedCap + 2);
    expect(all.every((r) => r.videoUrl != null)).toBe(true);
  });

  it("gives the storage add-on the higher cap it is sold on", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete({
      isBetaAccount: false,
      dateOfBirth: "1990-01-01",
      hasVideoStorageAddOn: true,
    });
    const ctx = await oneDrillProgram(coach.id, athlete.id);
    const save = makeSaver(athlete.id, ctx);

    for (let n = 0; n < VIDEO_STORAGE_ADD_ON.favoritedCap; n += 1) {
      await save(n, { favorited: true });
    }
    expect(await favoritedFor(athlete.id)).toHaveLength(VIDEO_STORAGE_ADD_ON.favoritedCap);
  });

  it("leaves a comped account alone entirely", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete({ isBetaAccount: true, dateOfBirth: "1990-01-01" });
    const ctx = await oneDrillProgram(coach.id, athlete.id);
    const save = makeSaver(athlete.id, ctx);

    for (let n = 0; n < VIDEO_RETENTION.favoritedCap + 3; n += 1) {
      await save(n, { favorited: true });
    }
    expect(await favoritedFor(athlete.id)).toHaveLength(VIDEO_RETENTION.favoritedCap + 3);
  });

  it("counts each drill separately, as the strength side counts each exercise", async () => {
    // The cap is per (athlete, drill) -- filming a lot of one drill must not quietly un-favorite
    // the one good clip of another.
    const coach = await makeCoach();
    const athlete = await makeAthlete({ isBetaAccount: false, dateOfBirth: "1990-01-01" });
    const ctx = await oneDrillProgram(coach.id, athlete.id);
    const save = makeSaver(athlete.id, ctx);

    const keep = await save(99, { favorited: true, slotId: ctx.other.id });
    for (let n = 0; n < VIDEO_RETENTION.favoritedCap + 2; n += 1) {
      await save(n, { favorited: true });
    }

    const [other] = await db.select().from(skillSessionLogs).where(eq(skillSessionLogs.id, keep.id));
    expect(other.videoFavorited).toBe(true);
  });

  it("trims the plain-append path too, which carries no skillDayLog", async () => {
    // A save with no setNumber/date falls through to the plain append and leaves skillDayLogId
    // null. A trim that joined through skillDayLogs would skip exactly these rows.
    const coach = await makeCoach();
    const athlete = await makeAthlete({ isBetaAccount: false, dateOfBirth: "1990-01-01" });
    const ctx = await oneDrillProgram(coach.id, athlete.id);
    const save = makeSaver(athlete.id, ctx);

    for (let n = 0; n < VIDEO_RETENTION.favoritedCap + 1; n += 1) {
      await save(n, { favorited: true });
    }
    const rows = await db.select().from(skillSessionLogs).where(eq(skillSessionLogs.athleteId, athlete.id));
    expect(rows.every((r) => r.skillDayLogId == null)).toBe(true);
    expect(await favoritedFor(athlete.id)).toHaveLength(VIDEO_RETENTION.favoritedCap);
  });

  it("trims the slotted path as well, where the row DOES carry a day log", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete({ isBetaAccount: false, dateOfBirth: "1990-01-01" });
    const ctx = await oneDrillProgram(coach.id, athlete.id);
    const save = makeSaver(athlete.id, ctx);

    for (let n = 0; n < VIDEO_RETENTION.favoritedCap + 1; n += 1) {
      await save(n, { favorited: true, setNumber: n + 1 });
    }
    const rows = await db.select().from(skillSessionLogs).where(eq(skillSessionLogs.athleteId, athlete.id));
    expect(rows.every((r) => r.skillDayLogId != null)).toBe(true);
    expect(await favoritedFor(athlete.id)).toHaveLength(VIDEO_RETENTION.favoritedCap);
  });

  it("re-records a set over the cap without the replacement pushing itself out", async () => {
    // The re-record UPDATE is the third exit. Saving Set 1 again replaces that row rather than
    // adding one, so the favorited count does not grow -- and the trim must not un-favorite the
    // clip that was just recorded.
    const coach = await makeCoach();
    const athlete = await makeAthlete({ isBetaAccount: false, dateOfBirth: "1990-01-01" });
    const ctx = await oneDrillProgram(coach.id, athlete.id);
    const save = makeSaver(athlete.id, ctx);

    for (let n = 0; n < VIDEO_RETENTION.favoritedCap; n += 1) {
      await save(n, { favorited: true, setNumber: n + 1 });
    }
    const redone = await save(500, { favorited: true, setNumber: 1 });
    const stillFavorited = await favoritedFor(athlete.id);
    expect(stillFavorited).toHaveLength(VIDEO_RETENTION.favoritedCap);
    expect(stillFavorited).toContain(redone.id);
  });

  it("caps a minor on a comped account, where an adult goes untrimmed", async () => {
    // Not an entitlement: a cap on a child's footage is a data-minimisation promise, so the
    // comped short-circuit proven two cases above must NOT reach a minor. Same account flags as
    // that case, one birthdate apart, and the opposite outcome. See minor-video-retention.test.ts
    // for the decision itself; this is the half that proves the drill save path consults it.
    const coach = await makeCoach();
    const thisYear = new Date().getUTCFullYear();
    const athlete = await makeAthlete({
      isBetaAccount: true,
      dateOfBirth: `${thisYear - 14}-01-01`,
    });
    const ctx = await oneDrillProgram(coach.id, athlete.id);
    const save = makeSaver(athlete.id, ctx);

    for (let n = 0; n < VIDEO_RETENTION.favoritedCap + 2; n += 1) {
      await save(n, { favorited: true });
    }
    expect(await favoritedFor(athlete.id)).toHaveLength(VIDEO_RETENTION.favoritedCap);
  });

  it("still honours a minor's paid add-on", async () => {
    // The exemption is from the FREE unlocks, not from what somebody bought -- so a minor whose
    // account holds the storage add-on gets the higher cap, not the base one.
    const coach = await makeCoach();
    const thisYear = new Date().getUTCFullYear();
    const athlete = await makeAthlete({
      isBetaAccount: true,
      hasVideoStorageAddOn: true,
      dateOfBirth: `${thisYear - 14}-01-01`,
    });
    const ctx = await oneDrillProgram(coach.id, athlete.id);
    const save = makeSaver(athlete.id, ctx);

    for (let n = 0; n < VIDEO_STORAGE_ADD_ON.favoritedCap + 1; n += 1) {
      await save(n, { favorited: true });
    }
    expect(await favoritedFor(athlete.id)).toHaveLength(VIDEO_STORAGE_ADD_ON.favoritedCap);
  });
});
