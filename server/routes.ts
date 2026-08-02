import express, { type Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { setupAuth, requireAuth, requireRole } from "./auth";
import { storage } from "./storage";
import { buildIcsFeed } from "./ics";
import { sendPushToUser, getVapidPublicKey } from "./push";
import {
  insertExerciseSchema,
  programStructureSchema,
  insertAssignmentSchema,
  updateAssignmentSchema,
  submitWorkoutLogSchema,
  updateProgramDaySchema,
  updateCorrectivesSchema,
  applyCorrectivesToDaysSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  updateNotificationPrefsSchema,
  updateHealthStatusSchema,
  pushSubscribeSchema,
  createWorkoutCommentSchema,
  createExerciseReportSchema,
  resolveSubmissionSchema,
  coachAnalyticsQuerySchema,
  createTeamPostSchema,
  createBodyMetricSchema,
  createAnnotationSchema,
} from "@shared/schema";
import { z } from "zod";

// Form-check clips are opt-in and athlete-initiated: recorded in the
// browser, previewed, then either saved here or discarded and never sent.
// There is no automatic/background upload of raw video anywhere in the app.
const UPLOADS_DIR = path.join(process.cwd(), "server", "uploads", "form-videos");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Coach-drawn markup on a paused video frame -- sent as a PNG data URL
// (small, canvas-generated) rather than multipart, decoded and written to
// disk here the same way an uploaded video is.
const ANNOTATIONS_DIR = path.join(process.cwd(), "server", "uploads", "annotations");
fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true });
const MAX_ANNOTATION_BYTES = 5 * 1024 * 1024;

const VIDEO_EXTENSION_BY_MIME: Record<string, string> = {
  "video/webm": ".webm",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};

const uploadFormVideo = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${VIDEO_EXTENSION_BY_MIME[file.mimetype] ?? ""}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!VIDEO_EXTENSION_BY_MIME[file.mimetype]) {
      return cb(new Error("Unsupported video format"));
    }
    cb(null, true);
  },
});

function currentUser(req: any) {
  return req.user as { id: number; role: "coach" | "athlete" | "admin"; name: string };
}

async function assertOwnsExercise(userId: number, exerciseId: number) {
  const exercise = await storage.getExercise(exerciseId);
  if (!exercise || exercise.coachId !== userId) return null;
  return exercise;
}

