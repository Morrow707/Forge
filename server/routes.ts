import express, { type Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { setupAuth, requireAuth, requireRole } from "./auth";
import { hashPassword, comparePasswords } from "./auth-utils";
import { storage } from "./storage";
import { buildIcsFeed } from "./ics";
import { getVapidPublicKey } from "./push";
import { scheduleRestOverPush, cancelRestOverPush } from "./rest-timer-push";
import { sendEmail } from "./email";
import { buildProgressReportEmail } from "./progress-report";
import { buildRecruitingProfilePdf } from "./recruiting-profile";
import { buildTrainingHistoryCsv, buildTrainingHistoryPdf } from "./training-history-export";
import { notifyUser } from "./notify";
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
  updateBrandingSchema,
  updateTeamBrandingSchema,
  updateStaffTitleSchema,
  updateNavPrefsSchema,
  updateAccountNameSchema,
  updateAccountEmailSchema,
  updateAccountPasswordSchema,
  updatePersonalAccentSchema,
  createBodyMetricSchema,
  createAnnotationSchema,
  testingTrendsQuerySchema,
  createGoalSchema,
  suggestGoalTargetSchema,
  sendChatMessageSchema,
  generateProgramDraftSchema,
  submitWellnessCheckinSchema,
  sendProgramChatMessageSchema,
  sendAiKnowledgeChatMessageSchema,
  applyKnowledgeProposalSchema,
  substituteExerciseSchema,
  formFaultSchema,
  updateNutritionTargetsSchema,
  createFoodLogEntrySchema,
  logCaraActivitySchema,
  setCaraCapSchema,
  createTeamChallengeSchema,
  createTeamGameDaySchema,
} from "@shared/schema";
import { widgetLayoutSchema } from "@shared/dashboard-widgets";
import { computeReadiness } from "@shared/wellness";
import { z } from "zod";
import { startOfWeek, addWeeks } from "date-fns";

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

// Branding logos -- raster only (PNG/JPEG/WebP), deliberately no SVG:
// keeps every consumer (the CSS background-image preview, the browser tab
// favicon swap) working from one predictable, already-rasterized format
// instead of needing an SVG-to-raster fallback path for the favicon case.
const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const ORG_LOGO_DIR = path.join(process.cwd(), "server", "uploads", "team-logos");
fs.mkdirSync(ORG_LOGO_DIR, { recursive: true });
const TEAM_LOGO_DIR = path.join(process.cwd(), "server", "uploads", "team-branding");
fs.mkdirSync(TEAM_LOGO_DIR, { recursive: true });

