/**
 * WHICH WEIGHT ROOM A REQUEST IS ABOUT (2026-11-21). The reads and writes of `equipment_profiles`
 * and the one rule for whose room applies. It imports `db` and the schema and NOT storage.ts,
 * because storage.ts's AI paths call it (an import the other way would be a cycle).
 *
 * Whose room:
 *   - a coach building or chatting about a program: the PROGRAM's room (the primary coach's
 *     default, or a team's when the caller names one);
 *   - a coach acting for ONE athlete: that athlete's room;
 *   - an athlete with a live roster seat: their team's room (the lowest-numbered team of theirs
 *     in that program that has one), else the program default;
 *   - a Free Agent, and an admin: their own personal room.
 * Anything with no row answers `null`: no profile, everything available (shared/exercise-needs.ts
 * treats null as "allow all"), so nothing changes for anybody until they set one.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { coachAthletes, coachStaff, equipmentProfiles, teamMembers, teams, users } from "@shared/schema";
import { cleanEquipmentItems, type EquipmentRoom } from "@shared/equipment-profile";

export type RoomScope =
  | { kind: "program"; primaryCoachId: number; teamId: number | null }
  | { kind: "personal"; userId: number };

export function scopeKeyFor(scope: RoomScope): string {
  if (scope.kind === "personal") return `personal:${scope.userId}`;
  return scope.teamId == null ? `program:${scope.primaryCoachId}:default` : `program:${scope.primaryCoachId}:team:${scope.teamId}`;
}

function toRoom(row: { items: string[] | null; dumbbellMaxLbs: number | null } | undefined): EquipmentRoom | null {
  if (!row) return null;
  return { items: cleanEquipmentItems(row.items), dumbbellMaxLbs: row.dumbbellMaxLbs ?? null };
}

export async function readRoom(scope: RoomScope): Promise<EquipmentRoom | null> {
  const [row] = await db.select().from(equipmentProfiles).where(eq(equipmentProfiles.scopeKey, scopeKeyFor(scope))).limit(1);
  return toRoom(row);
}

export async function saveRoom(scope: RoomScope, room: EquipmentRoom, updatedBy: number): Promise<EquipmentRoom> {
  const values = {
    scopeKey: scopeKeyFor(scope),
    kind: scope.kind,
    ownerId: scope.kind === "personal" ? scope.userId : scope.primaryCoachId,
    teamId: scope.kind === "program" ? scope.teamId : null,
    items: cleanEquipmentItems(room.items),
    dumbbellMaxLbs: room.dumbbellMaxLbs,
    updatedBy,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(equipmentProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: equipmentProfiles.scopeKey,
      set: { items: values.items, dumbbellMaxLbs: values.dumbbellMaxLbs, updatedBy, updatedAt: values.updatedAt },
    })
    .returning();
  return toRoom(row)!;
}

export async function clearRoom(scope: RoomScope): Promise<void> {
  await db.delete(equipmentProfiles).where(eq(equipmentProfiles.scopeKey, scopeKeyFor(scope)));
}

export async function primaryCoachIdFor(coachId: number): Promise<number> {
  const [link] = await db
    .select({ primaryCoachId: coachStaff.primaryCoachId })
    .from(coachStaff)
    .where(eq(coachStaff.staffCoachId, coachId))
    .limit(1);
  return link?.primaryCoachId ?? coachId;
}

/** The program's room: the team's when it has one, else the default, else null. */
export async function programRoom(primaryCoachId: number, teamId: number | null): Promise<EquipmentRoom | null> {
  if (teamId != null) {
    const team = await readRoom({ kind: "program", primaryCoachId, teamId });
    if (team) return team;
  }
  return readRoom({ kind: "program", primaryCoachId, teamId: null });
}

/** The room an athlete trains in. A Free Agent's own; a coached athlete's program's. */
export async function athleteRoom(athleteId: number): Promise<EquipmentRoom | null> {
  const [seat] = await db
    .select({ coachId: coachAthletes.coachId })
    .from(coachAthletes)
    .where(and(eq(coachAthletes.athleteId, athleteId), isNull(coachAthletes.heldAt)))
    .orderBy(asc(coachAthletes.id))
    .limit(1);
  if (!seat) return readRoom({ kind: "personal", userId: athleteId });
  const primaryCoachId = await primaryCoachIdFor(seat.coachId);
  const staff = await db.select({ id: coachStaff.staffCoachId }).from(coachStaff).where(eq(coachStaff.primaryCoachId, primaryCoachId));
  const programCoachIds = [primaryCoachId, ...staff.map((s) => s.id)];
  const memberOf = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teamMembers.athleteId, athleteId), inArray(teams.coachId, programCoachIds)))
    .orderBy(asc(teamMembers.teamId));
  if (memberOf.length > 0) {
    const teamRows = await db
      .select()
      .from(equipmentProfiles)
      .where(inArray(equipmentProfiles.scopeKey, memberOf.map((m) => scopeKeyFor({ kind: "program", primaryCoachId, teamId: m.teamId }))));
    const byKey = new Map(teamRows.map((r) => [r.scopeKey, r]));
    const first = memberOf.map((m) => byKey.get(scopeKeyFor({ kind: "program", primaryCoachId, teamId: m.teamId }))).find(Boolean);
    if (first) return toRoom(first);
  }
  return readRoom({ kind: "program", primaryCoachId, teamId: null });
}

/** The room an AI path should plan for, given who is asking and (optionally) for whom. */
export async function roomForActor(actorId: number, athleteId?: number | null): Promise<EquipmentRoom | null> {
  try {
    if (athleteId != null && athleteId !== actorId) return await athleteRoom(athleteId);
    const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1);
    if (!actor) return null;
    if (actor.role === "coach") return await programRoom(await primaryCoachIdFor(actorId), null);
    if (actor.role === "athlete") return await athleteRoom(actorId);
    return await readRoom({ kind: "personal", userId: actorId });
  } catch (err) {
    // A room is a narrowing, never a gate: a failed read plans as if everything were there.
    console.warn("[equipment-room] could not read a room; planning with everything available", err);
    return null;
  }
}

export { equipmentPromptBlock } from "@shared/equipment-profile";
