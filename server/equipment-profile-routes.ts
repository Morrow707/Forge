/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-loop-statements -- written in this repo's own style (HTTP statuses and swap scores named where they are used); the behaviour is pinned by equipment-profile.itest.ts */
/**
 * THE EQUIPMENT PROFILE ROUTES (2026-11-21). The rules live in shared/equipment-profile.ts (the
 * checklist), shared/exercise-needs.ts (what each exercise needs) and server/equipment-room.ts
 * (whose room applies); this file is who may read and write which room, and the assign dialog's
 * check and swaps.
 *
 * Who may write:
 *   - a program's rooms (default and per team): the PRIMARY coach only; staff read;
 *   - a personal room: a Free Agent, a coach or an admin, for themselves;
 *   - never a coached athlete (their program's room is the coach's call) and never a guardian.
 * Nothing here ever blocks training: a room narrows what the AI suggests and adds a marker.
 */
import type { Express, Request } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { requireAuth, requireRole } from "./auth";
import { storage } from "./storage";
import { exercises, programExercises } from "@shared/schema";
import { EQUIPMENT_IDS, MAX_DUMBBELL_LBS, type EquipmentRoom } from "@shared/equipment-profile";
import { missingEquipmentSentence, roomAllows, unmetNeeds, needPhrase } from "@shared/exercise-needs";
import { athleteRoom, clearRoom, primaryCoachIdFor, programRoom, readRoom, saveRoom } from "./equipment-room";

const HTTP = { noContent: 204, badRequest: 400, forbidden: 403, notFound: 404 } as const;

function currentUser(req: Request) {
  return req.user as { id: number; role: "coach" | "athlete" | "admin" | "guardian"; name: string };
}

const idParam = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const roomInputSchema = z.object({
  items: z.array(z.enum(EQUIPMENT_IDS as [string, ...string[]])).max(EQUIPMENT_IDS.length * 2),
  dumbbellMaxLbs: z.coerce.number().int().min(1).max(MAX_DUMBBELL_LBS).nullable().optional(),
});

const toRoom = (input: z.infer<typeof roomInputSchema>): EquipmentRoom => ({
  items: input.items as EquipmentRoom["items"],
  dumbbellMaxLbs: input.dumbbellMaxLbs ?? null,
});

/** A coached athlete has a live roster seat; their room is their program's. */
async function isCoachedAthlete(user: { id: number; role: string }) {
  return user.role === "athlete" && (await storage.getCoachesForAthlete(user.id)).length > 0;
}

async function programTeams(coachId: number) {
  return (await storage.getTeamsForCoach(coachId)).map((t) => ({ id: t.id, name: t.name }));
}

type ProgramFull = NonNullable<Awaited<ReturnType<typeof storage.getProgramFull>>>;

/** May every one of these rooms do this exercise. No rooms (nobody set one) allows everything. */
export function allRoomsAllow(ex: Parameters<typeof roomAllows>[0], rooms: readonly (EquipmentRoom | null)[]): boolean {
  return rooms.every((room) => roomAllows(ex, room));
}

/** Every program exercise at least one of these rooms cannot do, grouped by day. */
export function equipmentGapsFor(program: ProgramFull, rooms: readonly (EquipmentRoom | null)[]) {
  return program.weeks.flatMap((w) =>
    w.days
      .map((d) => ({
        weekNumber: w.weekNumber,
        dayNumber: d.dayNumber,
        dayTitle: d.title,
        exercises: d.exercises
          .filter((pe) => !allRoomsAllow(pe.exercise, rooms))
          .map((pe) => ({
            programExerciseId: pe.id,
            exerciseId: pe.exerciseId,
            name: pe.exercise.name,
            missing: Array.from(new Set(rooms.flatMap((room) => unmetNeeds(pe.exercise, room).map(needPhrase)))),
            marker: rooms.map((room) => missingEquipmentSentence(pe.exercise, room)).find(Boolean) ?? null,
          })),
      }))
      .filter((d) => d.exercises.length > 0),
  );
}

