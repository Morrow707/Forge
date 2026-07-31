import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, requireAuth, requireRole } from "./auth";
import { storage } from "./storage";
import {
  insertExerciseSchema,
  programStructureSchema,
  insertAssignmentSchema,
  submitWorkoutLogSchema,
} from "@shared/schema";
import { z } from "zod";

function currentUser(req: any) {
  return req.user as { id: number; role: "coach" | "athlete"; name: string };
}

async function assertCoachOwnsExercise(coachId: number, exerciseId: number) {
  const exercise = await storage.getExercise(exerciseId);
  if (!exercise || exercise.coachId !== coachId) return null;
  return exercise;
}

async function assertCoachOwnsProgram(coachId: number, programId: number) {
  const program = await storage.getProgramFull(programId);
  if (!program || program.coachId !== coachId) return null;
  return program;
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // ---------------- Coach: Exercise Bank ----------------

  app.get("/api/coach/exercises", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getExercisesByCoach(user.id);
    res.json(list);
  });

  app.post("/api/coach/exercises", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = insertExerciseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const exercise = await storage.createExercise(user.id, parsed.data);
    res.status(201).json(exercise);
  });

  app.put("/api/coach/exercises/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Exercise not found" });
    const parsed = insertExerciseSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateExercise(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/coach/exercises/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Exercise not found" });
    await storage.deleteExercise(id);
    res.status(204).end();
  });

  // ---------------- Coach: Programs ----------------

  app.get("/api/coach/programs", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getProgramsByCoach(user.id);
    res.json(list);
  });

  app.get("/api/coach/programs/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const program = await assertCoachOwnsProgram(user.id, id);
    if (!program) return res.status(404).json({ message: "Program not found" });
    res.json(program);
  });

  app.post("/api/coach/programs", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = programStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const program = await storage.createProgramWithStructure(user.id, parsed.data);
    res.status(201).json(program);
  });

  app.put("/api/coach/programs/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    const parsed = programStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.updateProgramStructure(id, parsed.data);
    const updated = await storage.getProgramFull(id);
    res.json(updated);
  });

  app.delete("/api/coach/programs/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    await storage.deleteProgram(id);
    res.status(204).end();
  });

  // ---------------- Coach: Roster & Teams ----------------

  app.get("/api/coach/roster", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const roster = await storage.getRosterForCoach(user.id);
    res.json(roster);
  });

  app.get("/api/coach/teams", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const teamList = await storage.getTeamsForCoach(user.id);
    res.json(teamList);
  });

  app.post("/api/coach/teams", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ name: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const team = await storage.createTeam(user.id, parsed.data.name);
    res.status(201).json(team);
  });

  app.post("/api/coach/teams/:id/members", requireRole("coach"), async (req, res) => {
    const teamId = Number(req.params.id);
    const schema = z.object({ athleteId: z.number() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const member = await storage.addAthleteToTeam(teamId, parsed.data.athleteId);
    res.status(201).json(member);
  });

  app.delete(
    "/api/coach/teams/:id/members/:athleteId",
    requireRole("coach"),
    async (req, res) => {
      const teamId = Number(req.params.id);
      const athleteId = Number(req.params.athleteId);
      await storage.removeAthleteFromTeam(teamId, athleteId);
      res.status(204).end();
    },
  );

  app.delete("/api/coach/teams/:id", requireRole("coach"), async (req, res) => {
    await storage.deleteTeam(Number(req.params.id));
    res.status(204).end();
  });

  // ---------------- Coach: Assignments ----------------

  app.get("/api/coach/assignments", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getAssignmentsForCoach(user.id);
    res.json(list);
  });

  app.post("/api/coach/assignments", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = insertAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const owned = await assertCoachOwnsProgram(user.id, parsed.data.programId);
    if (!owned) return res.status(404).json({ message: "Program not found" });

    const roster = await storage.getRosterForCoach(user.id);
    const rosterIds = new Set(roster.map((a) => a.id));
    const invalidAthlete = parsed.data.athleteIds.find((id) => !rosterIds.has(id));
    if (invalidAthlete) {
      return res.status(400).json({ message: "Athlete not on your roster" });
    }

    const created = await storage.createAssignment(
      user.id,
      parsed.data.programId,
      parsed.data.athleteIds,
      parsed.data.startDate,
    );
    res.status(201).json(created);
  });

  // ---------------- Athlete ----------------

  app.get("/api/athlete/coaches", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coaches = await storage.getCoachesForAthlete(user.id);
    res.json(coaches);
  });

  app.get("/api/athlete/calendar", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ start: z.string(), end: z.string() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "start and end query params required" });
    }
    const entries = await storage.getCalendarForAthlete(
      user.id,
      parsed.data.start,
      parsed.data.end,
    );
    res.json(entries);
  });

  app.get("/api/athlete/day", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      assignmentId: z.coerce.number(),
      programDayId: z.coerce.number(),
      date: z.string(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Missing or invalid query params" });
    }
    const detail = await storage.getWorkoutDayDetail(
      user.id,
      parsed.data.assignmentId,
      parsed.data.programDayId,
      parsed.data.date,
    );
    if (!detail) return res.status(404).json({ message: "Workout not found" });
    res.json(detail);
  });

  app.post("/api/athlete/log", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = submitWorkoutLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const log = await storage.submitWorkoutLog(user.id, parsed.data);
    res.status(200).json(log);
  });

  const httpServer = createServer(app);
  return httpServer;
}