function makeLogoUpload(dir: string) {
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        cb(null, `${crypto.randomUUID()}${IMAGE_EXTENSION_BY_MIME[file.mimetype] ?? ""}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!IMAGE_EXTENSION_BY_MIME[file.mimetype]) {
        return cb(new Error("Unsupported image format -- use PNG, JPEG, or WebP"));
      }
      cb(null, true);
    },
  });
}
const uploadOrgLogo = makeLogoUpload(ORG_LOGO_DIR);
const uploadTeamLogo = makeLogoUpload(TEAM_LOGO_DIR);

function currentUser(req: any) {
  return req.user as { id: number; role: "coach" | "athlete" | "admin"; name: string; email: string };
}

// Org-wide identity (branding, nav customization) is a whole-program
// decision, not day-to-day operational data like the roster/programs/
// exercises the rest of getEffectiveCoachIds widens to every staff
// member -- gated to specifically the primary coach so an assistant
// can't repaint the whole program's colors or hide tabs for everyone.
async function requirePrimaryCoach(req: any, res: any, next: any) {
  const user = currentUser(req);
  const coachIds = await storage.getEffectiveCoachIds(user.id);
  if (coachIds[0] !== user.id) {
    return res.status(403).json({ message: "Only the primary coach can change this" });
  }
  next();
}

// The single gate for every Free Agent AI route below (program building AND
// the general AI chat coach) -- true iff this athlete currently has zero
// coaches. Once they join a team, the coach is their guidance now, not the
// AI -- this rejects rather than just hiding a nav link client-side, so a
// stale bookmark/tab open from before they joined a coach can't keep using
// it. This is also exactly where a future paywall plugs in (isFreeAgent &&
// hasPaid) without touching any of the routes that call it.
async function requireFreeAgent(req: any, res: any, next: any) {
  const user = currentUser(req);
  const coaches = await storage.getCoachesForAthlete(user.id);
  if (coaches.length > 0) {
    return res
      .status(403)
      .json({ message: "This AI feature is only available while you don't have a coach yet." });
  }
  next();
}

// The seeded demo Free Agent account (see server/seed.ts) is the one
// deliberate exception to the paywall below -- it's used for demoing/
// testing the full Free Agent AI experience without real billing existing
// yet, so it's treated as permanently "paid." No other account gets this.
const COMPED_FREE_AGENT_EMAILS = new Set(["freeagent@forge.app"]);

// The future paywall requireFreeAgent's own comment anticipates: nothing
// sets this true yet (no billing exists), so every route gated behind it is
// a hard block for a Free Agent until that's built -- change only this
// function once real billing exists. Exercise substitution is deliberately
// never gated by this (see the swap-exercise routes below) so a Free Agent
// keeps that one AI feature even while everything else here is paywalled.
async function hasAthletePaidForAiAccess(_athleteId: number, email: string): Promise<boolean> {
  return COMPED_FREE_AGENT_EMAILS.has(email);
}

// Gates the "full function" AI features (program builder chat/draft, AI
// form-check, the general AI chat coach) for a Free Agent specifically.
// Only meaningful stacked after requireFreeAgent, which already guarantees
// the caller has zero coaches by the time this runs -- a coached athlete
// never reaches this paywall at all, they're already rejected upstream.
async function requirePaidAiAccess(req: any, res: any, next: any) {
  const user = currentUser(req);
  const hasPaid = await hasAthletePaidForAiAccess(user.id, user.email);
  if (!hasPaid) {
    return res.status(402).json({
      message:
        "This AI feature is a paid upgrade for Free Agents, coming soon -- exercise substitution stays free in the meantime.",
      freeAgentPaywall: true,
    });
  }
  next();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Allows any coach on the same staff (see coachStaff / getEffectiveCoachIds
// in storage.ts) to edit content created by a staff-mate, not just the
// exact account that created it. A no-op widening for admins/solo coaches,
// who have no staff.
async function assertOwnsExercise(userId: number, exerciseId: number) {
  const exercise = await storage.getExercise(exerciseId);
  if (!exercise) return null;
  const coachIds = await storage.getEffectiveCoachIds(userId);
  if (!coachIds.includes(exercise.coachId)) return null;
  return exercise;
}

async function assertCoachOwnsProgram(coachId: number, programId: number) {
  const program = await storage.getProgramFull(programId);
  if (!program) return null;
  const coachIds = await storage.getEffectiveCoachIds(coachId);
  if (!coachIds.includes(program.coachId)) return null;
  return program;
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);
  app.use("/uploads", express.static(path.join(process.cwd(), "server", "uploads")));

  // ---------------- Public calendar subscribe feed ----------------
  // Deliberately unauthenticated: calendar apps (Google/Apple/Outlook)
  // re-fetch a plain URL on their own schedule and can't carry a session
  // cookie, so access control here is "possession of the unguessable
  // token" rather than a login. Only ever resolves to someone's own
  // training days -- never rest days, to keep a subscribed calendar from
  // filling up with noise. Admins get this too since they can self-assign
  // programs to their own calendar (see /api/admin/my/*); coaches never
  // train off their own calendar, so they're not included.
  app.get("/api/calendar/:token.ics", async (req, res) => {
    const user = await storage.getUserByCalendarToken(req.params.token);
    if (!user || (user.role !== "athlete" && user.role !== "admin")) {
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
    if (!exercise || (!exercise.isForgeOfficial && !exercise.editable)) {
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

  app.post("/api/coach/exercises/:id/report", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const exercise = await storage.getExerciseDetail(id, user.id);
    if (!exercise || (!exercise.isForgeOfficial && !exercise.editable)) {
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

  // Same one-shot draft-then-review flow as /api/coach/programs/ai-draft --
  // nothing is saved here, the client POSTs the draft to /api/admin/programs
  // itself to land in the full builder before it's ever assigned to anyone.
  app.post("/api/admin/programs/ai-draft", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = generateProgramDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    // Self-service: this account is both the "coach" building it and the
    // athlete it's for, so its own profile (sport/position/age/season) is
    // exactly what the AI should read -- always safe since it's their own id.
    const draft = await storage.generateProgramDraft(user.id, parsed.data.prompt, user.id);
    res.json(draft);
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
  // Two independent feeds land here: exercise names that have caught on
  // with multiple coaches with no one nominating anything (see
  // storage.detectTrendingExercises), and coaches flagging a problem with
  // an existing Forge exercise.

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
    const updated = await storage.resolveSubmission(id, parsed.data.approve, user.id, parsed.data.name);
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

  // ---------------- Admin: My Training ----------------
  // The admin's own personal calendar, workout logging, and program
  // self-assignment -- this is the trusted admin account training itself,
  // reusing the exact same role-agnostic storage functions the athlete
  // routes use. Deliberately excludes coach-athlete-only concepts that
  // don't apply here: no comment thread, no wellness/readiness gate.

  app.get("/api/admin/my/calendar", requireRole("admin"), async (req, res) => {
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

  app.get("/api/admin/my/calendar-link", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const token = await storage.getOrCreateCalendarToken(user.id);
    res.json({ token });
  });

  app.get("/api/admin/my/day", requireRole("admin"), async (req, res) => {
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

  app.post("/api/admin/my/log", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = submitWorkoutLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const log = await storage.submitWorkoutLog(user.id, parsed.data);
    res.status(200).json(log);
  });

  app.patch("/api/admin/my/preferences", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateUserPreferences(user.id, parsed.data);
    const { passwordHash, healthStatus, ...publicUser } = updated;
    res.json(publicUser);
  });

  // Platform-wide, anonymized -- see buildPlatformTrends in storage.ts for
  // the actual aggregation and its k-anonymity floor. Never returns a name,
  // email, or athlete id; every number here is a group average or count.
  app.get("/api/admin/platform-trends", requireRole("admin"), async (_req, res) => {
    const trends = await storage.getPlatformTrends();
    res.json(trends);
  });

  // Self-assignment: coachId and athleteId are both the admin's own id.
  // Deliberately bypasses the coach roster-membership check that guards
  // /api/coach/assignments -- an admin is never on their own roster, so
  // that check would always fail here. getProgramIfUsableByCoach already
  // covers the real authorization question: their own program, or any
  // Forge-official one.
  app.post("/api/admin/my/assignments", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      programId: z.number(),
      startDate: z.string(),
      dateOverrides: z.record(z.string(), z.string()).optional(),
      correctivesEnabled: z.boolean().default(true),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const usable = await storage.getProgramIfUsableByCoach(user.id, parsed.data.programId);
    if (!usable) return res.status(404).json({ message: "Program not found" });

    const result = await storage.createAssignment(
      user.id,
      parsed.data.programId,
      [{ athleteId: user.id, correctivesEnabled: parsed.data.correctivesEnabled }],
      parsed.data.startDate,
      parsed.data.dateOverrides,
    );
    res.status(201).json(result);
  });

  // ---------------- Admin: Conversational AI program builder ----------------
  // Chat-driven program editing, scoped to the admin's own programs. Unlike
  // the coach-facing one-shot AI Assist (/api/coach/programs/ai-draft and
  // /api/admin/programs/ai-draft above, both draft-then-manual-review),
  // this auto-applies every turn -- see the storage.generateProgramFromChat
  // comment for why that's safe here.

  app.get("/api/admin/programs/:id/chat", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    const messages = await storage.getProgramChatMessages(id);
    res.json(messages);
  });

  app.post("/api/admin/programs/:id/chat", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    const parsed = sendProgramChatMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid message" });
    const result = await storage.generateProgramFromChat(id, user.id, parsed.data.content);
    res.status(201).json(result);
  });

  // Same dedicated substitution route as the athlete side below -- admin
  // has no paywall to route around, but the workout page's swap button is
  // one shared component across both roles, so it needs the same path
  // shape under both API bases.
  app.post("/api/admin/programs/:id/swap-exercise", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    const parsed = substituteExerciseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const result = await storage.substituteExercise(
      id,
      parsed.data.programExerciseId,
      user.id,
      parsed.data.reason,
      parsed.data.notes,
    );
    if ("error" in result) return res.status(422).json({ message: result.error });
    res.status(200).json(result);
  });

  // "Full function" AI form check -- see storage.submitFormCheck for why
  // this is the one place the AI critiques technique with no human review
  // step, and why that's gated on the program already being AI-authored.
  app.post("/api/admin/programs/:id/form-check", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    const schema = z.object({
      exerciseName: z.string().trim().min(1).max(200),
      images: z
        .array(
          z.object({
            mediaType: z.enum(["image/jpeg", "image/png"]),
            data: z.string().min(1),
          }),
        )
        .min(1)
        .max(6),
      // The same set's on-device pose-tracking numbers, if it was also
      // tracked with the camera -- grounds the AI's critique in real
      // geometry instead of only guessing from the frames. Optional: a
      // form-check video with no camera tracking on record still works.
      trackedMetrics: z
        .object({
          peakVelocityMps: z.number().optional().nullable(),
          meanVelocityMps: z.number().optional().nullable(),
          concentricSeconds: z.number().optional().nullable(),
          eccentricSeconds: z.number().optional().nullable(),
          barPathDeviationCm: z.number().optional().nullable(),
          formFaults: formFaultSchema.array().optional().nullable(),
          peakPowerWatts: z.number().optional().nullable(),
          meanPowerWatts: z.number().optional().nullable(),
          eccentricMeanVelocityMps: z.number().optional().nullable(),
          romCm: z.number().optional().nullable(),
          velocityLossPercent: z.number().optional().nullable(),
        })
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const result = await storage.submitFormCheck(
      id,
      user.id,
      parsed.data.exerciseName,
      parsed.data.images,
      parsed.data.trackedMetrics,
    );
    if (!result) return res.status(400).json({ message: "This program isn't AI-authored yet" });
    res.status(201).json(result);
  });

  // Admin teaches the AI program builder general programming knowledge
  // (exercise sequencing, fatigue management, etc.) through its own chat,
  // separate from editing any one program. Global and platform-wide -- see
  // storage.getAiKnowledgeGuidelines, which every program-generation prompt
  // reads and applies for every coach and athlete, not just the admin.
  app.get("/api/admin/ai-knowledge", requireRole("admin"), async (_req, res) => {
    const result = await storage.getAiKnowledgeChat();
    res.json(result);
  });

  app.post("/api/admin/ai-knowledge/chat", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = sendAiKnowledgeChatMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid message" });
    const result = await storage.updateAiKnowledgeFromChat(user.id, parsed.data.content);
    res.status(201).json(result);
  });

  // Commits a guidelines rewrite the chat above proposed -- the admin has
  // seen the diff client-side and is choosing to apply it. Nothing reaches
  // aiKnowledge (read platform-wide by every program-generation prompt)
  // without this explicit step.
  app.post("/api/admin/ai-knowledge/apply", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = applyKnowledgeProposalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid guidelines" });
    const result = await storage.applyAiKnowledgeProposal(user.id, parsed.data.guidelines);
    res.status(201).json(result);
  });

  // Same admin-teaching pattern, for the nutrition education AI
  // (answerNutritionQuestion) instead of the program builder -- see
  // storage.getNutritionKnowledgeGuidelines, read by every nutrition Q&A
  // answer platform-wide.
  app.get("/api/admin/nutrition-knowledge", requireRole("admin"), async (_req, res) => {
    const result = await storage.getNutritionKnowledgeChat();
    res.json(result);
  });

  app.post("/api/admin/nutrition-knowledge/chat", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = sendAiKnowledgeChatMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid message" });
    const result = await storage.updateNutritionKnowledgeFromChat(user.id, parsed.data.content);
    res.status(201).json(result);
  });

  // Commits a guidelines rewrite the chat above proposed -- see the ai-knowledge
  // apply route's comment; same pattern, for nutritionKnowledge instead.
  app.post("/api/admin/nutrition-knowledge/apply", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = applyKnowledgeProposalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid guidelines" });
    const result = await storage.applyNutritionKnowledgeProposal(user.id, parsed.data.guidelines);
    res.status(201).json(result);
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

  // Returns a draft only -- nothing is saved here. The client POSTs the
  // draft to /api/coach/programs itself (same as "Create & Build" or
  // "Duplicate"), landing the coach in the full builder to review and edit
  // before it's ever assigned to an athlete.
  app.post("/api/coach/programs/ai-draft", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = generateProgramDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    // athleteId is optional and only ever read from inside generateProgramDraft
    // if it's the caller's own id or a real roster relationship -- an
    // unrelated id just falls back to no profile, never an error, since
    // this is best-effort personalization, not an authorization boundary
    // guarding sensitive data.
    const draft = await storage.generateProgramDraft(
      user.id,
      parsed.data.prompt,
      parsed.data.athleteId,
    );
    res.json(draft);
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

  // Conversational AI program builder, coach-side -- same auto-applies-every-
  // turn behavior as the admin/Free-Agent chat above (see
  // storage.generateProgramFromChat), now available while actively editing
  // one of the coach's own programs, not just the one-shot draft-then-review
  // AI Assist on the programs list. A coach editing a program already
  // assigned to real athletes has this exact same blast radius with their
  // own manual edits + Save Program already, so the AI applying a turn
  // in-place isn't a new category of risk -- it's the same program, same
  // ownership check, just edited by chat instead of by hand.
  app.get("/api/coach/programs/:id/chat", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    const messages = await storage.getProgramChatMessages(id);
    res.json(messages);
  });

  app.post("/api/coach/programs/:id/chat", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    const parsed = sendProgramChatMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid message" });
    const result = await storage.generateProgramFromChat(id, user.id, parsed.data.content, false);
    res.status(201).json(result);
  });

  app.delete("/api/coach/programs/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    await storage.deleteProgram(id);
    res.status(204).end();
  });

  // ---------------- Coach: Coaching Staff ----------------
  // Lets a program run with more than one coach account sharing full
  // access to the same roster/teams/programs/exercises/analytics -- built
  // for a real coaching staff (assistant/position coaches), not just a
  // solo coach. See coachStaff in shared/schema.ts and getEffectiveCoachIds
  // in storage.ts for how membership propagates everywhere else.

  app.get("/api/coach/staff", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const result = await storage.getStaffForCoach(user.id);
    res.json(result);
  });

  // Public-facing (within the coach's own org) roster info for the About
  // page -- name/title only, safe for the whole staff to read.
  app.get("/api/coach/team-roster", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    const roster = await storage.getTeamRosterInfo(coachIds[0]);
    res.json(roster);
  });

  app.post("/api/coach/staff/join", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ code: z.string().trim().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invite code required" });
    }
    const joined = await storage.joinCoachStaffByCode(user.id, parsed.data.code);
    if (!joined) {
      return res.status(400).json({
        message:
          "Invalid code, that's your own code, or your account already has its own staff -- leave it first to join another.",
      });
    }
    res.status(201).json({ joined: true });
  });

  app.delete("/api/coach/staff/:staffCoachId", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    await storage.removeCoachStaff(user.id, Number(req.params.staffCoachId));
    res.status(204).end();
  });

  app.post("/api/coach/staff/leave", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    await storage.leaveCoachStaff(user.id);
    res.status(204).end();
  });

  app.patch("/api/coach/staff/:staffCoachId/title", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = updateStaffTitleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.setStaffTitle(
      user.id,
      Number(req.params.staffCoachId),
      parsed.data.staffTitle ?? null,
    );
    if (!updated) {
      return res.status(404).json({ message: "Not a member of your staff" });
    }
    res.json({ staffTitle: updated.staffTitle });
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

  // Coach-set macro/micro targets -- deliberately unfettered (no AI, no
  // paywall) since a real college program has an actual RD backing these
  // numbers; the coach is just entering that plan, not the app generating
  // one. Same roster-membership gate as every other roster sub-resource.
  app.get(
    "/api/coach/roster/:athleteId/nutrition",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const targets = await storage.getNutritionTargetsForAthlete(athleteId);
      res.json(targets ?? null);
    },
  );

  app.patch(
    "/api/coach/roster/:athleteId/nutrition",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const parsed = updateNutritionTargetsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const targets = await storage.upsertNutritionTargets(athleteId, user.id, parsed.data);
      res.json(targets);
    },
  );

  // Read-only view of what the athlete has actually logged against the
  // targets above -- same roster-membership gate, no write access (a coach
  // never edits an athlete's food log, only the athlete does).
  app.get(
    "/api/coach/roster/:athleteId/food-log",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const date = typeof req.query.date === "string" ? req.query.date : todayIso();
      const result = await storage.getFoodLogForDate(athleteId, date);
      res.json(result);
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

  // Snapshots are written automatically whenever a coach changes a testing
  // field via the profile-edit routes above -- this is read-only.
  app.get(
    "/api/coach/roster/:athleteId/testing-history",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const history = await storage.getTestingHistoryForAthlete(athleteId);
      res.json(history);
    },
  );

  app.get("/api/coach/testing-trends", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = testingTrendsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "metric query param required" });
    }
    const points = await storage.getTeamTestingTrends(user.id, parsed.data.metric);
    res.json(points);
  });

  // Coach-initiated only -- there is no automatic/scheduled version of this,
  // by design. Silently no-ops server-side (via sendEmail) if RESEND_API_KEY
  // hasn't been set up yet, same graceful-degrade pattern as web push.
  app.post(
    "/api/coach/roster/:athleteId/progress-report",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const athlete = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!athlete) return res.status(404).json({ message: "Athlete not found" });

      const [summary, streak] = await Promise.all([
        storage.getAthleteProgressSummary(athleteId),
        storage.getStreakForAthlete(athleteId),
      ]);
      const html = buildProgressReportEmail(athlete, user.name, summary, streak);
      const result = await sendEmail({
        to: athlete.email,
        subject: "Your Progress Report from Forge",
        html,
      });
      res.json(result);
    },
  );

  // No public hosting -- the PDF is generated on demand and streamed straight
  // to the requester, who downloads or shares it themselves.
  app.get(
    "/api/coach/roster/:athleteId/recruiting-profile.pdf",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const athlete = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!athlete) return res.status(404).json({ message: "Athlete not found" });

      const summary = await storage.getAthleteProgressSummary(athleteId);
      const pdf = await buildRecruitingProfilePdf(athlete, summary);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${athlete.name.replace(/[^a-z0-9]+/gi, "-")}-recruiting-profile.pdf"`,
      );
      res.send(pdf);
    },
  );

  app.get(
    "/api/coach/roster/:athleteId/training-history.csv",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const athlete = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!athlete) return res.status(404).json({ message: "Athlete not found" });

      const rows = await storage.getFullTrainingHistoryForAthlete(athleteId);
      const csv = buildTrainingHistoryCsv(rows);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${athlete.name.replace(/[^a-z0-9]+/gi, "-")}-training-history.csv"`,
      );
      res.send(csv);
    },
  );

  app.get(
    "/api/coach/roster/:athleteId/training-history.pdf",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const athlete = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!athlete) return res.status(404).json({ message: "Athlete not found" });

      const rows = await storage.getFullTrainingHistoryForAthlete(athleteId);
      const pdf = await buildTrainingHistoryPdf(athlete.name, rows);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${athlete.name.replace(/[^a-z0-9]+/gi, "-")}-training-history.pdf"`,
      );
      res.send(pdf);
    },
  );

  app.get("/api/coach/roster/:athleteId/goals", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = Number(req.params.athleteId);
    const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
    if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
    const list = await storage.getGoalsForAthlete(athleteId);
    res.json(list);
  });

  app.post("/api/coach/roster/:athleteId/goals", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = Number(req.params.athleteId);
    const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
    if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
    const parsed = createGoalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const goal = await storage.createGoal(athleteId, user.id, parsed.data);
    res.status(201).json(goal);
  });

  // AI-suggested target, grounded in the athlete's own historical trend --
  // returns null (not an error) if there's no history to extrapolate from
  // yet or AI isn't configured, so the form just shows no suggestion.
  app.post(
    "/api/coach/roster/:athleteId/goals/suggest",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const parsed = suggestGoalTargetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const suggestion = await storage.suggestGoalTarget(
        athleteId,
        parsed.data.type === "exercise"
          ? { type: "exercise", exerciseId: parsed.data.exerciseId! }
          : { type: "testing", testingMetric: parsed.data.testingMetric! },
      );
      res.json(suggestion);
    },
  );

  app.delete(
    "/api/coach/roster/:athleteId/goals/:goalId",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      await storage.deleteGoal(athleteId, Number(req.params.goalId));
      res.status(204).end();
    },
  );

  // Today's readiness snapshot for the whole roster -- athletes with no
  // check-in yet for today are simply absent, not shown as "flagged".
  app.get("/api/coach/roster-wellness", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const rows = await storage.getRosterWellnessToday(user.id, todayIso());
    res.json(rows.map((r) => ({ ...r, ...computeReadiness(r) })));
  });

  // ---------- CARA (countable athletically-related activity) compliance ----------
  // Opt-in per coach (see caraWeeklyCapMinutes) -- most coaches never touch
  // any of this.

  app.get("/api/coach/cara/settings", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const capMinutes = await storage.getCaraCapMinutesForCoach(user.id);
    res.json({ capMinutes });
  });

  app.post("/api/coach/cara/settings", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = setCaraCapSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const row = await storage.setCaraCapMinutesForCoach(user.id, parsed.data.capMinutes);
    res.json({ capMinutes: row.caraWeeklyCapMinutes ?? null });
  });

  app.get("/api/coach/cara/compliance", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const weekStart = startOfWeek(new Date());
    const weekEnd = addWeeks(weekStart, 1);
    const report = await storage.getCaraComplianceForCoach(user.id, weekStart, weekEnd);
    res.json(report ?? { capMinutes: null, athletes: [] });
  });

  app.get(
    "/api/coach/cara/:athleteId/history",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const weekStart = startOfWeek(new Date());
      const weekEnd = addWeeks(weekStart, 1);
      const sessions = await storage.getCaraSessionsForAthlete(athleteId, weekStart, weekEnd);
      res.json(sessions);
    },
  );

  app.post("/api/coach/cara/manual-log", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = logCaraActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const onRoster = await storage.getRosterAthleteForCoach(user.id, parsed.data.athleteId);
    if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
    const startedAt = new Date(parsed.data.startedAt);
    const endedAt = new Date(parsed.data.endedAt);
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt <= startedAt) {
      return res.status(400).json({ message: "Invalid start/end time" });
    }
    const session = await storage.logManualCaraActivity(user.id, {
      athleteId: parsed.data.athleteId,
      activityType: parsed.data.activityType,
      startedAt,
      endedAt,
      note: parsed.data.note,
    });
    res.status(201).json(session);
  });

  app.get(
    "/api/coach/roster/:athleteId/wellness-history",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const history = await storage.getWellnessHistoryForAthlete(athleteId);
      res.json(history.map((h) => ({ ...h, ...computeReadiness(h) })));
    },
  );

  app.get(
    "/api/coach/roster/:athleteId/trophies",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const trophies = await storage.getTrophiesForAthlete(athleteId);
      res.json(trophies);
    },
  );

  // Current acute:chronic workload ratio for every roster athlete with any
  // logged training in the last 28 days -- an athlete with nothing logged
  // is simply absent, same "absent means no data yet" convention as
  // roster-wellness above, not shown as flagged.
  app.get("/api/coach/roster-acwr", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const rows = await storage.getRosterAcwrSummary(user.id);
    res.json(rows);
  });

  app.get(
    "/api/coach/roster/:athleteId/acwr-history",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const history = await storage.getAcwrHistoryForAthlete(athleteId);
      res.json(history);
    },
  );

  app.get(
    "/api/coach/roster/:athleteId/weekly-load",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const series = await storage.getWeeklyLoadForAthlete(user.id, athleteId);
      res.json(series);
    },
  );

  app.get(
    "/api/coach/roster/:athleteId/muscle-load",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const schema = z.object({ days: z.coerce.number().min(1).max(180).optional() });
      const parsed = schema.safeParse(req.query);
      const tally = await storage.getMuscleLoadForAthlete(
        user.id,
        athleteId,
        parsed.success ? parsed.data.days : undefined,
      );
      res.json(tally);
    },
  );

  // Read-only -- the AI chat coach is never a private, unsupervised channel:
  // a coach can always read the full transcript of any athlete on their
  // roster, the same way they can read workout comments.
  app.get("/api/coach/roster/:athleteId/chat", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = Number(req.params.athleteId);
    const messages = await storage.getChatMessagesForCoachAthlete(user.id, athleteId);
    if (messages === null) return res.status(404).json({ message: "Athlete not found" });
    res.json(messages);
  });

  // Same isolation + weekly-cache pattern as /api/athlete/digest -- its own
  // lazily-fetched endpoint so a slow/unconfigured AI call never blocks the
  // coach dashboard, and only ever generates (and notifies) once per coach
  // per week.
  app.get("/api/coach/digest", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const { digest, isNew } = await storage.getOrCreateCoachDigest(user.id);
    if (isNew && digest) {
      await notifyUser(
        user.id,
        "digest",
        "Your Weekly Roster Summary",
        digest.digest,
        "/coach/roster",
      );
    }
    res.json(digest ? { digest: digest.digest } : null);
  });

  // Lazily computed on each request (no background job) -- see
  // getInactiveAthletesForCoach for how lastActivityAt + last workout log
  // date are combined into a single staleness signal per athlete.
  app.get("/api/coach/inactive-athletes", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const inactive = await storage.getInactiveAthletesForCoach(user.id);
    res.json(inactive);
  });

  app.post(
    "/api/coach/roster/:athleteId/nudge",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const athlete = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!athlete) return res.status(404).json({ message: "Athlete not found" });

      await notifyUser(
        athleteId,
        "reengagement",
        `${user.name} misses you at training`,
        `It's been a few days since your last session. Hop back in whenever you're ready -- your coach is cheering you on.`,
        "/athlete",
      );
      res.status(204).end();
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

  // assertOwnsTeam guards all three routes below -- none of them previously
  // checked that :id was a team the calling coach (or their staff) actually
  // owns, so any authenticated coach could add/remove members on, or
  // delete, another coach's team just by guessing/incrementing the id.
  // getTeamsForCoach is already staff-widened, so this covers assistant
  // coaches for free.
  async function assertOwnsTeam(coachId: number, teamId: number) {
    const teams = await storage.getTeamsForCoach(coachId);
    return teams.some((t) => t.id === teamId);
  }

  app.post("/api/coach/teams/:id/members", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const teamId = Number(req.params.id);
    if (!(await assertOwnsTeam(user.id, teamId))) {
      return res.status(404).json({ message: "Team not found" });
    }
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
      const user = currentUser(req);
      const teamId = Number(req.params.id);
      const athleteId = Number(req.params.athleteId);
      if (!(await assertOwnsTeam(user.id, teamId))) {
        return res.status(404).json({ message: "Team not found" });
      }
      await storage.removeAthleteFromTeam(teamId, athleteId);
      res.status(204).end();
    },
  );

  app.delete("/api/coach/teams/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const teamId = Number(req.params.id);
    if (!(await assertOwnsTeam(user.id, teamId))) {
      return res.status(404).json({ message: "Team not found" });
    }
    await storage.deleteTeam(teamId);
    res.status(204).end();
  });

  // Per-team override of the org's branding (see the org-wide routes
  // under "Branding & personalization" below) -- a team can override just
  // its colors, just its logo, or both, and falls back to the org's own
  // values field-by-field for whatever it doesn't set.
  app.patch("/api/coach/teams/:id/branding", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const teamId = Number(req.params.id);
    if (!(await assertOwnsTeam(user.id, teamId))) {
      return res.status(404).json({ message: "Team not found" });
    }
    const parsed = updateTeamBrandingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateTeamBranding(teamId, parsed.data);
    res.json(updated);
  });

  app.post(
    "/api/coach/teams/:id/branding/logo",
    requireRole("coach"),
    uploadTeamLogo.single("logo"),
    async (req, res) => {
      const user = currentUser(req);
      const teamId = Number(req.params.id);
      if (!(await assertOwnsTeam(user.id, teamId))) {
        return res.status(404).json({ message: "Team not found" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const logoUrl = `/uploads/team-branding/${req.file.filename}`;
      const updated = await storage.updateTeamLogo(teamId, logoUrl);
      res.json(updated);
    },
  );

  app.delete("/api/coach/teams/:id/branding/logo", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const teamId = Number(req.params.id);
    if (!(await assertOwnsTeam(user.id, teamId))) {
      return res.status(404).json({ message: "Team not found" });
    }
    const updated = await storage.updateTeamLogo(teamId, null);
    res.json(updated);
  });

  // ---------------- Coach & Athlete: Team challenges (squad quests) ----------------
  // Team-scoped, not individual -- the whole roster on a team pools its
  // effort toward one shared number, sitting alongside (not replacing) the
  // existing per-athlete leaderboard.

  app.get("/api/coach/team-challenges", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const challenges = await storage.getTeamChallengesForCoach(user.id);
    const withProgress = await Promise.all(
      challenges.map(async (c) => ({ ...c, progress: await storage.computeTeamChallengeProgress(c) })),
    );
    res.json(withProgress);
  });

  app.post("/api/coach/teams/:id/challenges", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const teamId = Number(req.params.id);
    if (!(await assertOwnsTeam(user.id, teamId))) {
      return res.status(404).json({ message: "Team not found" });
    }
    const parsed = createTeamChallengeSchema.safeParse({ ...req.body, teamId });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const challenge = await storage.createTeamChallenge({
      teamId,
      title: parsed.data.title,
      metric: parsed.data.metric,
      targetValue: parsed.data.targetValue ?? null,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });
    res.status(201).json(challenge);
  });

  app.delete("/api/coach/team-challenges/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const challengeId = Number(req.params.id);
    const challenge = await storage.getTeamChallengeById(challengeId);
    if (!challenge || !(await assertOwnsTeam(user.id, challenge.teamId))) {
      return res.status(404).json({ message: "Challenge not found" });
    }
    await storage.deleteTeamChallenge(challengeId);
    res.status(204).end();
  });

  app.get("/api/athlete/team-challenges", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const challenges = await storage.getTeamChallengesForAthlete(user.id);
    const withProgress = await Promise.all(
      challenges.map(async (c) => ({ ...c, progress: await storage.computeTeamChallengeProgress(c) })),
    );
    res.json(withProgress);
  });

  // ---------------- Coach: Game days + microcycle planning ----------------
  // A team's competition schedule, and a planning grid that lays out every
  // athlete's training in the window around one game day, labeled by offset
  // (GD-3, GD-1, Game Day, GD+1) -- so a coach can see the whole squad's
  // taper-in/recover-out structure at a glance instead of scanning each
  // athlete's calendar separately.

  app.get("/api/coach/team-game-days", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const gameDays = await storage.getTeamGameDaysForCoach(user.id);
    res.json(gameDays);
  });

  app.post("/api/coach/teams/:id/game-days", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const teamId = Number(req.params.id);
    if (!(await assertOwnsTeam(user.id, teamId))) {
      return res.status(404).json({ message: "Team not found" });
    }
    const parsed = createTeamGameDaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const gameDay = await storage.createTeamGameDay(
      teamId,
      parsed.data.date,
      parsed.data.opponent || null,
      parsed.data.notes || null,
    );
    res.status(201).json(gameDay);
  });

  app.delete("/api/coach/team-game-days/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const gameDayId = Number(req.params.id);
    const gameDay = await storage.getTeamGameDayById(gameDayId);
    if (!gameDay || !(await assertOwnsTeam(user.id, gameDay.teamId))) {
      return res.status(404).json({ message: "Game day not found" });
    }
    await storage.deleteTeamGameDay(gameDayId);
    res.status(204).end();
  });

  app.get(
    "/api/coach/teams/:id/game-days/:gameDayId/microcycle",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const teamId = Number(req.params.id);
      const gameDayId = Number(req.params.gameDayId);
      if (!(await assertOwnsTeam(user.id, teamId))) {
        return res.status(404).json({ message: "Team not found" });
      }
      const querySchema = z.object({
        daysBefore: z.coerce.number().int().min(0).max(13).optional(),
        daysAfter: z.coerce.number().int().min(0).max(6).optional(),
      });
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const plan = await storage.getMicrocyclePlanForTeam(
        user.id,
        teamId,
        gameDayId,
        parsed.data.daysBefore,
        parsed.data.daysAfter,
      );
      if (!plan) {
        return res.status(404).json({ message: "Game day not found" });
      }
      res.json(plan);
    },
  );

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
    const post = await storage.createTeamPost(
      user.id,
      user.id,
      parsed.data.body,
      parsed.data.isAnnouncement,
    );

    // Announcements deliberately ignore each athlete's notification prefs --
    // this is the one path meant for "practice moved" style emergencies, so
    // it only fires when the coach explicitly opts a post in (default off).
    if (parsed.data.isAnnouncement) {
      const roster = await storage.getRosterForCoach(user.id);
      await Promise.all(
        roster.map((athlete) =>
          notifyUser(
            athlete.id,
            "announcement",
            `📢 Announcement from ${user.name}`,
            parsed.data.body,
            "/athlete/team-board",
            { bypassEmailPref: true },
          ),
        ),
      );
    } else {
      // Regular posts still surface in the bell/push inbox for everyone
      // else on the shared board -- just never by email, since a post here
      // is routine, not urgent, unlike an announcement.
      const roster = await storage.getRosterForCoach(user.id);
      await Promise.all(
        roster.map((athlete) =>
          notifyUser(
            athlete.id,
            "team_board",
            `New Team Board post from ${user.name}`,
            parsed.data.body,
            "/athlete/team-board",
            { skipEmail: true },
          ),
        ),
      );
    }

    res.status(201).json(post);
  });

  app.get("/api/coach/team-board/unread", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const hasUnread = await storage.getTeamBoardHasUnread(user.id, user.id);
    res.json({ hasUnread });
  });

  app.post("/api/coach/team-board/read", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    await storage.markTeamBoardRead(user.id);
    res.status(204).end();
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
    // Announcements are coach-only -- ignore the field entirely here rather
    // than trusting the client to not send it.
    const post = await storage.createTeamPost(coach.id, user.id, parsed.data.body, false);

    // Same shared-board broadcast as the coach-side route above: everyone
    // else watching this board gets a bell/push notification, never email.
    const roster = await storage.getRosterForCoach(coach.id);
    const otherRecipients = [
      { id: coach.id, link: "/coach/team-board" },
      ...roster.filter((a) => a.id !== user.id).map((a) => ({ id: a.id, link: "/athlete/team-board" })),
    ];
    await Promise.all(
      otherRecipients.map((r) =>
        notifyUser(
          r.id,
          "team_board",
          `New Team Board post from ${user.name}`,
          parsed.data.body,
          r.link,
          { skipEmail: true },
        ),
      ),
    );

    res.status(201).json(post);
  });

  app.get("/api/athlete/team-board/unread", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coaches = await storage.getCoachesForAthlete(user.id);
    const coach = coaches[0];
    if (!coach) return res.json({ hasUnread: false });
    const hasUnread = await storage.getTeamBoardHasUnread(user.id, coach.id);
    res.json({ hasUnread });
  });

  app.post("/api/athlete/team-board/read", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    await storage.markTeamBoardRead(user.id);
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

      // Symmetric with the athlete->coach direction below -- a coach's
      // reply (including a drawn video annotation, which arrives as a
      // comment with an imageUrl) should reach the athlete the same way.
      const hasVideo = !!parsed.data.videoUrl || !!parsed.data.imageUrl;
      const title = hasVideo ? "New video from your coach" : "New comment from your coach";
      const body = `${user.name}: ${parsed.data.body}`;
      await notifyUser(owned.athleteId, hasVideo ? "video" : "comment", title, body, "/athlete");

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

  app.get("/api/coach/force-velocity", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = coachAnalyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "athleteId and exerciseId query params required" });
    }
    const result = await storage.getForceVelocityProfileForAthlete(
      user.id,
      parsed.data.athleteId,
      parsed.data.exerciseId,
    );
    res.json(result);
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

  app.get("/api/athlete/team-roster", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coaches = await storage.getCoachesForAthlete(user.id);
    if (coaches.length === 0) {
      return res.json({ primaryCoachName: null, staff: [] });
    }
    const coachIds = await storage.getEffectiveCoachIds(coaches[0].id);
    const roster = await storage.getTeamRosterInfo(coachIds[0]);
    res.json(roster);
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

  // Read-only for every athlete -- whoever set these (a coach, or the
  // athlete themselves while a Free Agent) is visible to the athlete either
  // way, they just can't edit unless the PATCH route below is open to them.
  app.get("/api/athlete/nutrition", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const targets = await storage.getNutritionTargetsForAthlete(user.id);
    res.json(targets ?? null);
  });

  // Free-Agent-only self-edit: manual data entry, not an AI capability, so
  // it isn't behind requirePaidAiAccess -- a Free Agent with their own real
  // nutritionist can just use the app the same way a coached athlete's
  // coach would. Once they join a coach, this stops being reachable
  // (requireFreeAgent) and the coach's roster route above becomes the only
  // way to change it, same "hasCoach gates it, not permanent" pattern as
  // the rest of the Free Agent feature set.
  app.patch(
    "/api/athlete/nutrition",
    requireRole("athlete"),
    requireFreeAgent,
    async (req, res) => {
      const user = currentUser(req);
      const parsed = updateNutritionTargetsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const targets = await storage.upsertNutritionTargets(user.id, user.id, parsed.data);
      res.json(targets);
    },
  );

  // Food log -- every athlete, coached or Free Agent, can log what they ate
  // against the targets above. This is data entry (a barcode/name lookup is
  // just a convenience proxy to a public food database, never an AI call --
  // see server/food-lookup.ts), so unlike the nutrition Q&A below it's
  // never gated behind requireFreeAgent or requirePaidAiAccess.
  app.get("/api/athlete/food-log", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const date = typeof req.query.date === "string" ? req.query.date : todayIso();
    const result = await storage.getFoodLogForDate(user.id, date);
    res.json(result);
  });

  app.post("/api/athlete/food-log", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = createFoodLogEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const entry = await storage.addFoodLogEntry(user.id, parsed.data);
    res.status(201).json(entry);
  });

  app.delete("/api/athlete/food-log/:id", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const ok = await storage.deleteFoodLogEntry(user.id, id);
    if (!ok) return res.status(404).json({ message: "Entry not found" });
    res.status(204).end();
  });

  // Barcode/name lookups -- proxy to Open Food Facts/USDA FoodData Central
  // (see server/food-lookup.ts), not tied to any one athlete's data, so no
  // ownership check beyond being logged in as an athlete.
  app.get("/api/athlete/food/lookup-barcode", requireRole("athlete"), async (req, res) => {
    const barcode = typeof req.query.barcode === "string" ? req.query.barcode.trim() : "";
    if (!barcode) return res.status(400).json({ message: "barcode query param required" });
    const result = await storage.lookupFoodBarcode(barcode);
    if (!result) {
      return res.status(404).json({ message: "Couldn't find that product -- try search or enter it manually." });
    }
    res.json(result);
  });

  app.get("/api/athlete/food/search", requireRole("athlete"), async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) return res.status(400).json({ message: "Enter at least 2 characters" });
    const results = await storage.searchFoods(query);
    res.json(results);
  });

  // Photo-based meal logging -- the one AI-driven path in food logging (see
  // foodLogEntries' schema comment): no barcode/database entry exists for a
  // home-cooked or restaurant plate, so this is a real vision call rather
  // than a lookup. Same "every athlete, coached or Free Agent" access as the
  // rest of food logging -- not gated behind requireFreeAgent/
  // requirePaidAiAccess, since this doesn't compete with a coach's guidance
  // any more than typing in a food name does.
  app.post("/api/athlete/food/analyze-photo", requireRole("athlete"), async (req, res) => {
    const schema = z.object({
      images: z
        .array(z.object({ mediaType: z.enum(["image/jpeg", "image/png"]), data: z.string().min(1) }))
        .min(1)
        .max(2),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const result = await storage.analyzeMealPhoto(parsed.data.images);
    if ("error" in result) return res.status(422).json({ message: result.error });
    res.json(result);
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

  // Persisted, stacking achievement case -- covers what used to be three
  // separate gamification ideas (workout-count milestones, streak badges,
  // PR milestones) in one system. Lazily re-checks thresholds on every read
  // so a workout logged directly via the offline queue, or any other path
  // that doesn't go through the completion branch of /api/athlete/log,
  // still self-heals the next time the trophy case is opened.
  app.get("/api/athlete/trophies", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const trophies = await storage.getTrophiesForAthlete(user.id);
    res.json(trophies);
  });

  // Backs the "see the trend" click on an exercise in the athlete's own
  // Recent PRs list -- scoped to their own id, no athleteId to validate.
  app.get("/api/athlete/exercise-history", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ exerciseId: z.coerce.number() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "exerciseId query param required" });
    }
    const history = await storage.getExerciseHistoryForAthlete(user.id, parsed.data.exerciseId);
    res.json(history);
  });

  app.get("/api/athlete/recruiting-profile.pdf", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const [profile, summary] = await Promise.all([
      storage.getUser(user.id),
      storage.getAthleteProgressSummary(user.id),
    ]);
    const pdf = await buildRecruitingProfilePdf(profile!, summary);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${user.name.replace(/[^a-z0-9]+/gi, "-")}-recruiting-profile.pdf"`,
    );
    res.send(pdf);
  });

  app.get("/api/athlete/training-history.csv", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const rows = await storage.getFullTrainingHistoryForAthlete(user.id);
    const csv = buildTrainingHistoryCsv(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${user.name.replace(/[^a-z0-9]+/gi, "-")}-training-history.csv"`,
    );
    res.send(csv);
  });

  app.get("/api/athlete/training-history.pdf", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const rows = await storage.getFullTrainingHistoryForAthlete(user.id);
    const pdf = await buildTrainingHistoryPdf(user.name, rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${user.name.replace(/[^a-z0-9]+/gi, "-")}-training-history.pdf"`,
    );
    res.send(pdf);
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

  // Exercises this athlete actually has logged history for -- the relevant
  // picker list for "which lift is this goal about", not the full bank.
  app.get("/api/athlete/exercises-with-history", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coaches = await storage.getCoachesForAthlete(user.id);
    const coach = coaches[0];
    if (!coach) return res.json([]);
    const list = await storage.getExercisesWithHistoryForAthlete(coach.id, user.id);
    res.json(list);
  });

  app.get("/api/athlete/goals", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getGoalsForAthlete(user.id);
    res.json(list);
  });

  app.post("/api/athlete/goals/suggest", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = suggestGoalTargetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const suggestion = await storage.suggestGoalTarget(
      user.id,
      parsed.data.type === "exercise"
        ? { type: "exercise", exerciseId: parsed.data.exerciseId! }
        : { type: "testing", testingMetric: parsed.data.testingMetric! },
    );
    res.json(suggestion);
  });

  app.post("/api/athlete/goals", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = createGoalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const goal = await storage.createGoal(user.id, user.id, parsed.data);
    res.status(201).json(goal);
  });

  app.delete("/api/athlete/goals/:id", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    await storage.deleteGoal(user.id, Number(req.params.id));
    res.status(204).end();
  });

  // Once-per-day self-report -- inline and always editable on the
  // athlete's training day page, not a blocking gate.
  app.get("/api/athlete/wellness/today", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const checkin = await storage.getWellnessCheckin(user.id, todayIso());
    res.json(checkin ?? null);
  });

  app.post("/api/athlete/wellness", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = submitWellnessCheckinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    // Only the very first submission of the day should start a CARA
    // session -- re-editing an already-submitted check-in later (an
    // athlete correcting their sleep number after the fact) must never
    // spin up a second training-time timer.
    const isFirstSubmissionToday = !(await storage.getWellnessCheckin(user.id, todayIso()));
    const checkin = await storage.upsertWellnessCheckin(user.id, todayIso(), parsed.data);
    if (isFirstSubmissionToday && (await storage.getCaraCapMinutesForAthlete(user.id)) != null) {
      await storage.startCaraTrainingSession(user.id);
    }
    res.status(201).json(checkin);
  });

  app.get("/api/athlete/wellness/history", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const history = await storage.getWellnessHistoryForAthlete(user.id);
    res.json(history.map((h) => ({ ...h, ...computeReadiness(h) })));
  });

  // Deliberately its own endpoint, not folded into /api/athlete/day -- an AI
  // call (or a slow one) here should never add latency to loading the day's
  // actual workout. Returns null if there's no wellness check-in yet for the
  // date or AI isn't configured; the client just renders nothing either way.
  app.get("/api/athlete/readiness", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const date = typeof req.query.date === "string" ? req.query.date : todayIso();
    const briefing = await storage.getOrCreateReadinessBriefing(user.id, date);
    res.json(briefing ? { briefing: briefing.briefing } : null);
  });

  // Same isolation principle as /api/athlete/readiness above -- its own
  // lazily-fetched endpoint so a slow/unconfigured AI call never blocks the
  // progress page. Cached per calendar week, so this only ever generates
  // (and notifies) once per athlete per week.
  app.get("/api/athlete/digest", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const { digest, isNew } = await storage.getOrCreateAthleteDigest(user.id);
    if (isNew && digest) {
      await notifyUser(
        user.id,
        "digest",
        "Your Weekly Training Summary",
        digest.digest,
        "/athlete/progress",
      );
    }
    res.json(digest ? { digest: digest.digest } : null);
  });

  // Never a private channel -- every message either side sends is readable
  // by the athlete's coach too (see the matching /api/coach/roster/:id/chat
  // route below), which stays true for a Free-Agent-era history even after
  // they join a coach. Gated the same as the AI-programs routes above: a
  // Free Agent is the only one who ever reaches requirePaidAiAccess here --
  // requireFreeAgent already rejects a coached athlete before that, since
  // the coach is their guidance now, not the AI.
  app.get(
    "/api/athlete/chat",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess,
    async (req, res) => {
      const user = currentUser(req);
      const messages = await storage.getChatMessagesForAthlete(user.id);
      res.json(messages);
    },
  );

  app.post(
    "/api/athlete/chat",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess,
    async (req, res) => {
      const user = currentUser(req);
      const parsed = sendChatMessageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid message" });
      const result = await storage.sendAthleteChatMessage(user.id, parsed.data.content);
      res.status(201).json(result);
    },
  );

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

  // ---------------- Athlete: restricted/modified workout auto-generation ----------------
  // Swaps every exercise in one day that would aggravate today's flagged
  // pain into a safe alternative, in one AI-driven shot -- deliberately
  // free like swap-exercise, since this is a safety feature, not a paid
  // tier. Writes to assignment_exercise_overrides (this occurrence only),
  // never program_exercises, so no other athlete on a shared program is
  // affected.
  app.post(
    "/api/athlete/assignments/:assignmentId/days/:programDayId/modified-workout",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const programDayId = Number(req.params.programDayId);
      const schema = z.object({ date: z.string() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "date is required" });
      }
      const result = await storage.generateModifiedWorkout(
        user.id,
        assignmentId,
        programDayId,
        parsed.data.date,
      );
      if ("error" in result) return res.status(400).json(result);
      res.json(result);
    },
  );

  app.delete(
    "/api/athlete/assignments/:assignmentId/days/:programDayId/modified-workout",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const programDayId = Number(req.params.programDayId);
      const owned = await storage.getAssignmentForAthlete(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Assignment not found" });
      await storage.clearModifiedWorkout(assignmentId, programDayId);
      res.status(204).end();
    },
  );

  app.post("/api/athlete/log", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = submitWorkoutLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const log = await storage.submitWorkoutLog(user.id, parsed.data);
    const legDriveFlag = await storage.evaluateLegDriveAsymmetryFlags(
      parsed.data.assignmentId,
      parsed.data.entries,
    );
    if (legDriveFlag) {
      const body = legDriveFlag.flags
        .map((f) => `${f.exerciseName}: ${f.weakSide} leg driving ${f.avgAsymmetryPercent}% less than the other`)
        .join("; ");
      await notifyUser(
        legDriveFlag.coachId,
        "leg_asymmetry",
        `${user.name} showed a leg-drive imbalance today`,
        body,
        "/coach/analytics",
      );
    }
    // Every save while a CARA training session is open is "still actively
    // training" evidence -- completion closes it outright, anything else
    // just resets the idle clock. Both are no-ops when there's no open
    // session (most days, for most coaches, since this is opt-in).
    let newlyUnlockedTrophies: Awaited<ReturnType<typeof storage.checkAndAwardTrophies>>["newlyUnlocked"] = [];
    if (parsed.data.completed) {
      await storage.closeCaraSessionOnCompletion(user.id);
      // Completing a workout is the only moment totalCompleted/streak/PR
      // count can newly cross a threshold, so this is the one place we
      // surface "newly unlocked" for a celebratory toast -- a plain refetch
      // of the trophy case (e.g. the athlete's own progress page) never
      // re-announces something already earned.
      ({ newlyUnlocked: newlyUnlockedTrophies } = await storage.checkAndAwardTrophies(user.id));
    } else {
      await storage.touchCaraSession(user.id);
    }
    res.status(200).json({ ...log, newlyUnlockedTrophies });
  });

  // ---------- CARA (countable athletically-related activity) tracking ----------
  // All athlete-facing -- silently inert (open: null) for any athlete whose
  // coach hasn't opted into CARA compliance tracking.

  app.get("/api/athlete/cara/status", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const capMinutes = await storage.getCaraCapMinutesForAthlete(user.id);
    if (capMinutes == null) return res.json({ tracking: false, open: null });
    await storage.sweepStaleCaraSession(user.id);
    const open = await storage.getOpenCaraSession(user.id);
    const weekStart = startOfWeek(new Date());
    const weekEnd = addWeeks(weekStart, 1);
    const weeklyMinutes = await storage.getCaraWeeklyMinutesForAthlete(user.id, weekStart, weekEnd);
    // The idle prompt is a client-side decision (it just compares "now" to
    // lastActivityAt against IDLE_PROMPT_MINUTES), so the open session's
    // own timestamp is all the client needs -- no separate flag to keep in
    // sync.
    res.json({
      tracking: true,
      open: open ?? null,
      idlePromptMinutes: storage.IDLE_PROMPT_MINUTES,
      weeklyMinutes,
      capMinutes,
    });
  });

  app.post("/api/athlete/cara/confirm-active", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const session = await storage.confirmCaraSessionActive(user.id);
    res.json(session ?? null);
  });

  app.post("/api/athlete/cara/stop", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const session = await storage.stopCaraSessionManually(user.id);
    res.json(session ?? null);
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
      await notifyUser(owned.coachId, hasVideo ? "video" : "comment", title, body, "/coach/calendar");

      res.status(201).json(comment);
    },
  );

  // ---------------- Athlete: Conversational AI program builder (Free Agent) ----------------
  // Same self-service pattern as the admin's own AI program builder above,
  // but only for a Free Agent (requireFreeAgent: zero coaches right now) --
  // once an athlete joins a team they're meant to rely on that coach, not
  // keep a parallel self-serve programs feature running. The AI-specific
  // routes below (ai-draft, chat, form-check) are further gated behind
  // requirePaidAiAccess, a paid-upgrade paywall that's a hard block until
  // real billing exists; the plain CRUD routes (list/get/create/update/
  // delete) and the dedicated swap-exercise route stay free for every Free
  // Agent, so manual program building and exercise substitution always
  // work. No human reviews an AI edit before it applies (see
  // storage.generateProgramFromChat for why that's safe: it's the
  // athlete's own account, own data, same as admin's). The per-program
  // aiAuthored flag -- not the athlete's current coach status -- is what
  // gates the "full function" AI form-check, so an athlete who later joins
  // a team keeps these programs untouched alongside whatever their new
  // coach assigns.

  // Backs the manual program builder's exercise picker -- same catalog
  // (own exercises + every Forge-official one) the AI paths already see
  // via getVisibleExercisesForCoach, just exposed for a human to browse
  // instead of an AI to reference by id. Free for every Free Agent, same
  // as the plain CRUD program routes below.
  app.get("/api/athlete/exercises", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getVisibleExercisesForCoach(user.id);
    res.json(list);
  });

  app.get("/api/athlete/programs", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getProgramsByCoach(user.id);
    res.json(list);
  });

  app.get("/api/athlete/programs/:id", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const program = await assertCoachOwnsProgram(user.id, id);
    if (!program) return res.status(404).json({ message: "Program not found" });
    res.json({ ...program, isForgeOfficial: false, ownerLabel: "YOU", editable: true });
  });

  app.post("/api/athlete/programs", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const parsed = programStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const program = await storage.createProgramWithStructure(user.id, parsed.data);
    res.status(201).json(program);
  });

  app.post(
    "/api/athlete/programs/ai-draft",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess,
    async (req, res) => {
      const user = currentUser(req);
      const parsed = generateProgramDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const draft = await storage.generateProgramDraft(user.id, parsed.data.prompt, user.id);
      res.json(draft);
    },
  );

  app.put("/api/athlete/programs/:id", requireRole("athlete"), requireFreeAgent, async (req, res) => {
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

  app.delete("/api/athlete/programs/:id", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Program not found" });
    await storage.deleteProgram(id);
    res.status(204).end();
  });

  app.get(
    "/api/athlete/programs/:id/chat",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess,
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const owned = await assertCoachOwnsProgram(user.id, id);
      if (!owned) return res.status(404).json({ message: "Program not found" });
      const messages = await storage.getProgramChatMessages(id);
      res.json(messages);
    },
  );

  app.post(
    "/api/athlete/programs/:id/chat",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess,
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const owned = await assertCoachOwnsProgram(user.id, id);
      if (!owned) return res.status(404).json({ message: "Program not found" });
      const parsed = sendProgramChatMessageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid message" });
      const result = await storage.generateProgramFromChat(id, user.id, parsed.data.content);
      res.status(201).json(result);
    },
  );

  // The exercise-substitution agent -- deliberately its own narrow route,
  // never behind requirePaidAiAccess, so a Free Agent keeps this one AI
  // feature even with the general program builder/chat paywalled above.
  app.post(
    "/api/athlete/programs/:id/swap-exercise",
    requireRole("athlete"),
    requireFreeAgent,
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const owned = await assertCoachOwnsProgram(user.id, id);
      if (!owned) return res.status(404).json({ message: "Program not found" });
      const parsed = substituteExerciseSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
      const result = await storage.substituteExercise(
        id,
        parsed.data.programExerciseId,
        user.id,
        parsed.data.reason,
        parsed.data.notes,
      );
      if ("error" in result) return res.status(422).json({ message: result.error });
      res.status(200).json(result);
    },
  );

  // Nutrition education Q&A -- a "full function" AI feature like the
  // general chat/ai-draft/form-check, so it's paywalled the same way
  // (unlike swap-exercise, which stays free). Free Agent only: a coached
  // athlete's actual plan is their coach's call, not the AI's, and the
  // coach never reaches this route at all (requireFreeAgent already
  // guarantees that upstream).
  app.post(
    "/api/athlete/nutrition/ask",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess,
    async (req, res) => {
      const user = currentUser(req);
      const schema = z.object({ question: z.string().trim().min(3).max(500) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Ask a real question (3-500 characters)" });
      }
      const result = await storage.answerNutritionQuestion(user.id, parsed.data.question);
      if ("error" in result) return res.status(422).json({ message: result.error });
      res.status(200).json(result);
    },
  );

  // "Full function" AI form check -- see storage.submitFormCheck for why
  // this is the one place the AI critiques technique with no human review
  // step, and why that's gated on the program already being AI-authored.
  app.post(
    "/api/athlete/programs/:id/form-check",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess,
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const owned = await assertCoachOwnsProgram(user.id, id);
      if (!owned) return res.status(404).json({ message: "Program not found" });
      const schema = z.object({
        exerciseName: z.string().trim().min(1).max(200),
        images: z
          .array(
            z.object({
              mediaType: z.enum(["image/jpeg", "image/png"]),
              data: z.string().min(1),
            }),
          )
          .min(1)
          .max(6),
        trackedMetrics: z
          .object({
            peakVelocityMps: z.number().optional().nullable(),
            meanVelocityMps: z.number().optional().nullable(),
            concentricSeconds: z.number().optional().nullable(),
            eccentricSeconds: z.number().optional().nullable(),
            barPathDeviationCm: z.number().optional().nullable(),
            formFaults: formFaultSchema.array().optional().nullable(),
            peakPowerWatts: z.number().optional().nullable(),
            meanPowerWatts: z.number().optional().nullable(),
            eccentricMeanVelocityMps: z.number().optional().nullable(),
            romCm: z.number().optional().nullable(),
            velocityLossPercent: z.number().optional().nullable(),
          })
          .optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const result = await storage.submitFormCheck(
        id,
        user.id,
        parsed.data.exerciseName,
        parsed.data.images,
        parsed.data.trackedMetrics,
      );
      if (!result) return res.status(400).json({ message: "This program isn't AI-authored yet" });
      res.status(201).json(result);
    },
  );

  // Self-assignment: coachId and athleteId are both this athlete's own id.
  // Same bypass reasoning as /api/admin/my/assignments -- an athlete is
  // never on their own roster, so the coach-roster-membership check that
  // guards /api/coach/assignments would always (incorrectly) fail here.
  app.post("/api/athlete/my/assignments", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      programId: z.number(),
      startDate: z.string(),
      dateOverrides: z.record(z.string(), z.string()).optional(),
      correctivesEnabled: z.boolean().default(true),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const usable = await storage.getProgramIfUsableByCoach(user.id, parsed.data.programId);
    if (!usable) return res.status(404).json({ message: "Program not found" });

    const result = await storage.createAssignment(
      user.id,
      parsed.data.programId,
      [{ athleteId: user.id, correctivesEnabled: parsed.data.correctivesEnabled }],
      parsed.data.startDate,
      parsed.data.dateOverrides,
    );
    res.status(201).json(result);
  });

  // ---------------- Notifications ----------------
  // In-app inbox, available to any authenticated user. Coaches get entries
  // from athlete comments/videos; athletes get entries from a coach's reply
  // or a team announcement.

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

  // ---------------- Account self-service ----------------
  // Name/email/password, available to every role -- a coach previously
  // had no way to edit their own account at all short of the logged-out
  // forgot-password flow.

  app.patch("/api/account/profile", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const parsed = updateAccountNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateUserName(user.id, parsed.data.name);
    res.json(updated);
  });

  app.patch("/api/account/email", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const parsed = updateAccountEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const fullUser = await storage.getUser(user.id);
    if (!fullUser || !(await comparePasswords(parsed.data.password, fullUser.passwordHash))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    const existing = await storage.getUserByEmail(parsed.data.newEmail);
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ message: "That email is already in use" });
    }
    const updated = await storage.updateUserEmail(user.id, parsed.data.newEmail);
    res.json(updated);
  });

  app.patch("/api/account/password", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const parsed = updateAccountPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const fullUser = await storage.getUser(user.id);
    if (!fullUser || !(await comparePasswords(parsed.data.currentPassword, fullUser.passwordHash))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    const newHash = await hashPassword(parsed.data.newPassword);
    await storage.updateUserPasswordHash(user.id, newHash);
    res.status(204).end();
  });

  // Any staff member's own personal touch, not gated to the primary the
  // way org branding is -- see personalAccentColor's comment on the users
  // table in shared/schema.ts.
  app.patch("/api/coach/personal-accent", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = updatePersonalAccentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updatePersonalAccentColor(user.id, parsed.data.accentColor ?? null);
    res.json(updated);
  });

  // ---------------- Branding & personalization ----------------
  // Org-wide white-label identity (name/logo/colors), a per-team override
  // of the color/logo fields, primary-coach-only nav trimming, and
  // per-coach dashboard box show/hide -- see storage.ts's
  // getEffectiveBrandingForUser for how a coach's own branding resolves
  // vs. an athlete's (their coach's org branding, with any team override
  // layered on top field-by-field).

  app.get("/api/coach/branding", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    const branding = await storage.getCoachBranding(coachIds[0]);
    res.json(branding);
  });

  app.patch("/api/coach/branding", requireRole("coach"), requirePrimaryCoach, async (req, res) => {
    const user = currentUser(req);
    const parsed = updateBrandingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    const updated = await storage.updateCoachBranding(coachIds[0], parsed.data);
    res.json(updated);
  });

  app.post(
    "/api/coach/branding/logo",
    requireRole("coach"),
    requirePrimaryCoach,
    uploadOrgLogo.single("logo"),
    async (req, res) => {
      const user = currentUser(req);
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const coachIds = await storage.getEffectiveCoachIds(user.id);
      const logoUrl = `/uploads/team-logos/${req.file.filename}`;
      const updated = await storage.updateCoachLogo(coachIds[0], logoUrl);
      res.json(updated);
    },
  );

  app.delete("/api/coach/branding/logo", requireRole("coach"), requirePrimaryCoach, async (req, res) => {
    const user = currentUser(req);
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    const updated = await storage.updateCoachLogo(coachIds[0], null);
    res.json(updated);
  });

  // Effective branding for whoever's logged in -- any role, since an
  // athlete needs this to re-skin their own AppShell too, not just coaches
  // editing it.
  app.get("/api/branding/me", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const branding = await storage.getEffectiveBrandingForUser(user.id);
    res.json(branding);
  });

  // Deliberately unauthenticated -- lets the signup page re-skin itself
  // for whichever coach/team invite code someone just typed in, before
  // they have an account to log into at all. Doesn't reveal anything a
  // failed/successful signup attempt with the same code wouldn't already:
  // whether it resolves to a real program.
  app.get("/api/public/branding", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
    if (!code) {
      return res.json(null);
    }
    const branding = await storage.getPublicBrandingForCode(code);
    res.json(branding);
  });

  app.get("/api/coach/nav-prefs", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    const prefs = await storage.getNavPrefsForCoach(coachIds[0]);
    res.json(prefs);
  });

  app.patch("/api/coach/nav-prefs", requireRole("coach"), requirePrimaryCoach, async (req, res) => {
    const user = currentUser(req);
    const parsed = updateNavPrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    const prefs = await storage.setNavPrefsForCoach(coachIds[0], parsed.data);
    res.json(prefs);
  });

  app.get("/api/coach/widget-prefs", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const layout = await storage.getWidgetLayoutForUser(user.id);
    res.json({ layout });
  });

  app.patch("/api/coach/widget-prefs", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = widgetLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const layout = await storage.setWidgetLayoutForUser(user.id, parsed.data.layout);
    res.json({ layout });
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

  // Backs the rest timer's lock-screen notification (see rest-timer.tsx and
  // rest-timer-push.ts) -- a client-side countdown can't fire anything once
  // the phone locks and the tab's JS gets suspended, so this schedules a
  // real push, delivered by the OS, as the one channel that still reaches
  // the athlete. No-ops server-side (via sendPushToUser) if the athlete
  // never enabled push at all, so the client doesn't need to check first.
  app.post("/api/athlete/rest-timer/schedule-push", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      seconds: z.number().int().min(1).max(600),
      url: z.string().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    scheduleRestOverPush(user.id, parsed.data.seconds, parsed.data.url);
    res.status(204).end();
  });

  app.post("/api/athlete/rest-timer/cancel-push", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    cancelRestOverPush(user.id);
    res.status(204).end();
  });

  const httpServer = createServer(app);
  return httpServer;
}