type Candidate = { id: number; name: string; movementType: string | null; muscleGroup: string; category: string };

/** A swap with no model: the closest feasible exercise by pattern, then muscle, then category. */
export function closestFeasible(from: Candidate, feasible: readonly Candidate[]): Candidate | null {
  const others = feasible.filter((e) => e.id !== from.id);
  const score = (e: Candidate) =>
    (from.movementType && e.movementType === from.movementType ? 4 : 0) + (e.muscleGroup === from.muscleGroup ? 2 : 0) + (e.category === from.category ? 1 : 0);
  const best = [...others].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
  return best && score(best) > 0 ? best : null;
}

export function registerEquipmentProfileRoutes(app: Express): void {
  // ---- whose room am I in (the picker's toggle and the builder's marker) ----
  app.get("/api/equipment/my-room", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (user.role === "guardian") return res.json({ room: null, scope: "none" });
    const teamId = idParam(req.query.teamId);
    if (user.role === "coach") {
      const primaryCoachId = await primaryCoachIdFor(user.id);
      const teams = teamId ? await programTeams(user.id) : [];
      const scopedTeam = teamId && teams.some((t) => t.id === teamId) ? teamId : null;
      return res.json({ room: await programRoom(primaryCoachId, scopedTeam), scope: "program" });
    }
    if (user.role === "athlete") {
      const coached = await isCoachedAthlete(user);
      return res.json({ room: await athleteRoom(user.id), scope: coached ? "program" : "personal" });
    }
    res.json({ room: await readRoom({ kind: "personal", userId: user.id }), scope: "personal" });
  });

  // ---- a coach program's rooms ----
  app.get("/api/coach/equipment-profiles", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const primaryCoachId = await primaryCoachIdFor(user.id);
    const teams = await programTeams(user.id);
    const rooms = await Promise.all(teams.map((t) => readRoom({ kind: "program", primaryCoachId, teamId: t.id })));
    res.json({
      canEdit: primaryCoachId === user.id,
      defaultRoom: await readRoom({ kind: "program", primaryCoachId, teamId: null }),
      teams: teams.map((t, i) => ({ ...t, room: rooms[i] })),
    });
  });

  async function primaryOnly(req: Request) {
    const user = currentUser(req);
    const primaryCoachId = await primaryCoachIdFor(user.id);
    return primaryCoachId === user.id ? primaryCoachId : null;
  }
  const PRIMARY_ONLY = "Only the head coach can change the program's equipment. You can see it here.";

  app.put("/api/coach/equipment-profiles/default", requireRole("coach"), async (req, res) => {
    const primaryCoachId = await primaryOnly(req);
    if (!primaryCoachId) return res.status(HTTP.forbidden).json({ message: PRIMARY_ONLY });
    const parsed = roomInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    res.json({ room: await saveRoom({ kind: "program", primaryCoachId, teamId: null }, toRoom(parsed.data), primaryCoachId) });
  });

  app.delete("/api/coach/equipment-profiles/default", requireRole("coach"), async (req, res) => {
    const primaryCoachId = await primaryOnly(req);
    if (!primaryCoachId) return res.status(HTTP.forbidden).json({ message: PRIMARY_ONLY });
    await clearRoom({ kind: "program", primaryCoachId, teamId: null });
    res.status(HTTP.noContent).end();
  });

  app.put("/api/coach/equipment-profiles/teams/:teamId", requireRole("coach"), async (req, res) => {
    const primaryCoachId = await primaryOnly(req);
    if (!primaryCoachId) return res.status(HTTP.forbidden).json({ message: PRIMARY_ONLY });
    const teamId = idParam(req.params.teamId);
    // The caller IS the primary coach (primaryOnly above), so their own teams are the program's.
    const user = currentUser(req);
    const ownTeams = await storage.getTeamsForCoach(user.id);
    if (!teamId || !ownTeams.some((t) => t.id === teamId)) {
      return res.status(HTTP.notFound).json({ message: "Team not found" });
    }
    const parsed = roomInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    res.json({ room: await saveRoom({ kind: "program", primaryCoachId, teamId }, toRoom(parsed.data), primaryCoachId) });
  });

  app.delete("/api/coach/equipment-profiles/teams/:teamId", requireRole("coach"), async (req, res) => {
    const primaryCoachId = await primaryOnly(req);
    if (!primaryCoachId) return res.status(HTTP.forbidden).json({ message: PRIMARY_ONLY });
    const teamId = idParam(req.params.teamId);
    // The caller IS the primary coach (primaryOnly above), so their own teams are the program's.
    const user = currentUser(req);
    const ownTeams = await storage.getTeamsForCoach(user.id);
    if (!teamId || !ownTeams.some((t) => t.id === teamId)) {
      return res.status(HTTP.notFound).json({ message: "Team not found" });
    }
    await clearRoom({ kind: "program", primaryCoachId, teamId });
    res.status(HTTP.noContent).end();
  });

  // ---- a person's own room ----
  const COACHED = "Your coach sets the equipment for your program's weight room.";
  app.get("/api/account/equipment-profile", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (user.role === "guardian") return res.status(HTTP.forbidden).json({ message: "Guardians don't train on Forge." });
    if (await isCoachedAthlete(user)) return res.json({ room: await athleteRoom(user.id), canEdit: false, message: COACHED });
    res.json({ room: await readRoom({ kind: "personal", userId: user.id }), canEdit: true });
  });

  app.put("/api/account/equipment-profile", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (user.role === "guardian") return res.status(HTTP.forbidden).json({ message: "Guardians don't train on Forge." });
    if (await isCoachedAthlete(user)) return res.status(HTTP.forbidden).json({ message: COACHED });
    const parsed = roomInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    res.json({ room: await saveRoom({ kind: "personal", userId: user.id }, toRoom(parsed.data), user.id) });
  });

  app.delete("/api/account/equipment-profile", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (user.role === "guardian" || (await isCoachedAthlete(user))) return res.status(HTTP.forbidden).json({ message: COACHED });
    await clearRoom({ kind: "personal", userId: user.id });
    res.status(HTTP.noContent).end();
  });

  // ---- assigning a program: what the rooms it is going to cannot do ----
  /** The rooms an assignment is for: each selected athlete's (only athletes in this coach's
   * scope), or a named team's, or the program default. Rooms with no profile are dropped. */
  async function roomsForAssignment(coachId: number, body: { teamId?: unknown; athleteIds?: unknown } | undefined) {
    const raw = Array.isArray(body?.athleteIds) ? body!.athleteIds.map(idParam).filter((n): n is number => n != null) : [];
    if (raw.length > 0) {
      const inScope = new Set(await storage.athleteIdsInCoachScope(coachId));
      const rooms = await Promise.all(raw.filter((id) => inScope.has(id)).slice(0, 500).map((id) => athleteRoom(id)));
      return rooms.filter((r): r is EquipmentRoom => r != null);
    }
    const primaryCoachId = await primaryCoachIdFor(coachId);
    const teamId = idParam(body?.teamId);
    const scoped = teamId && (await programTeams(coachId)).some((t) => t.id === teamId) ? teamId : null;
    const room = await programRoom(primaryCoachId, scoped);
    return room ? [room] : [];
  }

  app.post("/api/coach/programs/:programId/equipment-check", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const programId = idParam(req.params.programId);
    if (!programId || !(await storage.getProgramIfUsableByCoach(user.id, programId))) {
      return res.status(HTTP.notFound).json({ message: "Program not found" });
    }
    const program = await storage.getProgramFull(programId);
    if (!program) return res.status(HTTP.notFound).json({ message: "Program not found" });
    const rooms = await roomsForAssignment(user.id, req.body);
    const owned = (await storage.getEffectiveCoachIds(user.id)).includes(program.coachId);
    res.json({ hasProfile: rooms.length > 0, canSwap: owned, days: equipmentGapsFor(program, rooms) });
  });

  /** Suggestions only; nothing is written until the coach applies them. The existing swap logic
   * (storage.substituteExercise, dry run, narrowed to the room) picks each one, and the closest
   * feasible exercise by pattern stands in when the model cannot answer. */
  app.post("/api/coach/programs/:programId/equipment-swaps", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const programId = idParam(req.params.programId);
    const program = programId ? await storage.getProgramFull(programId) : null;
    if (!program || !(await storage.getEffectiveCoachIds(user.id)).includes(program.coachId)) {
      return res.status(HTTP.notFound).json({ message: "Program not found" });
    }
    const rooms = await roomsForAssignment(user.id, req.body);
    const library = await storage.getVisibleExercisesForCoach(user.id);
    const feasible = library.filter((e) => allRoomsAllow(e, rooms));
    const allowedIds = new Set(feasible.map((e) => e.id));
    const byId = new Map(library.map((e) => [e.id, e]));
    const gaps = equipmentGapsFor(program, rooms).flatMap((d) => d.exercises.map((ex) => ({ ...ex, dayTitle: d.dayTitle })));
    const suggestions = await Promise.all(
      gaps.map(async (gap) => {
        const from = byId.get(gap.exerciseId) ?? program.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises)).find((pe) => pe.id === gap.programExerciseId)?.exercise;
        let toId: number | null = null;
        let reason: string | null = null;
        const picked = await storage
          .substituteExercise(programId!, gap.programExerciseId, user.id, `This team's weight room has no ${gap.missing.join(" or ")}`, "", { allowedIds, dryRun: true })
          .catch(() => null);
        const pickedId = picked && "exerciseId" in picked ? picked.exerciseId : undefined;
        if (typeof pickedId === "number" && allowedIds.has(pickedId)) {
          toId = pickedId;
          reason = (picked && "summary" in picked ? picked.summary : null) ?? null;
        } else if (from) {
          toId = closestFeasible(from, feasible)?.id ?? null;
        }
        const to = toId ? byId.get(toId) : undefined;
        return { programExerciseId: gap.programExerciseId, dayTitle: gap.dayTitle, from: { id: gap.exerciseId, name: gap.name }, missing: gap.missing, to: to ? { id: to.id, name: to.name } : null, reason };
      }),
    );
    res.json({ suggestions });
  });

  const applySchema = z.object({
    swaps: z.array(z.object({ programExerciseId: z.number().int().positive(), exerciseId: z.number().int().positive() })).min(1).max(200),
  });
  app.post("/api/coach/programs/:programId/equipment-swaps/apply", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const programId = idParam(req.params.programId);
    const program = programId ? await storage.getProgramFull(programId) : null;
    if (!program || !(await storage.getEffectiveCoachIds(user.id)).includes(program.coachId)) {
      return res.status(HTTP.notFound).json({ message: "Program not found" });
    }
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const inProgram = new Set(program.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((pe) => pe.id))));
    const visible = new Set((await storage.getVisibleExercisesForCoach(user.id)).map((e) => e.id));
    const ok = parsed.data.swaps.filter((s) => inProgram.has(s.programExerciseId) && visible.has(s.exerciseId));
    if (ok.length !== parsed.data.swaps.length) return res.status(HTTP.badRequest).json({ message: "One of those swaps isn't in this program." });
    const exists = await db.select({ id: exercises.id }).from(exercises).where(inArray(exercises.id, ok.map((s) => s.exerciseId)));
    if (exists.length === 0) return res.status(HTTP.badRequest).json({ message: "Exercise not found" });
    await db.transaction(async (tx) => {
      for (const s of ok) {
        await tx.update(programExercises).set({ exerciseId: s.exerciseId }).where(and(eq(programExercises.id, s.programExerciseId)));
      }
    });
    res.json({ applied: ok.length });
  });
}