async function assertCoachOwnsProgram(coachId: number, programId: number) {
  const program = await storage.getProgramFull(programId);
  if (!program || program.coachId !== coachId) return null;
  return program;
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);
  app.use("/uploads", express.static(path.join(process.cwd(), "server", "uploads")));

  // ---------------- Public calendar subscribe feed ----------------
  // Deliberately unauthenticated: calendar apps (Google/Apple/Outlook)
  // re-fetch a plain URL on their own schedule and can't carry a session
  // cookie, so access control here is "possession of the unguessable
  // token" rather than a login. Only ever resolves to an athlete's own
  // training days -- never rest days, to keep a subscribed calendar from
  // filling up with noise.
  app.get("/api/calendar/:token.ics", async (req, res) => {
    const user = await storage.getUserByCalendarToken(req.params.token);
    if (!user || user.role !== "athlete") {
      return res.status(404).send("Calendar not found");
    }
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const end = new Date();
    end.setDate(end.getDate() + 180);
    const toIso = (d: Date) => d.toISOString().slice(0, 10);
    const entries = await storage.getCalendarForAthlete(user.id, toIso(start), toIso(end));
    const feed = buildIcsFeed(
      `Forge Training — ${user.name}`,
      entries
        .filter((e) => !e.isRestDay)
        .map((e) => ({
          uid: `forge-assignment${e.assignmentId}-day${e.programDayId}-${e.date}`,
          date: e.date,
          summary: e.title,
          description: e.programName,
        })),
    );
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(feed);
  });

  // ---------------- Coach: Exercise Bank ----------------
  // A coach sees their own private exercises plus every Forge-official
  // (admin-created) exercise, but can only edit/delete the ones they
  // personally created -- Forge exercises are read-only to them.

  app.get("/api/coach/exercises", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getVisibleExercisesForCoach(user.id);
    res.json(list);
  });

  app.get("/api/coach/exercises/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const exercise = await storage.getExerciseDetail(id, user.id);
    if (!exercise || (!exercise.isForgeOfficial && exercise.coachId !== user.id)) {
      return res.status(404).json({ message: "Exercise not found" });
    }
    res.json(exercise);
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
    const owned = await assertOwnsExercise(user.id, id);
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
    const owned = await assertOwnsExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Exercise not found" });
    await storage.deleteExercise(id);
    res.status(204).end();
  });

  app.post("/api/coach/exercises/:id/submit", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertOwnsExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Exercise not found" });
    const existing = await storage.getPendingSubmissionForExercise(id, user.id);
    if (existing) {
      return res.status(409).json({ message: "Already submitted, pending review" });
    }
    const submission = await storage.createExerciseSubmission(id, user.id);
    res.status(201).json(submission);
  });

  app.post("/api/coach/exercises/:id/report", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const exercise = await storage.getExerciseDetail(id, user.id);
    if (!exercise || (!exercise.isForgeOfficial && exercise.coachId !== user.id)) {
      return res.status(404).json({ message: "Exercise not found" });
    }
    const parsed = createExerciseReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const report = await storage.createExerciseReport(id, user.id, parsed.data);
    res.status(201).json(report);
  });

  // ---------------- Admin: Forge Exercise Library ----------------
  // An admin's own exercise bank *is* the Forge library -- everything they
  // create here is automatically shared, read-only, with every coach (see
  // getVisibleExercisesForCoach). Admins have no calendar or roster access.

  app.get("/api/admin/exercises", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getExercisesByCoach(user.id);
    res.json(list);
  });

  app.get("/api/admin/exercises/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const exercise = await storage.getExerciseDetail(id, user.id);
    if (!exercise || exercise.coachId !== user.id) {
      return res.status(404).json({ message: "Exercise not found" });
    }
    res.json(exercise);
  });

  app.post("/api/admin/exercises", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = insertExerciseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const exercise = await storage.createExercise(user.id, parsed.data);
    res.status(201).json(exercise);
  });

  app.put("/api/admin/exercises/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertOwnsExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Exercise not found" });
    const parsed = insertExerciseSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateExercise(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/admin/exercises/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertOwnsExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Exercise not found" });
    await storage.deleteExercise(id);
    res.status(204).end();
  });

  // ---------------- Admin: Forge Program Library ----------------
  // Same model as the exercise library -- an admin's own programs are
  // automatically shared, read-only, with every coach (see
  // getVisibleProgramsForCoach).

  app.get("/api/admin/programs", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getProgramsByCoach(user.id);
    res.json(list);
  });

  app.get("/api/admin/programs/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const program = await assertCoachOwnsProgram(user.id, id);
    if (!program) return res.status(404).json({ message: "Program not found" });
    res.json({ ...program, isForgeOfficial: true, ownerLabel: "FORGE", editable: true });
  });

  app.post("/api/admin/programs", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = programStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const program = await storage.createProgramWithStructure(user.id, parsed.data);
    res.status(201).json(program);
  });

  app.put("/api/admin/programs/:id", requireRole("admin"), async (req, res) => {
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

  app.delete("/api/admin/programs/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    await storage.deleteProgram(id);
    res.status(204).end();
  });

  // ---------------- Admin: Review Queue ----------------
  // Coaches nominate their own exercises for official Forge status, or
  // flag a problem with an existing Forge exercise. Both land here.

  app.get("/api/admin/submissions", requireRole("admin"), async (req, res) => {
    const list = await storage.getPendingSubmissionsForAdmin();
    res.json(list);
  });

  app.post("/api/admin/submissions/:id/resolve", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const parsed = resolveSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.resolveSubmission(id, parsed.data.approve, user.id);
    if (!updated) return res.status(404).json({ message: "Submission not found" });
    res.json(updated);
  });

  app.get("/api/admin/reports", requireRole("admin"), async (req, res) => {
    const list = await storage.getOpenReportsForAdmin();
    res.json(list);
  });

  app.post("/api/admin/reports/:id/resolve", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const updated = await storage.resolveReport(id);
    if (!updated) return res.status(404).json({ message: "Report not found" });
    res.json(updated);
  });

  // ---------------- Coach: Programs ----------------

  app.get("/api/coach/programs", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getVisibleProgramsForCoach(user.id);
    res.json(list);
  });

  app.get("/api/coach/programs/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const program = await storage.getVisibleProgramDetail(id, user.id);
    if (!program) return res.status(404).json({ message: "Program not found" });
    res.json(program);
  });

  app.get("/api/coach/programs/:id/day-groups", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    // Read-only lookup used while assigning (own programs or Forge
    // templates) -- not an edit, so it uses the same "usable" check as
    // assignment creation rather than strict ownership.
    const program = await storage.getProgramIfUsableByCoach(user.id, id);
    if (!program) return res.status(404).json({ message: "Program not found" });
    const groups = await storage.getNonRestDayGroups(id);
    res.json(groups);
  });

  app.get("/api/coach/programs/:id/schedule", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const program = await storage.getProgramIfUsableByCoach(user.id, id);
    if (!program) return res.status(404).json({ message: "Program not found" });
    const schema = z.object({ startDate: z.string() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "startDate query param required" });
    }
    const schedule = await storage.getProgramSchedule(id, parsed.data.startDate);
    res.json(schedule);
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

  app.get("/api/coach/roster/:athleteId", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = Number(req.params.athleteId);
    const athlete = await storage.getRosterAthleteForCoach(user.id, athleteId);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    res.json(athlete);
  });

  app.patch("/api/coach/roster/:athleteId/profile", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = Number(req.params.athleteId);
    const existing = await storage.getRosterAthleteForCoach(user.id, athleteId);
    if (!existing) return res.status(404).json({ message: "Athlete not found" });
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateUserProfile(athleteId, parsed.data);
    const { passwordHash, ...publicUser } = updated;
    res.json(publicUser);
  });

  app.patch(
    "/api/coach/roster/:athleteId/health-status",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const parsed = updateHealthStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const updated = await storage.updateAthleteHealthStatus(
        user.id,
        athleteId,
        parsed.data.healthStatus,
      );
      if (!updated) return res.status(404).json({ message: "Athlete not found" });
      res.json(updated);
    },
  );

  app.get(
    "/api/coach/roster/:athleteId/calendar-link",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const token = await storage.getOrCreateCalendarToken(athleteId);
      res.json({ token });
    },
  );

  // Normally athlete-logged; a coach can also add an entry directly here
  // (e.g. a weigh-in during a testing day), same roster-membership gate as
  // everything else in this section.
  app.get(
    "/api/coach/roster/:athleteId/body-metrics",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const entries = await storage.getBodyMetricsForAthlete(athleteId);
      res.json(entries);
    },
  );

  app.post(
    "/api/coach/roster/:athleteId/body-metrics",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const parsed = createBodyMetricSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const entry = await storage.createBodyMetric(athleteId, parsed.data);
      res.status(201).json(entry);
    },
  );

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

  // ---------------- Coach & Athlete: Team board ----------------
  // A single shared board per coach, visible to the coach and every athlete
  // on their roster -- deliberately not private 1:1 messaging.

  app.get("/api/coach/team-board", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const posts = await storage.getTeamBoardPosts(user.id);
    res.json(posts);
  });

  app.post("/api/coach/team-board", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = createTeamPostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const post = await storage.createTeamPost(user.id, user.id, parsed.data.body);
    res.status(201).json(post);
  });

  app.get("/api/athlete/team-board", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coaches = await storage.getCoachesForAthlete(user.id);
    const coach = coaches[0];
    if (!coach) return res.status(404).json({ message: "You're not linked to a coach yet." });
    const posts = await storage.getTeamBoardPosts(coach.id);
    res.json(posts);
  });

  app.post("/api/athlete/team-board", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coaches = await storage.getCoachesForAthlete(user.id);
    const coach = coaches[0];
    if (!coach) return res.status(404).json({ message: "You're not linked to a coach yet." });
    const parsed = createTeamPostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const post = await storage.createTeamPost(coach.id, user.id, parsed.data.body);
    res.status(201).json(post);
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
    const usable = await storage.getProgramIfUsableByCoach(user.id, parsed.data.programId);
    if (!usable) return res.status(404).json({ message: "Program not found" });

    const roster = await storage.getRosterForCoach(user.id);
    const rosterIds = new Set(roster.map((a) => a.id));
    const invalidAthlete = parsed.data.athletes.find((a) => !rosterIds.has(a.athleteId));
    if (invalidAthlete) {
      return res.status(400).json({ message: "Athlete not on your roster" });
    }

    const result = await storage.createAssignment(
      user.id,
      parsed.data.programId,
      parsed.data.athletes,
      parsed.data.startDate,
      parsed.data.dateOverrides,
    );
    res.status(201).json(result);
  });

  app.patch("/api/coach/assignments/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await storage.getAssignmentForCoach(user.id, id);
    if (!owned) return res.status(404).json({ message: "Assignment not found" });
    const parsed = updateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateAssignment(id, parsed.data);
    res.json(updated);
  });

  // ---------------- Coach: Calendar ----------------

  app.get("/api/coach/calendar", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      start: z.string(),
      end: z.string(),
      athleteId: z.coerce.number().optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "start and end query params required" });
    }
    const entries = await storage.getCalendarForCoach(
      user.id,
      parsed.data.start,
      parsed.data.end,
      parsed.data.athleteId,
    );
    res.json(entries);
  });

  app.get("/api/coach/program-days/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const day = await storage.getProgramDayForCoachView(user.id, id);
    if (!day) return res.status(404).json({ message: "Day not found" });
    res.json(day);
  });

  app.put("/api/coach/program-days/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const existing = await storage.getProgramDayForCoach(user.id, id);
    if (!existing) return res.status(404).json({ message: "Day not found" });
    const parsed = updateProgramDaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.updateProgramDay(id, parsed.data);
    const updated = await storage.getProgramDayForCoach(user.id, id);
    res.json(updated);
  });

  // ---------------- Coach: Correctives ----------------

  app.get(
    "/api/coach/assignments/:assignmentId/days/:programDayId/correctives",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const programDayId = Number(req.params.programDayId);
      const owned = await storage.getAssignmentForCoach(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Assignment not found" });
      const correctives = await storage.getCorrectivesForAssignmentDay(
        assignmentId,
        programDayId,
      );
      res.json({ correctivesEnabled: owned.correctivesEnabled, correctives });
    },
  );

  app.put(
    "/api/coach/assignments/:assignmentId/days/:programDayId/correctives",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const programDayId = Number(req.params.programDayId);
      const owned = await storage.getAssignmentForCoach(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Assignment not found" });
      const parsed = updateCorrectivesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      await storage.updateCorrectivesForAssignmentDay(assignmentId, programDayId, parsed.data);
      const correctives = await storage.getCorrectivesForAssignmentDay(
        assignmentId,
        programDayId,
      );
      res.json({ correctives });
    },
  );

  app.post(
    "/api/coach/assignments/:assignmentId/days/:programDayId/correctives/copy",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const programDayId = Number(req.params.programDayId);
      const owned = await storage.getAssignmentForCoach(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Assignment not found" });
      const schema = z.object({ targetProgramDayIds: z.array(z.number()).min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      await storage.copyCorrectivesToDays(
        assignmentId,
        programDayId,
        parsed.data.targetProgramDayIds,
      );
      res.status(204).end();
    },
  );

  app.post(
    "/api/coach/assignments/:assignmentId/correctives/apply",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const owned = await storage.getAssignmentForCoach(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Assignment not found" });
      const parsed = applyCorrectivesToDaysSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      await storage.applyCorrectivesToDays(
        assignmentId,
        parsed.data.programDayIds,
        parsed.data.correctives,
      );
      res.status(204).end();
    },
  );

  app.get(
    "/api/coach/athletes/:athleteId/recent-correctives",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const recent = await storage.getRecentCorrectivesForAthlete(user.id, athleteId);
      res.json(recent);
    },
  );

  app.get(
    "/api/coach/assignments/:assignmentId/days/:programDayId/comments",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const programDayId = Number(req.params.programDayId);
      const owned = await storage.getAssignmentForCoach(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Assignment not found" });
      const comments = await storage.getWorkoutComments(assignmentId, programDayId);
      res.json(comments);
    },
  );

  app.post(
    "/api/coach/assignments/:assignmentId/days/:programDayId/comments",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const programDayId = Number(req.params.programDayId);
      const owned = await storage.getAssignmentForCoach(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Assignment not found" });
      const parsed = createWorkoutCommentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const comment = await storage.addWorkoutComment(
        assignmentId,
        programDayId,
        user.id,
        parsed.data,
      );
      res.status(201).json(comment);
    },
  );

  // Coach draws on a paused frame of an athlete's video, client-side canvas
  // produces a PNG data URL, decoded and written to disk here -- the
  // resulting /uploads/annotations/... URL is then posted as imageUrl on a
  // normal comment via the route above.
  app.post("/api/coach/annotations", requireRole("coach"), (req, res) => {
    const parsed = createAnnotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const base64 = parsed.data.dataUrl.slice(parsed.data.dataUrl.indexOf(",") + 1);
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > MAX_ANNOTATION_BYTES) {
      return res.status(400).json({ message: "Annotation image is too large" });
    }
    const filename = `${crypto.randomUUID()}.png`;
    fs.writeFileSync(path.join(ANNOTATIONS_DIR, filename), buffer);
    res.status(201).json({ url: `/uploads/annotations/${filename}` });
  });

  // ---------------- Coach: Analytics ----------------
  // Coach-only performance history (weight, PRs, velocity, bar path,
  // whatever was recorded) derived from an athlete's logged sets. Athletes
  // never get an equivalent page -- they only see live numbers during
  // their own set.

  app.get("/api/coach/analytics/exercises", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ athleteId: z.coerce.number() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "athleteId query param required" });
    }
    const list = await storage.getExercisesWithHistoryForAthlete(user.id, parsed.data.athleteId);
    res.json(list);
  });

  app.get("/api/coach/analytics/overview", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ athleteId: z.coerce.number() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "athleteId query param required" });
    }
    const sessions = await storage.getRecentSessionsForAthlete(user.id, parsed.data.athleteId);
    res.json(sessions);
  });

  app.get("/api/coach/analytics", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = coachAnalyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "athleteId and exerciseId query params required" });
    }
    const points = await storage.getExerciseAnalyticsForCoach(
      user.id,
      parsed.data.athleteId,
      parsed.data.exerciseId,
    );
    res.json(points);
  });

  // ---------------- Coach: Leaderboard ----------------
  // Coach-only, ranks every athlete on the roster (never other coaches'
  // athletes) by their best estimated 1RM for a chosen exercise.

  app.get("/api/coach/leaderboard/exercises", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getLeaderboardExercisesForCoach(user.id);
    res.json(list);
  });

  app.get("/api/coach/leaderboard", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ exerciseId: z.coerce.number() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "exerciseId query param required" });
    }
    const rows = await storage.getLeaderboardForExercise(user.id, parsed.data.exerciseId);
    res.json(rows);
  });

  // ---------------- Athlete ----------------

  app.get("/api/athlete/coaches", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coaches = await storage.getCoachesForAthlete(user.id);
    res.json(coaches);
  });

  app.patch("/api/athlete/preferences", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateUserPreferences(user.id, parsed.data);
    const { passwordHash, healthStatus, ...publicUser } = updated;
    res.json(publicUser);
  });

  app.patch("/api/athlete/profile", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateUserProfile(user.id, parsed.data);
    const { passwordHash, healthStatus, ...publicUser } = updated;
    res.json(publicUser);
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

  app.get("/api/athlete/calendar-link", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const token = await storage.getOrCreateCalendarToken(user.id);
    res.json({ token });
  });

  app.get("/api/athlete/progress", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const summary = await storage.getAthleteProgressSummary(user.id);
    const streak = await storage.getStreakForAthlete(user.id);
    res.json({ ...summary, ...streak });
  });

  app.get("/api/athlete/body-metrics", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const entries = await storage.getBodyMetricsForAthlete(user.id);
    res.json(entries);
  });

  app.post("/api/athlete/body-metrics", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = createBodyMetricSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const entry = await storage.createBodyMetric(user.id, parsed.data);
    res.status(201).json(entry);
  });

  app.delete("/api/athlete/body-metrics/:id", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    await storage.deleteBodyMetric(user.id, Number(req.params.id));
    res.status(204).end();
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

  // Athlete-initiated only: recorded and previewed client-side, uploaded
  // here solely when the athlete taps Save. A discarded clip never reaches
  // this route at all.
  app.post(
    "/api/athlete/form-video",
    requireRole("athlete"),
    (req, res) => {
      uploadFormVideo.single("video")(req, res, (err: unknown) => {
        if (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          return res.status(400).json({ message });
        }
        if (!req.file) {
          return res.status(400).json({ message: "No video file provided" });
        }
        res.status(201).json({ url: `/uploads/form-videos/${req.file.filename}` });
      });
    },
  );

  app.get(
    "/api/athlete/assignments/:assignmentId/days/:programDayId/comments",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const programDayId = Number(req.params.programDayId);
      const owned = await storage.getAssignmentForAthlete(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Assignment not found" });
      const comments = await storage.getWorkoutComments(assignmentId, programDayId);
      res.json(comments);
    },
  );

  app.post(
    "/api/athlete/assignments/:assignmentId/days/:programDayId/comments",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const programDayId = Number(req.params.programDayId);
      const owned = await storage.getAssignmentForAthlete(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Assignment not found" });
      const parsed = createWorkoutCommentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const comment = await storage.addWorkoutComment(
        assignmentId,
        programDayId,
        user.id,
        parsed.data,
      );

      // Only the two events the coach actually asked to hear about --
      // never for program completions or team-wide activity.
      const hasVideo = !!parsed.data.videoUrl;
      const title = hasVideo ? "New video from an athlete" : "New comment from an athlete";
      const body = `${user.name}: ${parsed.data.body}`;
      await storage.createNotification(
        owned.coachId,
        hasVideo ? "video" : "comment",
        title,
        body,
        "/coach/calendar",
      );
      await sendPushToUser(owned.coachId, { title, body, url: "/coach/calendar" });

      res.status(201).json(comment);
    },
  );

  // ---------------- Notifications ----------------
  // In-app inbox, available to any authenticated user -- in practice only
  // coaches ever have entries, since athlete comments/videos are the only
  // events that create one (see the athlete comments route above).

  app.get("/api/notifications", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getNotificationsForUser(user.id);
    res.json(list);
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const count = await storage.getUnreadNotificationCount(user.id);
    res.json({ count });
  });

  app.post("/api/notifications/read", requireAuth, async (req, res) => {
    const user = currentUser(req);
    await storage.markAllNotificationsRead(user.id);
    res.status(204).end();
  });

  app.patch("/api/notification-prefs", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const parsed = updateNotificationPrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateNotificationPrefs(user.id, parsed.data);
    const { passwordHash, healthStatus, ...publicUser } = updated;
    res.json(publicUser);
  });

  app.get("/api/push/vapid-public-key", requireAuth, async (req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const parsed = pushSubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.savePushSubscription(user.id, parsed.data.endpoint, parsed.data.keys);
    res.status(204).end();
  });

  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    const schema = z.object({ endpoint: z.string().url() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.removePushSubscription(parsed.data.endpoint);
    res.status(204).end();
  });

  const httpServer = createServer(app);
  return httpServer;
}
