import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";

// THE FORGE LIBRARY BELONGS TO FORGE, NOT TO WHICHEVER ADMIN TYPED IT.
//
// Every admin library list filtered to the signed-in admin's own effective coach
// ids, so a newly promoted admin opened Forge Library, Forge Skill Bank and Forge
// Programs and saw "The Forge library is empty" -- content every coach could see --
// and a direct URL to any existing Forge row 404'd.
//
// The fix has to keep the other half true: reading is shared, editing is not. These
// pin both, because "let admins see each other's rows" done carelessly also lets
// one admin overwrite another's draft.

async function makeAdmin() {
  const [row] = await db
    .insert(users)
    .values({
      email: `admin-${Math.random().toString(36).slice(2)}@example.test`,
      passwordHash: "not-a-real-hash",
      name: "Test Admin",
      role: "admin",
    })
    .returning();
  return row;
}

describe("one admin's Forge content is visible to another", () => {
  beforeEach(resetDatabase);

  it("lists an exercise authored by a different admin", async () => {
    const first = await makeAdmin();
    const second = await makeAdmin();
    await makeExercise(first.id, { name: "Hang Clean" });

    const asAuthor = await storage.getExercisesByCoach(first.id, { includeAllAdmins: true });
    const asOther = await storage.getExercisesByCoach(second.id, { includeAllAdmins: true });
    expect(asAuthor.map((e) => e.name)).toContain("Hang Clean");
    expect(asOther.map((e) => e.name)).toContain("Hang Clean");
  });

  it("marks it editable for its author and read-only for the other admin", async () => {
    const first = await makeAdmin();
    const second = await makeAdmin();
    const ex = await makeExercise(first.id, { name: "Hang Clean" });

    expect((await storage.getExerciseDetail(ex.id, first.id))?.editable).toBe(true);
    expect((await storage.getExerciseDetail(ex.id, second.id))?.editable).toBe(false);
  });

  it("does not leak a coach's own exercise into an admin's Forge library", async () => {
    const admin = await makeAdmin();
    const coach = await makeCoach();
    await makeExercise(coach.id, { name: "Coach's Own Movement" });

    const list = await storage.getExercisesByCoach(admin.id, { includeAllAdmins: true });
    expect(list.map((e) => e.name)).not.toContain("Coach's Own Movement");
  });

  it("leaves a coach's own library scoped to their staff, admins excluded", async () => {
    const admin = await makeAdmin();
    const coach = await makeCoach();
    await makeExercise(admin.id, { name: "Forge Official Movement" });
    await makeExercise(coach.id, { name: "Mine" });

    // No includeAllAdmins: this is the coach's own bank, which is the "my exercises"
    // list and deliberately not the Forge library (getVisibleExercisesForCoach is
    // the union of the two, and is a different question).
    const list = await storage.getExercisesByCoach(coach.id);
    expect(list.map((e) => e.name)).toEqual(["Mine"]);
  });
});
