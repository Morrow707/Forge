import express, { type Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { setupAuth, requireAuth, requireRole, attachNativeTokenAuth } from "./auth";
import { storage } from "./storage";
import { buildIcsFeed } from "./ics";
import { getVapidPublicKey, pushEnabled } from "./push";
import { apnsEnabled } from "./apns";
import { scheduleRestOverPush, cancelRestOverPush } from "./rest-timer-push";
import { sendEmail, emailEnabled } from "./email";
import { aiEnabled } from "./ai";
import { usdaFoodLookupEnabled } from "./food-lookup";
import { buildProgressReportEmail } from "./progress-report";
import { buildRecruitingProfilePdf } from "./recruiting-profile";
import { buildTrainingHistoryCsv, buildTrainingHistoryPdf, csvField } from "./training-history-export";
import { buildMovementScreenSheetPdf } from "./movement-screen-export";
import { buildComplianceReportPdf } from "./compliance-report";
import { buildLegalDocumentPdf } from "./legal-document-export";
import { GUARDIAN_NOTICE_LIVE } from "@shared/privacy-tiers";
import { notifyUser } from "./notify";
import {
  insertExerciseSchema,
  insertSkillExerciseSchema,
  programStructureSchema,
  skillProgramStructureSchema,
  insertAssignmentSchema,
  insertSkillAssignmentSchema,
  createSkillSessionLogSchema,
  setSkillSessionAnnotationSchema,
  updateSkillFaultThresholdsSchema,
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
  apnsSubscribeSchema,
  createWorkoutCommentSchema,
  createSkillDayCommentSchema,
  setSkillDayCompleteSchema,
  createExerciseReportSchema,
  resolveSubmissionSchema,
  coachAnalyticsQuerySchema,
  createTeamPostSchema,
  createBodyMetricSchema,
  createAnnotationSchema,
  testingTrendsQuerySchema,
  insertGoniometerReadingSchema,
  createMovementScreenSchema,
  updateMovementScreenBatterySchema,
  createGoalSchema,
  suggestGoalTargetSchema,
  sendChatMessageSchema,
  generateProgramDraftSchema,
  submitWellnessCheckinSchema,
  sendProgramChatMessageSchema,
  sendSkillProgramChatMessageSchema,
  sendAiKnowledgeChatMessageSchema,
  applyKnowledgeProposalSchema,
  sendForgeAiChatMessageSchema,
  applyForgeAiEntryProposalSchema,
  deactivateForgeAiEntrySchema,
  updateLegalAgreementSchema,
  substituteExerciseSchema,
  formFaultSchema,
  updateNutritionTargetsSchema,
  setNutritionGoalSchema,
  submitInjurySchema,
  createFoodLogEntrySchema,
  updateFoodLogEntrySchema,
  logCaraActivitySchema,
  setCaraCapSchema,
  createTeamChallengeSchema,
  createTeamGameDaySchema,
  classStructureSchema,
  enrollInClassSchema,
  classCoachSettingsInputSchema,
  academyTrackStructureSchema,
  updateCoachBrandingSchema,
  updateCoachFeaturesSchema,
  adminAthleteQueryFiltersSchema,
  createAdminSavedViewSchema,
  updateLegalDocumentSchema,
  emailLegalDocumentSchema,
} from "@shared/schema";
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

// Browsers sometimes append codec parameters to the multipart Content-Type
// (e.g. "video/mp4;codecs=avc1.4D401E") -- only the base type before the
// semicolon is meaningful for picking a container extension, so this is the
// single place both upload routes below look one up from.
function videoExtensionForMimetype(mimetype: string): string | undefined {
  return VIDEO_EXTENSION_BY_MIME[mimetype.split(";")[0].trim().toLowerCase()];
}

// Shared by every photo-import analyze-photo route below (testing day,
// weigh-in, nutrition sheet, injury intake, OVR/Perch printout, player
// intake, program transcription) -- same base64-JSON shape
// /api/athlete/food/analyze-photo already uses, capped at 4 (a few pages
// of a roster sheet) instead of food's 2 since a sheet-of-many-rows import
// is the whole point of these features.
const photoImagesSchema = z
  .array(z.object({ mediaType: z.enum(["image/jpeg", "image/png"]), data: z.string().min(1) }))
  .min(1)
  .max(4);

// A tracked set has no fixed length -- a slow-tempo, high-rep set run
// through the native ARKit recorder (no explicit bitrate set on that
// encoder, see ArCameraPreviewPlugin.swift's appendVideoFrame) can
// legitimately produce a file well past what these limits used to allow.
// The real fix is encoding efficiently in the first place, not endlessly
// raising a cap as recordings get longer -- but this needs to be generous
// enough that a real, valid recording is never rejected for a reason that
// has nothing to do with whether it's a valid video.
const MAX_TRACKED_VIDEO_BYTES = 500 * 1024 * 1024;

const uploadFormVideo = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${videoExtensionForMimetype(file.mimetype) ?? ""}`);
    },
  }),
  limits: { fileSize: MAX_TRACKED_VIDEO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!videoExtensionForMimetype(file.mimetype)) {
      return cb(new Error("Unsupported video format"));
    }
    cb(null, true);
  },
});

// Skills' own opt-in clip storage -- deliberately a separate directory from
// form-videos even though the upload mechanics are identical, keeping the
// same "never share a query path or a bucket" isolation the rest of Skills
// follows. A clip only ever lands here if the athlete explicitly taps
// "save for coach" on the mechanics or sprint tracker's review screen (see
// MechanicsTrackerDialog/SprintTrackerDialog); a session the athlete never
// opts into never uploads video at all.
const SKILL_VIDEOS_DIR = path.join(process.cwd(), "server", "uploads", "skill-videos");
fs.mkdirSync(SKILL_VIDEOS_DIR, { recursive: true });

const uploadSkillVideo = multer({
  storage: multer.diskStorage({
    destination: SKILL_VIDEOS_DIR,
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${videoExtensionForMimetype(file.mimetype) ?? ""}`);
    },
  }),
  limits: { fileSize: MAX_TRACKED_VIDEO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!videoExtensionForMimetype(file.mimetype)) {
      return cb(new Error("Unsupported video format"));
    }
    cb(null, true);
  },
});

// A coach/admin authoring a lesson's content page can either paste a link
// (the existing videoUrl convention) or upload a video file directly --
// same upload mechanics as the athlete/skill clip uploads above, just a
// separate directory since this is authored instructional content, not an
// athlete's own captured rep.
const LESSON_VIDEOS_DIR = path.join(process.cwd(), "server", "uploads", "lesson-videos");
fs.mkdirSync(LESSON_VIDEOS_DIR, { recursive: true });

const uploadLessonVideo = multer({
  storage: multer.diskStorage({
    destination: LESSON_VIDEOS_DIR,
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${videoExtensionForMimetype(file.mimetype) ?? ""}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!videoExtensionForMimetype(file.mimetype)) {
      return cb(new Error("Unsupported video format"));
    }
    cb(null, true);
  },
});

// A downloadable worksheet/handout attached to a lesson's content page --
// PDF only, kept to a narrow allowlist (never an executable/script type)
// since this ends up served back as a direct download link to any athlete
// enrolled in the class.
const LESSON_ATTACHMENTS_DIR = path.join(process.cwd(), "server", "uploads", "lesson-attachments");
fs.mkdirSync(LESSON_ATTACHMENTS_DIR, { recursive: true });

const uploadLessonAttachment = multer({
  storage: multer.diskStorage({
    destination: LESSON_ATTACHMENTS_DIR,
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}.pdf`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF attachments are supported"));
    }
    cb(null, true);
  },
});

// A diagram/photo for a lesson's content page -- same "paste a link or
// upload a file" choice as videoUrl, just appended to imageUrls instead of
// replacing a single field, since a page can carry more than one.
const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

const LESSON_IMAGES_DIR = path.join(process.cwd(), "server", "uploads", "lesson-images");
fs.mkdirSync(LESSON_IMAGES_DIR, { recursive: true });

const uploadLessonImage = multer({
  storage: multer.diskStorage({
    destination: LESSON_IMAGES_DIR,
    filename: (_req, file, cb) => {
      const ext = IMAGE_EXTENSION_BY_MIME[file.mimetype.split(";")[0].trim().toLowerCase()];
      cb(null, `${crypto.randomUUID()}${ext ?? ""}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_EXTENSION_BY_MIME[file.mimetype.split(";")[0].trim().toLowerCase()]) {
      return cb(new Error("Unsupported image format"));
    }
    cb(null, true);
  },
});

// A coach/team's uploaded logo -- shown in the app header and, once
// branded, in place of the Forge mark throughout that coach's own and
// their athletes' views (see AppShell). SVG is excluded here (unlike lesson
// images) since it's rendered directly in a fixed-size header slot rather
// than a content page -- rasterized formats avoid an uploaded SVG carrying
// unexpected embedded content into that spot.
const TEAM_LOGO_EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const TEAM_LOGOS_DIR = path.join(process.cwd(), "server", "uploads", "team-logos");
fs.mkdirSync(TEAM_LOGOS_DIR, { recursive: true });

const uploadTeamLogo = multer({
  storage: multer.diskStorage({
    destination: TEAM_LOGOS_DIR,
    filename: (_req, file, cb) => {
      const ext = TEAM_LOGO_EXTENSION_BY_MIME[file.mimetype.split(";")[0].trim().toLowerCase()];
      cb(null, `${crypto.randomUUID()}${ext ?? ""}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!TEAM_LOGO_EXTENSION_BY_MIME[file.mimetype.split(";")[0].trim().toLowerCase()]) {
      return cb(new Error("Unsupported image format -- use PNG, JPEG, or WebP"));
    }
    cb(null, true);
  },
});

function currentUser(req: any) {
  return req.user as { id: number; role: "coach" | "athlete" | "admin"; name: string; email: string };
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

// TestFlight-phase-only bypass -- flips every paywall below open for every
// account, not just the specific comped demo accounts below, so real
// testers get the full app instead of hitting an artificial paywall with no
// way to actually pay through it yet. Nothing else about the paywalls
// changes: every entitlement check, route, and UI locked-state stays
// exactly what it'll be once real billing exists -- this is the one flag to
// flip back (unset PAYWALLS_DISABLED, or set it to anything other than
// "true") when it's time to actually enforce paywalls again. Defaults to
// enforced (false) so forgetting to set the env var never accidentally
// unlocks a live paid product.
const testingUnlockAllPaywalls = process.env.PAYWALLS_DISABLED === "true";

// Strength and Skills are two totally separate paid upgrades for a Free
// Agent -- paying for one never unlocks the other. Keep this a plain union
// (not a DB enum) since it's purely a route-gating concept, not stored data.
type AiEntitlement = "strengthAi" | "skillsAi";

// The seeded demo Free Agent account (see server/seed.ts) is the one
// deliberate exception to the paywalls below -- it's used for demoing/
// testing the full Free Agent AI experience without real billing existing
// yet, so it's treated as permanently "paid" for both entitlements. No other
// account gets this.
const COMPED_FREE_AGENT_ENTITLEMENTS: Record<string, Set<AiEntitlement>> = {
  "freeagent@forge.app": new Set(["strengthAi", "skillsAi"]),
};

// The future paywall requireFreeAgent's own comment anticipates: nothing
// sets either entitlement true yet (no billing exists), so every route
// gated behind requirePaidAiAccess is a hard block for a Free Agent until
// that's built -- change only this function once real billing exists.
// Exercise substitution is deliberately never gated by this (see the
// swap-exercise routes below) so a Free Agent keeps that one AI feature
// even while everything requiring a paid entitlement is paywalled.
async function hasAthletePaidForAiAccess(
  _athleteId: number,
  email: string,
  entitlement: AiEntitlement,
): Promise<boolean> {
  if (testingUnlockAllPaywalls) return true;
  return COMPED_FREE_AGENT_ENTITLEMENTS[email]?.has(entitlement) ?? false;
}

// Gates the "full function" AI features -- program builder chat/draft, AI
// form-check, nutrition Q&A, and the general chat coach behind "strengthAi";
// the Skills side's equivalent features behind "skillsAi" -- for a Free
// Agent specifically. Only meaningful stacked after requireFreeAgent, which
// already guarantees the caller has zero coaches by the time this runs -- a
// coached athlete never reaches either paywall at all, they're already
// rejected upstream.
function requirePaidAiAccess(entitlement: AiEntitlement) {
  return async function (req: any, res: any, next: any) {
    const user = currentUser(req);
    const hasPaid = await hasAthletePaidForAiAccess(user.id, user.email, entitlement);
    if (!hasPaid) {
      return res.status(402).json({
        message:
          entitlement === "skillsAi"
            ? "This is a paid upgrade for Free Agents, coming soon."
            : "This AI feature is a paid upgrade for Free Agents, coming soon -- exercise substitution stays free in the meantime.",
        freeAgentPaywall: true,
        entitlement,
      });
    }
    next();
  };
}

// Same demo/testing exception as COMPED_FREE_AGENT_ENTITLEMENTS above, for
// per-lesson Class purchases -- no real billing exists yet, so this account
// is the only way to ever actually reach a "purchased" lesson end to end.
const COMPED_FREE_AGENT_LESSON_BUYER = "freeagent@forge.app";

// Same demo/testing exception as the two stubs above -- no real billing
// exists yet, so a comped coach here is the only way (besides being an
// admin) to reach the unlocked Coaches Corner experience end to end.
const COMPED_COACHES_CORNER_COACHES = new Set(["coach@forge.app"]);

// Coaches Corner (coach education) paywall -- no real billing exists yet
// (see the two stubs above), so this is intentionally admin-only for now,
// plus whichever coaches are explicitly comped above -- every other regular
// coach sees the locked teaser catalog until this is wired to real billing.
// Admins bypass since they're the ones curating the content. Change only
// this function once real billing exists -- every route below reads
// through it, never a role check of its own.
function hasCoachesCornerAccess(user: { role: string; email: string }) {
  if (testingUnlockAllPaywalls) return true;
  return user.role === "admin" || COMPED_COACHES_CORNER_COACHES.has(user.email);
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

async function assertOwnsSkillExercise(userId: number, skillExerciseId: number) {
  const skillExercise = await storage.getSkillExercise(skillExerciseId);
  if (!skillExercise) return null;
  const coachIds = await storage.getEffectiveCoachIds(userId);
  if (!coachIds.includes(skillExercise.coachId)) return null;
  return skillExercise;
}

async function assertCoachOwnsProgram(coachId: number, programId: number) {
  const program = await storage.getProgramFull(programId);
  if (!program) return null;
  const coachIds = await storage.getEffectiveCoachIds(coachId);
  if (!coachIds.includes(program.coachId)) return null;
  return program;
}

async function assertCoachOwnsSkillProgram(coachId: number, skillProgramId: number) {
  const program = await storage.getSkillProgramFull(skillProgramId);
  if (!program) return null;
  const coachIds = await storage.getEffectiveCoachIds(coachId);
  if (!coachIds.includes(program.coachId)) return null;
  return program;
}

async function assertCoachOwnsClass(coachId: number, classId: number) {
  const cls = await storage.getClassFull(classId);
  if (!cls) return null;
  const coachIds = await storage.getEffectiveCoachIds(coachId);
  if (!coachIds.includes(cls.coachId)) return null;
  return cls;
}

// The admin-authoring counterpart to assertCoachOwnsClass above -- deliberately
// NOT scoped to "this specific admin's own effective coach ids" the way that
// one is, because "only the admin profiles are allowed to add/edit" means any
// admin account, not just whichever admin happened to create the row. A
// coach's own (non-Forge) class still can't be reached through the admin
// routes at all, since every admin route only ever creates/targets
// isForgeOfficial classes in the first place.
async function assertAdminOwnsForgeClass(classId: number) {
  const cls = await storage.getClassFull(classId);
  if (!cls || !cls.isForgeOfficial) return null;
  return cls;
}

// Shared gate for the athlete-facing lesson-reader routes -- only "ready"
// (reachable, paid for, quiz not yet passed/activated) or "active" (already
// on the calendar) lessons are actually readable; a "locked" or
// "locked_preview" lessonId 404s exactly like it doesn't exist, so a client
// can't jump ahead of the progression/payment gate by guessing a later
// lesson's id.
async function requireReadableClassLesson(userId: number, classId: number, lessonId: number) {
  const enrollment = await storage.getClassEnrollmentForAthlete(userId, classId);
  if (!enrollment) return null;
  const progress = await storage.getClassProgressForAthlete(userId, classId);
  const lesson = progress?.lessons.find((l) => l.id === lessonId);
  if (!lesson || (lesson.state !== "ready" && lesson.state !== "active")) return null;
  return enrollment;
}

// Fires exactly at the moment a lesson actually becomes available -- never
// on a schedule, since recomputeClassProgress only ever runs lazily off a
// real request. Covers every reason a lesson opens: enrollment landing on
// lesson 1, a coach's manual override, a paid unlock, or enough time/reps/
// sessions having quietly accumulated since anyone last checked.
async function notifyNewlyUnlockedLessons(
  newlyUnlocked: Array<{
    lessonId: number;
    lessonNumber: number;
    title: string;
    classId: number;
    className: string;
    athleteId: number;
  }>,
) {
  for (const lesson of newlyUnlocked) {
    await notifyUser(
      lesson.athleteId,
      "class_lesson_unlocked",
      "New Lesson Unlocked",
      `Lesson ${lesson.lessonNumber}: ${lesson.title} is now available in ${lesson.className}.`,
      `/athlete/classes/${lesson.classId}`,
    );
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);
  app.use(attachNativeTokenAuth);

  // Apple's Shared Web Credentials verification -- fetched by iOS itself
  // (not the app) over HTTPS on install/first launch, cached on-device, and
  // never re-fetched from inside a request the app makes, so this has to be
  // a real unauthenticated GET at exactly this path with no redirect. Lists
  // the native app under "webcredentials" so PasswordAutofill.savePassword
  // (see client/src/lib/native-auth.ts) is allowed to write into this
  // domain's iCloud Keychain entry -- see ios/App/App/App.entitlements for
  // the matching Associated Domains capability. No file extension is
  // intentional; that's the filename Apple's fetcher looks for.
  app.get("/.well-known/apple-app-site-association", (_req, res) => {
    res.type("application/json").json({
      webcredentials: {
        apps: ["425KPX8WHN.com.foreperformancesystems.forge"],
      },
    });
  });

  app.use("/uploads", express.static(path.join(process.cwd(), "server", "uploads")));
  // express.static calls next() rather than responding when a file isn't
  // found, so a missing upload (a video whose row survived some past
  // ephemeral-disk wipe, or any other vanished file) would otherwise fall
  // all the way through to the SPA's catch-all in serveStatic() and come
  // back as 200 + index.html -- a real page, just not the video. A <video
  // src> pointed at that never fires its error event (there's no video
  // data, but there's no error either), so playback just silently hangs at
  // 0:00 forever with nothing anywhere to explain why. Answering with an
  // honest 404 here instead lets every consumer (an athlete opening the
  // link directly, a coach's <video onError>) react to a real, unambiguous
  // failure.
  app.use("/uploads", (_req, res) => {
    res.status(404).json({ message: "File not found" });
  });

  // Deliberately unauthenticated -- the signup page has to show this before
  // an account exists to log in with. See storage.getLegalAgreement for the
  // fallback text on a fresh install that hasn't configured this yet.
  app.get("/api/legal-agreement", async (_req, res) => {
    const content = await storage.getLegalAgreement();
    res.json({ content });
  });

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

  // ---------------- Coach: Skill Bank ----------------
  // A wholly separate bank from the exercise one above -- a skills coach
  // never sees a squat here, and a strength coach never sees a hitting
  // drill in their exercise bank. See shared/schema.ts's skillExercises
  // comment for why this is a parallel table, not a category.

  app.get("/api/coach/skill-exercises", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getVisibleSkillExercisesForCoach(user.id);
    res.json(list);
  });

  app.get("/api/coach/skill-exercises/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const skillExercise = await storage.getSkillExerciseDetail(id, user.id);
    if (!skillExercise || (!skillExercise.isForgeOfficial && !skillExercise.editable)) {
      return res.status(404).json({ message: "Skill exercise not found" });
    }
    res.json(skillExercise);
  });

  app.post("/api/coach/skill-exercises", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = insertSkillExerciseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const skillExercise = await storage.createSkillExercise(user.id, parsed.data);
    res.status(201).json(skillExercise);
  });

  app.put("/api/coach/skill-exercises/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertOwnsSkillExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Skill exercise not found" });
    const parsed = insertSkillExerciseSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateSkillExercise(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/coach/skill-exercises/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertOwnsSkillExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Skill exercise not found" });
    await storage.deleteSkillExercise(id);
    res.status(204).end();
  });

  // ---------------- Coach: Skill Programs ----------------
  // Mirrors the Programs block below it -- see the comment on
  // skillPrograms in shared/schema.ts for why it's a separate table/API,
  // not a category on the existing programs endpoints.

  app.get("/api/coach/skill-programs", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getVisibleSkillProgramsForCoach(user.id);
    res.json(list);
  });

  app.get("/api/coach/skill-programs/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const program = await storage.getVisibleSkillProgramDetail(id, user.id);
    if (!program) return res.status(404).json({ message: "Skill program not found" });
    res.json(program);
  });

  app.post("/api/coach/skill-programs", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = skillProgramStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const program = await storage.createSkillProgramWithStructure(user.id, parsed.data);
    res.status(201).json(program);
  });

  app.put("/api/coach/skill-programs/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsSkillProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Skill program not found" });
    const parsed = skillProgramStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.updateSkillProgramStructure(id, parsed.data);
    const updated = await storage.getSkillProgramFull(id);
    res.json(updated);
  });

  app.delete("/api/coach/skill-programs/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsSkillProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Skill program not found" });
    await storage.deleteSkillProgram(id);
    res.status(204).end();
  });

  app.get("/api/coach/skill-assignments", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getSkillAssignmentsForCoach(user.id);
    res.json(list);
  });

  app.post("/api/coach/skill-assignments", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = insertSkillAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const usable = await storage.getSkillProgramIfUsableByCoach(user.id, parsed.data.skillProgramId);
    if (!usable) return res.status(404).json({ message: "Skill program not found" });

    const roster = await storage.getRosterForCoach(user.id);
    const rosterIds = new Set(roster.map((a) => a.id));
    const invalidAthlete = parsed.data.athletes.find((a) => !rosterIds.has(a.athleteId));
    if (invalidAthlete) {
      return res.status(400).json({ message: "Athlete not on your roster" });
    }

    const result = await storage.createSkillAssignment(
      user.id,
      parsed.data.skillProgramId,
      parsed.data.athletes,
      parsed.data.startDate,
      parsed.data.dateOverrides,
      parsed.data.durationWeeks,
    );
    res.status(201).json(result);
  });

  // ---------------- Coach: Classes ----------------
  // A coach's own Class is private to their roster (never shown to a Free
  // Agent, who has no coach); an admin's Forge Class (see the /api/admin
  // block further down) shows up here too, read-only, exactly like a Forge
  // program or skill program. getVisibleClassesForCoach already merges
  // both -- called with either a coach's or an admin's own id, since an
  // admin's "coach id" for Classes purposes is just their own user id.

  app.get("/api/coach/classes", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getVisibleClassesForCoach(user.id);
    res.json(list);
  });

  // Registered before the /:id route below so this literal path wins --
  // Express matches routes in registration order, and :id would otherwise
  // swallow "analytics" as an (invalid, NaN) id. Same pattern as the
  // admin analytics route.
  app.get("/api/coach/classes/analytics", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const analytics = await storage.getCoachClassAnalytics(user.id);
    res.json(analytics);
  });

  app.get("/api/coach/classes/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const cls = await storage.getClassIfUsableByCoach(user.id, id);
    if (!cls) return res.status(404).json({ message: "Class not found" });
    const full = await storage.getClassFull(id);
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    res.json({
      ...full,
      ownerLabel: cls.isForgeOfficial ? "FORGE" : "YOU",
      editable: coachIds.includes(cls.coachId),
    });
  });

  app.post("/api/coach/classes", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = classStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const cls = await storage.createClassWithStructure(user.id, parsed.data, false);
    res.status(201).json(cls);
  });

  app.put("/api/coach/classes/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsClass(user.id, id);
    if (!owned) return res.status(404).json({ message: "Class not found" });
    const parsed = classStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.updateClassStructure(id, parsed.data);
    const updated = await storage.getClassFull(id);
    res.json(updated);
  });

  // Quick publish/unpublish from the class list card -- same effect as
  // flipping the toggle in the builder and saving, without needing the
  // full lesson structure payload.
  app.patch("/api/coach/classes/:id/publish", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsClass(user.id, id);
    if (!owned) return res.status(404).json({ message: "Class not found" });
    const schema = z.object({ isDraft: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.setClassDraftState(id, parsed.data.isDraft);
    if (!updated) return res.status(404).json({ message: "Class not found" });
    res.json(updated);
  });

  app.delete("/api/coach/classes/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsClass(user.id, id);
    if (!owned) return res.status(404).json({ message: "Class not found" });
    const result = await storage.deleteClass(id);
    if (!result.deleted) {
      return res.status(409).json({
        message: `Can't delete -- ${result.enrolledCount} athlete${result.enrolledCount === 1 ? "" : "s"} enrolled. Unpublish it instead if you don't want new signups.`,
      });
    }
    res.status(204).end();
  });

  app.get("/api/coach/classes/:id/roster", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const usable = await storage.getClassIfUsableByCoach(user.id, id);
    if (!usable) return res.status(404).json({ message: "Class not found" });
    const roster = await storage.getClassRosterForCoach(user.id, id);
    res.json(roster);
  });

  // Reset an athlete's Classes-specific completion gating (per lesson, or
  // the whole class when lessonId is omitted) so they have to re-read/
  // re-pass to be marked done again. Never touches their calendar
  // assignments or logged training data -- see resetClassLessonProgress.
  app.post(
    "/api/coach/classes/:id/roster/:athleteId/reset",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const athleteId = Number(req.params.athleteId);
      const usable = await storage.getClassIfUsableByCoach(user.id, id);
      if (!usable) return res.status(404).json({ message: "Class not found" });
      const schema = z.object({ lessonId: z.number().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const result = await storage.resetClassLessonProgress(
        user.id,
        id,
        athleteId,
        parsed.data.lessonId,
      );
      if (!result) return res.status(404).json({ message: "Enrollment or lesson not found" });
      if (result.notifyAthlete) {
        const n = result.notifyAthlete;
        await notifyUser(
          n.athleteId,
          "class_progress_reset",
          "Progress reset",
          n.lessonNumber != null
            ? `Your coach reset Lesson ${n.lessonNumber} (${n.lessonTitle}) in ${n.className} -- give it another read and pass the quiz again.`
            : `Your coach reset your progress in ${n.className} -- give it another read and pass through it again.`,
          `/athlete/classes/${id}`,
        );
      }
      const roster = await storage.getClassRosterForCoach(user.id, id);
      res.json(roster);
    },
  );

  app.post("/api/coach/classes/:id/enroll", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const usable = await storage.getClassIfUsableByCoach(user.id, id);
    if (!usable) return res.status(404).json({ message: "Class not found" });
    if (usable.isDraft) {
      return res.status(400).json({ message: "Publish this class before enrolling athletes." });
    }
    const schema = z.object({ athleteId: z.number(), startDate: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const roster = await storage.getRosterForCoach(user.id);
    if (!roster.some((a) => a.id === parsed.data.athleteId)) {
      return res.status(400).json({ message: "Athlete not on your roster" });
    }
    const prereq = await storage.isClassPrerequisiteSatisfied(parsed.data.athleteId, id);
    if (!prereq.satisfied) {
      return res
        .status(400)
        .json({ message: `This athlete needs to complete "${prereq.prerequisiteName}" first.` });
    }
    const { enrollment, newlyUnlocked } = await storage.enrollAthleteInClass(
      user.id,
      id,
      parsed.data.athleteId,
      parsed.data.startDate,
    );
    await notifyNewlyUnlockedLessons(newlyUnlocked);
    res.status(201).json(enrollment);
  });

  app.post(
    "/api/coach/classes/:id/lessons/:lessonId/unlock",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const lessonId = Number(req.params.lessonId);
      const usable = await storage.getClassIfUsableByCoach(user.id, id);
      if (!usable) return res.status(404).json({ message: "Class not found" });
      const schema = z.object({ athleteId: z.number() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      // getClassEnrollmentForAthlete only checks (athleteId, classId) -- a
      // shared Forge-official class can have athletes enrolled by many
      // different coaches, so without this roster check any coach could
      // force-unlock a lesson for (and read the full class progress of) an
      // athlete who isn't theirs, same as /enroll above already guards for.
      const roster = await storage.getRosterForCoach(user.id);
      if (!roster.some((a) => a.id === parsed.data.athleteId)) {
        return res.status(400).json({ message: "Athlete not on your roster" });
      }
      const enrollment = await storage.getClassEnrollmentForAthlete(parsed.data.athleteId, id);
      if (!enrollment) return res.status(404).json({ message: "Athlete not enrolled" });
      const newlyUnlocked = await storage.manuallyUnlockLesson(enrollment.id, lessonId);
      await notifyNewlyUnlockedLessons(newlyUnlocked);
      const progress = await storage.getClassProgressForAthlete(parsed.data.athleteId, id);
      res.json(progress);
    },
  );

  // A coach's own pacing override for a class they've assigned to their
  // roster -- "how many days between lessons" and "how many logged
  // sessions of the drill work" a coach requires before the next lesson
  // unlocks, layered on top of (and replacing) whatever default the class's
  // author picked. Uses getClassIfUsableByCoach (not assertCoachOwnsClass),
  // deliberately -- this must work on a Forge-official class a coach didn't
  // author, since it's pacing, not content, and content stays admin-only.
  app.get("/api/coach/classes/:id/coach-settings", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const usable = await storage.getClassIfUsableByCoach(user.id, id);
    if (!usable) return res.status(404).json({ message: "Class not found" });
    const settings = await storage.getClassCoachSettings(user.id, id);
    res.json({
      minSessionsRequired: settings?.minSessionsRequired ?? null,
      minDaysElapsed: settings?.minDaysElapsed ?? null,
    });
  });

  app.put("/api/coach/classes/:id/coach-settings", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const usable = await storage.getClassIfUsableByCoach(user.id, id);
    if (!usable) return res.status(404).json({ message: "Class not found" });
    const parsed = classCoachSettingsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const settings = await storage.upsertClassCoachSettings(user.id, id, parsed.data);
    res.json({
      minSessionsRequired: settings.minSessionsRequired,
      minDaysElapsed: settings.minDaysElapsed,
    });
  });

  // Not scoped to a specific class -- authored in the class builder before
  // the page's own Save click, same "upload now, reference the returned
  // URL, persist on the next real save" pattern as /api/coach/annotations.
  // Shared by both a coach (their own class) and an admin (a Forge class);
  // ownership of the class itself is still enforced by the classes PUT
  // route that actually persists this URL onto a content page.
  app.post("/api/classes/lesson-media/video", requireRole(["coach", "admin"]), (req, res) => {
    uploadLessonVideo.single("video")(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        return res.status(400).json({ message });
      }
      if (!req.file) return res.status(400).json({ message: "No video file provided" });
      res.status(201).json({ url: `/uploads/lesson-videos/${req.file.filename}` });
    });
  });

  app.post("/api/classes/lesson-media/attachment", requireRole(["coach", "admin"]), (req, res) => {
    uploadLessonAttachment.single("file")(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        return res.status(400).json({ message });
      }
      if (!req.file) return res.status(400).json({ message: "No file provided" });
      res.status(201).json({
        url: `/uploads/lesson-attachments/${req.file.filename}`,
        name: req.file.originalname,
      });
    });
  });

  app.post("/api/classes/lesson-media/image", requireRole(["coach", "admin"]), (req, res) => {
    uploadLessonImage.single("image")(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        return res.status(400).json({ message });
      }
      if (!req.file) return res.status(400).json({ message: "No image file provided" });
      res.status(201).json({ url: `/uploads/lesson-images/${req.file.filename}` });
    });
  });

  // ---------------- Coach: Coaches Corner ----------------
  // Admin-authored coach education (program-design theory, Olympic lift
  // technique, youth development, arm care, reading Forge's own analytics,
  // season planning, coaching communication) -- a single paywalled bundle,
  // not priced per-track. The catalog itself is always visible (title,
  // description, lesson count) so the locked state still reads as a real
  // teaser rather than an empty page; lesson content is stripped out until
  // hasCoachesCornerAccess is true for this coach.
  app.get("/api/coach/academy/tracks", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const unlocked = hasCoachesCornerAccess(user);
    const tracks = await storage.getAllAcademyTracks();
    res.json(
      tracks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        lessonCount: t.lessons.length,
        unlocked,
      })),
    );
  });

  app.get("/api/coach/academy/tracks/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const track = await storage.getAcademyTrackFull(id);
    if (!track) return res.status(404).json({ message: "Track not found" });
    const unlocked = hasCoachesCornerAccess(user);
    if (!unlocked) {
      return res.json({
        id: track.id,
        title: track.title,
        description: track.description,
        unlocked: false,
        lessons: track.lessons.map((l) => ({ id: l.id, lessonNumber: l.lessonNumber, title: l.title })),
      });
    }
    const completions = await storage.getAcademyCompletionsForCoach(user.id);
    res.json({
      id: track.id,
      title: track.title,
      description: track.description,
      unlocked: true,
      lessons: track.lessons.map((l) => ({ ...l, completed: completions.has(l.id) })),
      quizQuestions: track.quizQuestions,
    });
  });

  app.post(
    "/api/coach/academy/lessons/:id/complete",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      if (!hasCoachesCornerAccess(user)) {
        return res.status(402).json({ message: "Coaches Corner isn't open for purchase yet." });
      }
      const id = Number(req.params.id);
      const schema = z.object({ completed: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      await storage.setAcademyLessonComplete(user.id, id, parsed.data.completed);
      res.status(204).end();
    },
  );

  // No real billing exists yet (see hasCoachesCornerAccess) -- this always
  // 402s so the client's paywall UX has a real endpoint to hit, the same
  // "Payments aren't live yet" stub shape as the Class lesson-purchase route.
  // (In practice this route is unreachable during the testingUnlockAllPaywalls
  // window -- the client only ever shows an "Unlock" button when
  // hasCoachesCornerAccess said no, and that already returns true for
  // everyone in that window -- but it's gated the same way anyway so every
  // 402 in the app answers to the one flag, not most of them.)
  app.post("/api/coach/academy/unlock", requireRole("coach"), async (_req, res) => {
    if (testingUnlockAllPaywalls) return res.status(204).end();
    res.status(402).json({ message: "Coaches Corner isn't open for purchase yet." });
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

  // ---------------- Admin: Forge Skill Bank ----------------
  // Same model as the exercise library above, but against the wholly
  // separate skillExercises table -- an admin's own drills are the Forge
  // skill library, shared read-only with every coach. Backs the drill
  // picker in the admin Class builder (see ClassBuilderPage), which had no
  // way to reach any skill exercise at all before this existed.

  app.get("/api/admin/skill-exercises", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getSkillExercisesByCoach(user.id);
    res.json(list);
  });

  app.get("/api/admin/skill-exercises/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const skillExercise = await storage.getSkillExerciseDetail(id, user.id);
    if (!skillExercise || skillExercise.coachId !== user.id) {
      return res.status(404).json({ message: "Skill exercise not found" });
    }
    res.json(skillExercise);
  });

  app.post("/api/admin/skill-exercises", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = insertSkillExerciseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const skillExercise = await storage.createSkillExercise(user.id, parsed.data);
    res.status(201).json(skillExercise);
  });

  app.put("/api/admin/skill-exercises/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertOwnsSkillExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Skill exercise not found" });
    const parsed = insertSkillExerciseSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateSkillExercise(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/admin/skill-exercises/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertOwnsSkillExercise(user.id, id);
    if (!owned) return res.status(404).json({ message: "Skill exercise not found" });
    await storage.deleteSkillExercise(id);
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

  // ---------------- Admin: Forge Classes ----------------
  // Same CRUD shape as the coach block above, but always creates a
  // Forge-official Class (isForgeOfficial: true) -- available to every
  // coach to assign AND the only kind a Free Agent can ever see or enroll
  // in. getVisibleClassesForCoach, called with an admin's own id, already
  // merges every admin's Forge classes together (there's no per-admin
  // ownership split, same reasoning as the Forge exercise/program library).

  app.get("/api/admin/classes", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    // getVisibleClassesForCoach computes `editable` off this admin's own
    // effective coach ids, same as it does for a coach caller -- which
    // would wrongly hide the delete action for a Forge Class a *different*
    // admin authored. Every row it returns for an admin caller is Forge-
    // official already (see getVisibleClassesForCoach's ownerIds), so
    // override to true across the board, matching the single-class GET
    // below and assertAdminOwnsForgeClass's "any admin, any Forge class" rule.
    const list = await storage.getVisibleClassesForCoach(user.id, true);
    res.json(list.map((c) => ({ ...c, editable: true })));
  });

  // Registered before the /:id route below so this literal path wins --
  // Express matches routes in registration order, and :id would otherwise
  // swallow "analytics" as an (invalid, NaN) id.
  app.get("/api/admin/classes/analytics", requireRole("admin"), async (_req, res) => {
    const analytics = await storage.getAdminClassAnalytics();
    res.json(analytics);
  });

  app.get("/api/admin/classes/:id", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const cls = await assertAdminOwnsForgeClass(id);
    if (!cls) return res.status(404).json({ message: "Class not found" });
    res.json({ ...cls, isForgeOfficial: true, ownerLabel: "FORGE", editable: true });
  });

  app.post("/api/admin/classes", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = classStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const cls = await storage.createClassWithStructure(user.id, parsed.data, true);
    res.status(201).json(cls);
  });

  app.put("/api/admin/classes/:id", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const owned = await assertAdminOwnsForgeClass(id);
    if (!owned) return res.status(404).json({ message: "Class not found" });
    const parsed = classStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.updateClassStructure(id, parsed.data);
    const updated = await storage.getClassFull(id);
    res.json(updated);
  });

  app.patch("/api/admin/classes/:id/publish", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const owned = await assertAdminOwnsForgeClass(id);
    if (!owned) return res.status(404).json({ message: "Class not found" });
    const schema = z.object({ isDraft: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.setClassDraftState(id, parsed.data.isDraft);
    if (!updated) return res.status(404).json({ message: "Class not found" });
    res.json(updated);
  });

  app.delete("/api/admin/classes/:id", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const owned = await assertAdminOwnsForgeClass(id);
    if (!owned) return res.status(404).json({ message: "Class not found" });
    const result = await storage.deleteClass(id);
    if (!result.deleted) {
      return res.status(409).json({
        message: `Can't delete -- ${result.enrolledCount} athlete${result.enrolledCount === 1 ? "" : "s"} enrolled. Unpublish it instead if you don't want new signups.`,
      });
    }
    res.status(204).end();
  });

  // ---------------- Admin: Coaches Corner ----------------
  // Authoring side of the coach-education bundle -- admins always see full
  // lesson content (no paywall check, they're the ones curating it). See
  // the coach-facing block above for the locked/unlocked catalog a regular
  // coach sees instead.
  app.get("/api/admin/academy/tracks", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const [tracks, completions] = await Promise.all([
      storage.getAllAcademyTracks(),
      storage.getAcademyCompletionsForCoach(user.id),
    ]);
    res.json(
      tracks.map((t) => ({
        ...t,
        lessons: t.lessons.map((l) => ({ ...l, completed: completions.has(l.id) })),
      })),
    );
  });

  app.get("/api/admin/academy/tracks/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const track = await storage.getAcademyTrackFull(id);
    if (!track) return res.status(404).json({ message: "Track not found" });
    const completions = await storage.getAcademyCompletionsForCoach(user.id);
    res.json({ ...track, lessons: track.lessons.map((l) => ({ ...l, completed: completions.has(l.id) })) });
  });

  app.post("/api/admin/academy/tracks", requireRole("admin"), async (req, res) => {
    const parsed = academyTrackStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const track = await storage.createAcademyTrackWithStructure(parsed.data);
    res.status(201).json(track);
  });

  app.put("/api/admin/academy/tracks/:id", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getAcademyTrackFull(id);
    if (!existing) return res.status(404).json({ message: "Track not found" });
    const parsed = academyTrackStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const updated = await storage.updateAcademyTrackStructure(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/admin/academy/tracks/:id", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getAcademyTrackFull(id);
    if (!existing) return res.status(404).json({ message: "Track not found" });
    await storage.deleteAcademyTrack(id);
    res.status(204).end();
  });

  app.post(
    "/api/admin/academy/lessons/:id/complete",
    requireRole("admin"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const schema = z.object({ completed: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      await storage.setAcademyLessonComplete(user.id, id, parsed.data.completed);
      res.status(204).end();
    },
  );

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
    if (!log) return res.status(404).json({ message: "Assignment not found" });
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

  // Cheap headcount tiles for the admin dashboard -- see
  // storage.getAdminPlatformStats' own comment for why this is separate
  // from the (much heavier) platform-trends aggregation above.
  app.get("/api/admin/platform-stats", requireRole("admin"), async (_req, res) => {
    const stats = await storage.getAdminPlatformStats();
    res.json(stats);
  });

  // Whether each optional, key-gated integration is actually configured
  // right now -- every boolean here already exists as a module-level export
  // (each integration resolves its own env vars to a boolean on import), so
  // this route only ever exposes those booleans, never a secret value.
  app.get("/api/admin/system-status", requireRole("admin"), async (_req, res) => {
    res.json({
      ai: aiEnabled,
      email: emailEnabled,
      webPush: pushEnabled,
      apns: apnsEnabled,
      usdaFoodLookup: usdaFoodLookupEnabled,
    });
  });

  // Storage-management page: every user-uploaded video currently on disk,
  // for an admin to review and prune -- see server/uploaded-files.ts and
  // storage.getAdminVideos' own comment for why this exists (Render's web
  // service disk is a fixed size, and nothing else in the app ever deletes
  // a video's underlying file on its own).
  app.get("/api/admin/videos", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const videos = await storage.getAdminVideos();
    // No single target athlete for a bulk list -- see recordAccessAuditLogs'
    // own schema comment on why targetAthleteId is nullable for exactly
    // this case.
    storage
      .logRecordAccess({
        userId: user.id,
        actionType: "viewed",
        resourceType: "admin_video_list",
        detail: `${videos.length} video(s) listed`,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      })
      .catch(() => {});
    res.json(videos);
  });

  app.delete("/api/admin/videos/:source/:id", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const source = req.params.source;
    if (source !== "set" && source !== "skill" && source !== "comment") {
      return res.status(400).json({ message: "Invalid video source" });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid video id" });
    const result = await storage.deleteAdminVideo(source, id);
    if (!result.deleted) return res.status(404).json({ message: "Video not found" });
    const justification = typeof req.body?.justification === "string" ? req.body.justification.trim() : undefined;
    await storage.logRecordAccess({
      userId: user.id,
      targetAthleteId: result.athleteId,
      actionType: "deleted",
      resourceType: `video:${source}`,
      resourceId: String(id),
      justification: justification || undefined,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.json({ success: true });
  });

  app.post("/api/admin/videos/bulk-delete", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const days = Number(req.body?.olderThanDays);
    if (!Number.isFinite(days) || days < 1) {
      return res.status(400).json({ message: "olderThanDays must be a positive number" });
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const count = await storage.bulkDeleteAdminVideosOlderThan(cutoff);
    await storage.logRecordAccess({
      userId: user.id,
      actionType: "deleted",
      resourceType: "admin_video_bulk_delete",
      detail: `${count} video(s) older than ${days} day(s) (cutoff ${cutoff.toISOString().slice(0, 10)})`,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.json({ count });
  });

  // Read view for the audit log itself -- see getRecordAccessAuditLog's own
  // comment for the honest, still-partial scope of what's instrumented.
  app.get("/api/admin/audit-log", requireRole("admin"), async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json(await storage.getRecordAccessAuditLog(limit));
  });

  app.get("/api/admin/audit-log.csv", requireRole("admin"), async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 1000, 5000);
    const rows = await storage.getRecordAccessAuditLog(limit);
    const header = ["Timestamp", "Staff", "Athlete", "Action", "Resource", "Detail", "Justification", "IP"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvField(r.createdAt.toISOString()),
          csvField(r.userName ?? `user #${r.userId}`),
          csvField(r.targetAthleteName ?? (r.targetAthleteId ? `user #${r.targetAthleteId}` : "")),
          csvField(r.actionType),
          csvField(r.resourceType),
          csvField(r.detail),
          csvField(r.justification),
          csvField(r.ipAddress),
        ].join(","),
      );
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="forge-audit-log.csv"`);
    res.send(lines.join("\n"));
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
      durationWeeks: z.number().int().min(1).max(12).default(1),
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
      parsed.data.durationWeeks,
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

  // Forge AI -- the central, per-entry knowledge base superseding the
  // single-document ai-knowledge/nutrition-knowledge chats above (kept
  // running until every AI feature is migrated to read from here instead).
  app.get("/api/admin/forge-ai", requireRole("admin"), async (_req, res) => {
    const result = await storage.getForgeAiChat();
    res.json(result);
  });

  app.post("/api/admin/forge-ai/chat", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = sendForgeAiChatMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid message" });
    const result = await storage.chatWithForgeAi(user.id, parsed.data.content, parsed.data.image);
    res.status(201).json(result);
  });

  // Commits an entry the chat above proposed -- the admin has seen it
  // client-side and is choosing to apply it. Nothing reaches
  // aiKnowledgeEntries (read platform-wide, once features are wired to it)
  // without this explicit step.
  app.post("/api/admin/forge-ai/apply", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const parsed = applyForgeAiEntryProposalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid entry" });
    const result = await storage.applyForgeAiEntryProposal(user.id, parsed.data);
    res.status(201).json(result);
  });

  app.post("/api/admin/forge-ai/entries/:id/deactivate", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });
    const parsed = deactivateForgeAiEntrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A reason is required" });
    const result = await storage.deactivateForgeAiEntry(user.id, id, parsed.data.reason);
    if (!result) return res.status(404).json({ message: "Entry not found" });
    res.json(result);
  });

  // Platform-wide aggregate athlete data -- every athlete across every
  // coach's roster, exact values, no names/teams/locations. Loaded on
  // demand from within the Forge AI page rather than eagerly, since it's
  // the first cross-coach data access in the app and each view is logged.
  app.get("/api/admin/compliance-report", requireRole("admin"), async (_req, res) => {
    res.json(await storage.getComplianceReportData());
  });

  app.get("/api/admin/compliance-report.pdf", requireRole("admin"), async (_req, res) => {
    const data = await storage.getComplianceReportData();
    const pdf = await buildComplianceReportPdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="forge-compliance-snapshot.pdf"`);
    res.send(pdf);
  });

  app.get("/api/admin/aggregate-athlete-data", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const result = await storage.getAggregateAthleteData(user.id);
    res.json(result);
  });

  // The Admin Query Engine -- multi-parametric filtering across the wider
  // set of redacted athlete data (see adminAthleteQueryFiltersSchema's own
  // comment). Same access-log audit trail as aggregate-athlete-data above.
  // ?format=csv streams the same rows as a download instead of JSON, for
  // dropping a filtered subset into Excel/R/Python.
  app.post("/api/admin/athletes/query", requireRole("admin"), async (req, res) => {
    const parsed = adminAthleteQueryFiltersSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid filters", issues: parsed.error.issues });
    const user = currentUser(req);
    const rows = await storage.queryAthletesAdvanced(user.id, parsed.data);
    if (req.query.format === "csv") {
      const header = Object.keys(rows[0] ?? { athleteId: 0 });
      const lines = [header.join(",")];
      for (const row of rows) {
        lines.push(header.map((k) => csvField((row as any)[k] ?? "")).join(","));
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="athlete-query-results.csv"`);
      return res.send(lines.join("\n"));
    }
    res.json(rows);
  });

  // Free-text front end for the same query -- the model only ever produces
  // the same typed filter object above (see translateNlqToAthleteFilters'
  // own comment for why that's the actual safety boundary, not a prompt
  // instruction). Returns the parsed filters alongside the results so the
  // UI can show the admin what it understood before they trust the list.
  app.post("/api/admin/athletes/query/nlq", requireRole("admin"), async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) return res.status(400).json({ message: "prompt is required" });
    const filters = await storage.translateNlqToAthleteFilters(prompt);
    if (!filters) {
      return res.status(422).json({ message: "Couldn't understand that search -- try the filter panel instead." });
    }
    const user = currentUser(req);
    const rows = await storage.queryAthletesAdvanced(user.id, filters);
    res.json({ filters, rows });
  });

  app.get("/api/admin/saved-views", requireRole("admin"), async (_req, res) => {
    res.json(await storage.listAdminSavedViews());
  });

  app.post("/api/admin/saved-views", requireRole("admin"), async (req, res) => {
    const parsed = createAdminSavedViewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid saved view", issues: parsed.error.issues });
    const user = currentUser(req);
    const view = await storage.createAdminSavedView(user.id, parsed.data);
    res.status(201).json(view);
  });

  app.delete("/api/admin/saved-views/:id", requireRole("admin"), async (req, res) => {
    await storage.deleteAdminSavedView(Number(req.params.id));
    res.json({ success: true });
  });

  // The clickwrap agreement every new coach/athlete accepts at signup (see
  // GET /api/legal-agreement above and signupSchema's agreedToTerms field).
  // A direct edit, not a propose-then-review chat flow like ai-knowledge
  // above -- this is a plain legal document an admin writes/pastes
  // themselves, not something an AI drafts. Never touches any existing
  // user's own agreedToTermsText snapshot -- only future signups see the
  // new text.
  app.put("/api/admin/legal-agreement", requireRole("admin"), async (req, res) => {
    const parsed = updateLegalAgreementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const content = await storage.updateLegalAgreement(parsed.data.content);
    res.json({ content });
  });

  // Draft Terms of Service / Privacy Policy -- see legalDocuments' own
  // schema comment: separate from legalAgreement above, not wired into
  // signup, purely for admin editing/printing/emailing pending real legal
  // review. docType is validated against the enum's two literal values
  // directly rather than a full zod schema, same weight as validating any
  // other route param.
  const LEGAL_DOC_TYPES = ["terms_of_service", "privacy_policy"] as const;
  type LegalDocType = (typeof LEGAL_DOC_TYPES)[number];
  const isLegalDocType = (v: string): v is LegalDocType => (LEGAL_DOC_TYPES as readonly string[]).includes(v);

  app.get("/api/admin/legal-documents", requireRole("admin"), async (_req, res) => {
    res.json(await storage.listLegalDocuments());
  });

  app.put("/api/admin/legal-documents/:type", requireRole("admin"), async (req, res) => {
    const type = String(req.params.type);
    if (!isLegalDocType(type)) return res.status(400).json({ message: "Invalid document type" });
    const parsed = updateLegalDocumentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const doc = await storage.updateLegalDocument(type, parsed.data.content);
    res.json(doc);
  });

  app.get("/api/admin/legal-documents/:type.pdf", requireRole("admin"), async (req, res) => {
    const type = String(req.params.type).replace(/\.pdf$/, "");
    if (!isLegalDocType(type)) return res.status(400).json({ message: "Invalid document type" });
    const doc = await storage.getLegalDocument(type);
    if (!doc) return res.status(404).json({ message: "Not found" });
    const title = type === "terms_of_service" ? "Forge -- Terms of Service (Draft)" : "Forge -- Privacy Policy (Draft)";
    const pdf = await buildLegalDocumentPdf(title, doc.content);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="forge-${type}.pdf"`);
    res.send(pdf);
  });

  app.post("/api/admin/legal-documents/:type/email", requireRole("admin"), async (req, res) => {
    const type = String(req.params.type);
    if (!isLegalDocType(type)) return res.status(400).json({ message: "Invalid document type" });
    const parsed = emailLegalDocumentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const doc = await storage.getLegalDocument(type);
    if (!doc) return res.status(404).json({ message: "Not found" });
    const title = type === "terms_of_service" ? "Forge Terms of Service (Draft)" : "Forge Privacy Policy (Draft)";
    const html = `<h2>${title}</h2><p style="white-space:pre-wrap;font-family:sans-serif;">${doc.content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</p>`;
    const result = await sendEmail({ to: parsed.data.to, subject: title, html });
    if (!result.sent) return res.status(502).json({ message: "Email not sent -- provider isn't configured." });
    res.json({ success: true });
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
    // athleteId is optional; generateProgramDraft (via getAuthorizedAthleteAiContext)
    // only reads that athlete's profile/analytics if it's the caller's own
    // id or a real roster relationship -- this now includes coach-only
    // health/ROM/asymmetry/ACWR data, so an unrelated id is a real
    // authorization boundary, not just best-effort personalization: it
    // resolves to no profile rather than an error, but never leaks another
    // coach's athlete data.
    const draft = await storage.generateProgramDraft(
      user.id,
      parsed.data.prompt,
      parsed.data.athleteId,
    );
    res.json(draft);
  });

  // Photo counterpart to ai-draft above -- same "draft + note" shape, same
  // client flow (create the real program from it, land in the builder to
  // review), just transcribed verbatim from a photo instead of generated
  // from a prompt. See generateProgramDraftFromPhoto's own comment for why
  // this doesn't share ai-draft's exercise-catalog-enum constraint.
  app.post("/api/coach/programs/photo-draft", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = z.object({ images: photoImagesSchema }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const draft = await storage.generateProgramDraftFromPhoto(user.id, parsed.data.images);
    if (!draft) return res.status(422).json({ message: "Couldn't read that photo -- try a clearer shot." });
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

  // ---------------- Coach: Roster & Teams ----------------

  // Coach-initiated counterpart to POST /api/auth/join-coach -- lets a coach
  // invite an existing Free Agent onto their roster by email instead of
  // asking that athlete to re-enter the coach's invite code. Sends a
  // pending request the athlete has to accept, rather than linking them
  // immediately -- see storage.sendFreeAgentRequest.
  app.post("/api/coach/roster/add-free-agent", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!email) return res.status(400).json({ message: "Enter an email address" });
    const result = await storage.sendFreeAgentRequest(user.id, email);
    if (!result.ok) {
      const messages = {
        not_found: "No athlete account found with that email.",
        not_athlete: "That account isn't an athlete.",
        already_coached: "That athlete already has a coach.",
        already_pending: "You've already sent that athlete an invite.",
      };
      return res.status(400).json({ message: messages[result.reason] });
    }
    res.json({ athleteName: result.athleteName });
  });

  app.get("/api/coach/roster", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const roster = await storage.getRosterForCoach(user.id);
    res.json(roster);
  });

  // Today-only "goal vs hit" summary for every roster athlete at once --
  // powers the Nutrition tab's list view. Full history/editing per athlete
  // still goes through /api/coach/roster/:athleteId/nutrition + /food-log.
  app.get("/api/coach/nutrition-summary", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const summary = await storage.getNutritionSummaryForRoster(user.id);
    res.json(summary);
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

  app.delete("/api/coach/roster/:athleteId", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = Number(req.params.athleteId);
    const removed = await storage.removeAthleteFromCoach(user.id, athleteId);
    if (!removed) return res.status(404).json({ message: "Athlete not found" });
    res.status(204).end();
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

  // Guardian-notice flag + acknowledgment -- see GUARDIAN_NOTICE_LIVE's own
  // comment in shared/privacy-tiers.ts. Gated here too, not just at the
  // notification-send call site: "flagged" comes back false while the
  // feature is off regardless of the athlete's real requiresGuardianNotice
  // value, so the badge these feed has nothing to show yet either.
  app.get(
    "/api/coach/roster/:athleteId/guardian-notice",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      if (!GUARDIAN_NOTICE_LIVE) return res.json({ flagged: false, acknowledgedAt: null });
      res.json(await storage.getGuardianNoticeStatus(athleteId));
    },
  );

  app.post(
    "/api/coach/roster/:athleteId/guardian-notice/acknowledge",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      if (!GUARDIAN_NOTICE_LIVE) return res.status(400).json({ message: "Not available yet" });
      await storage.acknowledgeGuardianNotice(athleteId, user.id);
      res.json(await storage.getGuardianNoticeStatus(athleteId));
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

  // Goniometer (joint ROM) readings -- see shared/goniometer.ts for the
  // joint/movement taxonomy and normal-range reference these compare
  // against client-side.
  app.get(
    "/api/coach/roster/:athleteId/goniometer",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const history = await storage.getGoniometerHistoryForAthlete(athleteId);
      res.json(history);
    },
  );

  app.post(
    "/api/coach/roster/:athleteId/goniometer",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const parsed = insertGoniometerReadingSchema.safeParse({ ...req.body, athleteId });
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const reading = await storage.createGoniometerReading(user.id, parsed.data);
      res.status(201).json(reading);
    },
  );

  app.delete(
    "/api/coach/roster/:athleteId/goniometer/:readingId",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      await storage.deleteGoniometerReading(athleteId, Number(req.params.readingId));
      res.status(204).end();
    },
  );

  // Movement Screen -- see shared/movement-screen.ts and storage.ts's own
  // comments for the data model and ownership/forking rules.
  app.get("/api/coach/movement-screens/batteries", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const batteries = await storage.getMovementScreenBatteries(user.id);
    res.json(batteries);
  });

  app.get("/api/coach/movement-screens/batteries/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const detail = await storage.getMovementScreenBatteryDetail(user.id, Number(req.params.id));
    if (!detail) return res.status(404).json({ message: "Battery not found" });
    res.json(detail);
  });

  app.post("/api/coach/movement-screens/batteries/:id/fork", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const name = typeof req.body?.name === "string" ? req.body.name : undefined;
    const battery = await storage.forkMovementScreenBattery(user.id, Number(req.params.id), name);
    if (!battery) return res.status(404).json({ message: "Battery not found" });
    res.status(201).json(battery);
  });

  app.put("/api/coach/movement-screens/batteries/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = updateMovementScreenBatterySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const battery = await storage.updateMovementScreenBattery(user.id, Number(req.params.id), parsed.data);
    if (!battery) return res.status(404).json({ message: "Battery not found, or it's the Forge-official one -- fork it first" });
    res.json(battery);
  });

  app.delete("/api/coach/movement-screens/batteries/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const ok = await storage.deleteMovementScreenBattery(user.id, Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Battery not found, or it's the Forge-official one" });
    res.status(204).end();
  });

  app.get("/api/coach/movement-screens/batteries/:id/print.pdf", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const detail = await storage.getMovementScreenBatteryDetail(user.id, Number(req.params.id));
    if (!detail) return res.status(404).json({ message: "Battery not found" });
    const pdf = await buildMovementScreenSheetPdf(detail.battery.name, detail.tests);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${detail.battery.name.replace(/[^a-z0-9]+/gi, "-")}.pdf"`);
    res.send(pdf);
  });

  app.post("/api/coach/movement-screens/batteries/:id/analyze-photo", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = z.object({ images: photoImagesSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const result = await storage.analyzeMovementScreenPhoto(user.id, Number(req.params.id), parsed.data.images);
    if ("error" in result) return res.status(422).json({ message: result.error });
    res.json(result);
  });

  app.get("/api/coach/roster/:athleteId/movement-screens", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const screens = await storage.getMovementScreensForAthlete(user.id, Number(req.params.athleteId));
    if (screens === null) return res.status(404).json({ message: "Athlete not found" });
    res.json(screens);
  });

  app.post("/api/coach/roster/:athleteId/movement-screens", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = createMovementScreenSchema.safeParse({ ...req.body, athleteId: Number(req.params.athleteId) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const screen = await storage.createMovementScreen(user.id, parsed.data);
    if (!screen) return res.status(404).json({ message: "Athlete not found" });
    res.status(201).json(screen);
  });

  app.get("/api/coach/movement-screens/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const detail = await storage.getMovementScreenDetail(user.id, Number(req.params.id));
    if (!detail) return res.status(404).json({ message: "Screen not found" });
    res.json(detail);
  });

  // Admin-only, redacted (no name/team, exact score values) -- see
  // getAggregateMovementScreenData's own comment; same access-log audit
  // trail as /api/admin/aggregate-athlete-data.
  app.get("/api/admin/movement-screens/aggregate", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const result = await storage.getAggregateMovementScreenData(user.id);
    res.json(result);
  });

  // Injury history -- a coach can view and log entries for their own
  // roster athlete, same roster-scoped pattern as goniometer readings
  // above. The athlete's own /api/athlete/injury-history routes cover
  // self-logging.
  app.get(
    "/api/coach/roster/:athleteId/injury-history",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const history = await storage.getInjuryHistoryForAthlete(athleteId);
      res.json(history);
    },
  );

  app.post(
    "/api/coach/roster/:athleteId/injury-history",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const parsed = submitInjurySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const entry = await storage.addInjuryHistoryEntry(athleteId, parsed.data);
      res.status(201).json(entry);
    },
  );

  app.delete(
    "/api/coach/roster/:athleteId/injury-history/:id",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      await storage.deleteInjuryHistoryEntry(athleteId, Number(req.params.id));
      res.status(204).end();
    },
  );

  // ---------- Photo import (bulk roster intake from a photographed sheet) ----------
  // Every pair below follows the same shape: analyze-photo returns rows for
  // the coach to review and edit client-side (never writes anything by
  // itself), apply commits exactly what the coach confirmed. apply always
  // re-derives the caller's real roster server-side and drops any athleteId
  // that isn't actually on it -- the client's row data is never trusted for
  // authorization, only for content.

  app.post("/api/coach/roster/testing-day/analyze-photo", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = z.object({ images: photoImagesSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const result = await storage.analyzeTestingDayPhoto(user.id, parsed.data.images);
    if ("error" in result) return res.status(422).json({ message: result.error });
    res.json(result);
  });

  app.post("/api/coach/roster/testing-day/apply", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      updates: z.array(
        z.object({
          athleteId: z.number(),
          fortyYardDash: z.number().min(0).max(20).optional().nullable(),
          verticalJumpIn: z.number().min(0).max(60).optional().nullable(),
          broadJumpIn: z.number().min(0).max(200).optional().nullable(),
          proAgilitySeconds: z.number().min(0).max(20).optional().nullable(),
          benchMaxLbs: z.number().min(0).max(1500).optional().nullable(),
          squatMaxLbs: z.number().min(0).max(1500).optional().nullable(),
          deadliftMaxLbs: z.number().min(0).max(1500).optional().nullable(),
        }),
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const roster = await storage.getRosterForCoach(user.id);
    const validIds = new Set(roster.map((a) => a.id));
    let applied = 0;
    for (const { athleteId, ...fields } of parsed.data.updates) {
      if (!validIds.has(athleteId)) continue;
      await storage.updateUserProfile(athleteId, fields);
      applied++;
    }
    res.json({ applied });
  });

  app.post("/api/coach/roster/weigh-in/analyze-photo", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = z.object({ images: photoImagesSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const result = await storage.analyzeWeighInPhoto(user.id, parsed.data.images);
    if ("error" in result) return res.status(422).json({ message: result.error });
    res.json(result);
  });

  app.post("/api/coach/roster/weigh-in/apply", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      entries: z.array(
        z.object({
          athleteId: z.number(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
          weight: z.number().positive().max(1500),
          weightUnit: z.enum(["lbs", "kg"]),
        }),
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const roster = await storage.getRosterForCoach(user.id);
    const validIds = new Set(roster.map((a) => a.id));
    let applied = 0;
    for (const { athleteId, ...entry } of parsed.data.entries) {
      if (!validIds.has(athleteId)) continue;
      await storage.createBodyMetric(athleteId, entry);
      applied++;
    }
    res.json({ applied });
  });

  app.post("/api/coach/roster/nutrition/analyze-photo", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = z.object({ images: photoImagesSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const result = await storage.analyzeNutritionSheetPhoto(user.id, parsed.data.images);
    if ("error" in result) return res.status(422).json({ message: result.error });
    res.json(result);
  });

  app.post("/api/coach/roster/nutrition/apply", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      updates: z.array(
        z.object({
          athleteId: z.number(),
          caloriesKcal: z.number().int().min(0).max(20000).optional().nullable(),
          proteinG: z.number().min(0).max(1000).optional().nullable(),
          carbsG: z.number().min(0).max(2000).optional().nullable(),
          fatG: z.number().min(0).max(1000).optional().nullable(),
          fiberG: z.number().min(0).max(300).optional().nullable(),
          sodiumMg: z.number().min(0).max(20000).optional().nullable(),
          notes: z.string().trim().max(1000).optional().nullable(),
        }),
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const roster = await storage.getRosterForCoach(user.id);
    const validIds = new Set(roster.map((a) => a.id));
    let applied = 0;
    for (const { athleteId, ...fields } of parsed.data.updates) {
      if (!validIds.has(athleteId)) continue;
      await storage.upsertNutritionTargets(athleteId, user.id, fields);
      applied++;
    }
    res.json({ applied });
  });

  app.post("/api/coach/roster/injury-intake/analyze-photo", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = z.object({ images: photoImagesSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const result = await storage.analyzeInjuryIntakePhoto(user.id, parsed.data.images);
    if ("error" in result) return res.status(422).json({ message: result.error });
    res.json(result);
  });

  app.post("/api/coach/roster/injury-intake/apply", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      entries: z.array(
        z.object({
          athleteId: z.number(),
          bodyPart: z.string().trim().min(1).max(60),
          occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
          description: z.string().trim().max(500).optional().nullable(),
        }),
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const roster = await storage.getRosterForCoach(user.id);
    const validIds = new Set(roster.map((a) => a.id));
    let applied = 0;
    for (const { athleteId, ...entry } of parsed.data.entries) {
      if (!validIds.has(athleteId)) continue;
      await storage.addInjuryHistoryEntry(athleteId, entry);
      applied++;
    }
    res.json({ applied });
  });

  // OVR/Perch (velocity-based training device) printout/screen import --
  // see importedTestingData's schema comment for why this lands as its own
  // reviewable log instead of being wired into a program's tracked sets.
  app.post("/api/coach/roster/testing-data-import/analyze-photo", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = z.object({ images: photoImagesSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const result = await storage.analyzeImportedTestingDataPhoto(user.id, parsed.data.images);
    if ("error" in result) return res.status(422).json({ message: result.error });
    res.json(result);
  });

  app.post("/api/coach/roster/testing-data-import/apply", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      rows: z.array(
        z.object({
          athleteId: z.number(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
          exerciseName: z.string().trim().min(1).max(120),
          setNumber: z.number().int().min(1).max(50).optional().nullable(),
          loadLbs: z.number().min(0).max(2000).optional().nullable(),
          velocityMps: z.number().min(0).max(10).optional().nullable(),
          powerWatts: z.number().min(0).max(20000).optional().nullable(),
        }),
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const roster = await storage.getRosterForCoach(user.id);
    const created = await storage.createImportedTestingDataRows(
      roster.map((a) => a.id),
      user.id,
      parsed.data.rows,
    );
    res.status(201).json({ applied: created.length });
  });

  app.get(
    "/api/coach/roster/:athleteId/testing-data-import",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const rows = await storage.getImportedTestingDataForAthlete(user.id, Number(req.params.athleteId));
      if (rows === null) return res.status(404).json({ message: "Athlete not found" });
      res.json(rows);
    },
  );

  // Player inflow sheet -- see provisionalAthletes' schema comment for why
  // this creates provisional slots instead of live accounts. No roster to
  // match against (these are new people), so analyze-photo just returns
  // raw candidates for the coach to review before any slot is created.
  app.post("/api/coach/roster/player-intake/analyze-photo", requireRole("coach"), async (req, res) => {
    const parsed = z.object({ images: photoImagesSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const result = await storage.analyzePlayerIntakePhoto(parsed.data.images);
    if ("error" in result) return res.status(422).json({ message: result.error });
    res.json(result);
  });

  app.post("/api/coach/roster/player-intake/apply", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      rows: z.array(
        z.object({
          name: z.string().trim().min(1).max(100),
          heightIn: z.number().min(0).max(120).optional().nullable(),
          bodyWeightLbs: z.number().min(0).max(1500).optional().nullable(),
          age: z.number().int().min(0).max(120).optional().nullable(),
          gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional().nullable(),
          sport: z.string().trim().max(60).optional().nullable(),
          position: z.string().trim().max(60).optional().nullable(),
        }),
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const created = await storage.createProvisionalAthletes(user.id, parsed.data.rows);
    res.status(201).json(created);
  });

  app.get("/api/coach/roster/provisional", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const rows = await storage.getProvisionalAthletesForCoach(user.id);
    res.json(rows);
  });

  app.delete("/api/coach/roster/provisional/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    await storage.deleteProvisionalAthlete(user.id, Number(req.params.id));
    res.status(204).end();
  });

  // AI weakness-identification report -- analyzes whatever goniometer/
  // asymmetry/ACWR/wellness/testing data already exists for one roster
  // athlete. Coach-side generation is ungated (same as every other coach
  // AI feature -- see hasCoachesCornerAccess/requirePaidAiAccess's own
  // comment on why coach routes never hit the Free-Agent paywall), but the
  // read route below is shared with the athlete's own view of it.
  app.post(
    "/api/coach/roster/:athleteId/weakness-report",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const report = await storage.generateWeaknessReport(athleteId, user.id);
      if (!report) {
        return res
          .status(422)
          .json({ message: "Not enough PT/S&C data logged yet to generate a report." });
      }
      res.status(201).json(report);
    },
  );

  app.get(
    "/api/coach/roster/:athleteId/weakness-reports",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const reports = await storage.getWeaknessReportsForAthlete(athleteId);
      res.json(reports);
    },
  );

  // A coached athlete can read their own reports, whoever generated them --
  // this is the "provide detailed data to the patient" half of the feature.
  // A Free Agent gets nothing here: this is clinical-adjacent PT/S&C data
  // (goniometer, asymmetry, load flags), and unlike the rest of the
  // Free-Agent-only AI surface, Forge wants a coach reading and contextualizing
  // it with the athlete rather than the AI handing a deficit list straight to
  // someone training unsupervised. If this athlete had reports from a past
  // coach relationship, those rows are never deleted (see weaknessReports'
  // own comment -- keyed on athleteId, no coachId), so they resurface here
  // automatically the moment a new coach picks this athlete up.
  app.get("/api/athlete/weakness-reports", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coaches = await storage.getCoachesForAthlete(user.id);
    if (coaches.length === 0) return res.json([]);
    const reports = await storage.getWeaknessReportsForAthlete(user.id);
    res.json(reports);
  });

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
    const list = await storage.getGoalsForAthlete(athleteId, req.query.history === "true");
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
      await storage.archiveGoal(athleteId, Number(req.params.goalId));
      res.status(204).end();
    },
  );

  // Skills-side clip review -- entirely separate from the strength-side
  // form-check video thread (see the comment on skillSessionLogs.videoUrl).
  // Only sessions where the athlete opted in to saving a clip show up here.
  app.get(
    "/api/coach/roster/:athleteId/skill-sessions",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const sessions = await storage.getSkillSessionsWithVideoForCoachAthlete(user.id, athleteId);
      res.json(sessions);
    },
  );

  // Numbers counterpart to skill-sessions above -- EVERY session (video or
  // not), with the actual sprint/mechanics metrics, for the analytics
  // page's Skills tab. Until this existed, a captured session's numbers
  // (splits/speed, hip-shoulder separation, weight transfer, rotation,
  // sequencing) were computed, saved, and then never read back anywhere --
  // only the raw clip (when one was opted into) was ever visible again.
  app.get(
    "/api/coach/roster/:athleteId/skill-session-history",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const sessions = await storage.getSkillSessionHistoryForCoachAthlete(user.id, athleteId);
      res.json(sessions);
    },
  );

  // Strength-side counterpart to skill-sessions above -- every per-set
  // form-check clip this athlete has recorded, across every exercise at
  // once. Feeds the analytics page's unified Videos tab; the two lists are
  // merged client-side rather than here since they're wholly separate
  // tables with no shared key to join on.
  app.get(
    "/api/coach/roster/:athleteId/form-check-videos",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const athleteId = Number(req.params.athleteId);
      const onRoster = await storage.getRosterAthleteForCoach(user.id, athleteId);
      if (!onRoster) return res.status(404).json({ message: "Athlete not found" });
      const videos = await storage.getFormCheckVideosForCoachAthlete(user.id, athleteId);
      res.json(videos);
    },
  );

  // Persists the imageUrl VideoAnnotationDialog hands back after the coach
  // draws on a paused frame -- that dialog and its /api/coach/annotations
  // PNG-decode route are both reused as-is, this is the one Skills-specific
  // piece: where the resulting URL actually gets saved.
  app.patch(
    "/api/coach/skill-sessions/:id/annotation",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const parsed = setSkillSessionAnnotationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const updated = await storage.setSkillSessionAnnotation(
        user.id,
        Number(req.params.id),
        parsed.data.imageUrl,
      );
      if (!updated) return res.status(404).json({ message: "Skill session not found" });
      res.json(updated);
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

  // Coach-adjustable sensitivity for the Skills camera tracker's fault
  // detection (sprint-tracking.ts, mechanics-tracking.ts) -- see
  // shared/skill-fault-thresholds.ts for the full field set and why these
  // exist. isCustomized tells the settings UI whether to show a "reset to
  // defaults" affordance.
  app.get("/api/coach/skill-fault-thresholds", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const result = await storage.getSkillFaultThresholdsForCoach(user.id);
    res.json(result);
  });

  app.put("/api/coach/skill-fault-thresholds", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = updateSkillFaultThresholdsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const effective = await storage.updateSkillFaultThresholdsForCoach(user.id, parsed.data);
    res.json({ effective, isCustomized: true });
  });

  app.delete("/api/coach/skill-fault-thresholds", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const effective = await storage.resetSkillFaultThresholdsForCoach(user.id);
    res.json({ effective, isCustomized: false });
  });

  // ---------------- Team branding + feature toggles (white-label) ----------------

  // Any logged-in role -- a coach reads their own team's settings, an
  // athlete reads their coach's, an admin (or a Free Agent with no coach
  // yet) gets the unbranded default. See getEffectiveBrandingForUser's own
  // comment in storage.ts for the full resolution.
  // Unauthenticated on purpose -- backs the branded signup link/QR (see
  // TeamInviteCard in coach/dashboard.tsx and signup.tsx), which by
  // definition has to work before anyone's logged in. The invite code
  // itself is already exposed pre-auth the same way (it's typed into the
  // signup form), so this exposes nothing new -- only the cosmetic
  // branding fields, never anything else about the coach account.
  app.get("/api/public/branding/:code", async (req, res) => {
    const branding = await storage.getCoachBrandingByCode(String(req.params.code));
    res.json(
      branding ?? { teamName: null, logoUrl: null, primaryColor: null, secondaryColor: null },
    );
  });

  app.get("/api/branding/me", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const branding = await storage.getEffectiveBrandingForUser(user.id, user.role);
    res.json(branding);
  });

  app.get("/api/coach/branding", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const [branding, features] = await Promise.all([
      storage.getCoachBranding(user.id),
      storage.getCoachFeatures(user.id),
    ]);
    res.json({ ...branding, features });
  });

  app.put("/api/coach/branding", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = updateCoachBrandingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const branding = await storage.updateCoachBranding(user.id, parsed.data);
    res.json(branding);
  });

  app.post("/api/coach/branding/logo", requireRole("coach"), (req, res) => {
    uploadTeamLogo.single("logo")(req, res, async (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        return res.status(400).json({ message });
      }
      if (!req.file) return res.status(400).json({ message: "No image file provided" });
      const user = currentUser(req);
      const branding = await storage.updateCoachLogo(user.id, `/uploads/team-logos/${req.file.filename}`);
      res.status(201).json(branding);
    });
  });

  app.delete("/api/coach/branding/logo", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const branding = await storage.updateCoachLogo(user.id, null);
    res.json(branding);
  });

  app.put("/api/coach/features", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = updateCoachFeaturesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const effective = await storage.updateCoachFeatures(user.id, parsed.data);
    res.json(effective);
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
      const schema = z.object({ days: z.coerce.number().min(14).max(180).optional() });
      const parsed = schema.safeParse(req.query);
      const history = await storage.getAcwrHistoryForAthlete(
        athleteId,
        parsed.success ? parsed.data.days : undefined,
      );
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
      const schema = z.object({ weeks: z.coerce.number().min(4).max(52).optional() });
      const parsed = schema.safeParse(req.query);
      const series = await storage.getWeeklyLoadForAthlete(
        user.id,
        athleteId,
        parsed.success ? parsed.data.weeks : undefined,
      );
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
    // addAthleteToTeam does no validation of its own -- without this, any
    // coach could add an arbitrary user id (another coach's athlete, a Free
    // Agent) to their team, and every team view from then on (roster list,
    // challenges progress, microcycle plan) leaks that athlete's real name
    // and training data to a coach who was never actually assigned to them.
    const roster = await storage.getRosterForCoach(user.id);
    if (!roster.some((a) => a.id === parsed.data.athleteId)) {
      return res.status(400).json({ message: "Athlete not on your roster" });
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
      parsed.data.durationWeeks,
    );
    res.status(201).json(result);
  });

  app.get("/api/coach/assignments/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const assignment = await storage.getAssignmentForCoach(user.id, id);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });
    res.json(assignment);
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

  // ---------------- Coach: My Training ----------------
  // A coach programming and logging their OWN lifts -- same self-assignment
  // pattern as /api/admin/my/* (an assignments row with coachId === athleteId,
  // no schema change needed), reusing the same role-agnostic storage
  // functions an athlete uses. getCalendarForCoach already includes these
  // rows (tagged isSelfAssigned) in the coach's own /api/coach/calendar
  // response, so the athlete-style /my/day and /my/log endpoints below exist
  // only to let the coach open and log their own entries from that same
  // calendar -- there's no separate "my calendar" page the way admin has one.

  app.get("/api/coach/my/day", requireRole("coach"), async (req, res) => {
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

  app.post("/api/coach/my/log", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = submitWorkoutLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const log = await storage.submitWorkoutLog(user.id, parsed.data);
    if (!log) return res.status(404).json({ message: "Assignment not found" });
    res.status(200).json(log);
  });

  // Self-assignment: coachId and athleteId are both the coach's own id.
  // Deliberately bypasses the roster-membership check /api/coach/assignments
  // enforces -- a coach is never on their own roster, so that check would
  // always fail here. getProgramIfUsableByCoach already covers the real
  // authorization question: their own program, or any Forge-official one.
  app.post("/api/coach/my/assignments", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      programId: z.number(),
      startDate: z.string(),
      durationWeeks: z.number().int().min(1).max(12).default(1),
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
      parsed.data.durationWeeks,
    );
    res.status(201).json(result);
  });

  app.get("/api/coach/day-briefing", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ date: z.string() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "date query param required" });
    }
    const briefing = await storage.getDayBriefingForCoach(user.id, parsed.data.date);
    res.json(briefing);
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
      await notifyUser(owned.athleteId, hasVideo ? "video" : "comment", title, body, "/athlete/calendar");

      res.status(201).json(comment);
    },
  );

  // Exact mirror of the two routes above, for a skill day instead of a
  // strength program day -- see the schema comment on skillDayComments.
  app.get(
    "/api/coach/skill-assignments/:assignmentId/days/:skillProgramDayId/comments",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const skillProgramDayId = Number(req.params.skillProgramDayId);
      const owned = await storage.getSkillAssignmentForCoach(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Skill assignment not found" });
      const comments = await storage.getSkillDayComments(assignmentId, skillProgramDayId);
      res.json(comments);
    },
  );

  app.post(
    "/api/coach/skill-assignments/:assignmentId/days/:skillProgramDayId/comments",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const skillProgramDayId = Number(req.params.skillProgramDayId);
      const owned = await storage.getSkillAssignmentForCoach(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Skill assignment not found" });
      const parsed = createSkillDayCommentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const comment = await storage.addSkillDayComment(assignmentId, skillProgramDayId, user.id, parsed.data);

      const hasVideo = !!parsed.data.videoUrl || !!parsed.data.imageUrl;
      const title = hasVideo ? "New video from your coach" : "New comment from your coach";
      const body = `${user.name}: ${parsed.data.body}`;
      await notifyUser(owned.athleteId, hasVideo ? "video" : "comment", title, body, "/athlete/calendar");

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

  app.get("/api/coach/analytics/skill-exercises", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ athleteId: z.coerce.number() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "athleteId query param required" });
    }
    const list = await storage.getSkillExercisesWithHistoryForCoachAthlete(user.id, parsed.data.athleteId);
    res.json(list);
  });

  app.get("/api/coach/analytics/overview", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      athleteId: z.coerce.number(),
      limit: z.coerce.number().min(1).max(200).optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "athleteId query param required" });
    }
    const sessions = await storage.getRecentSessionsForAthlete(
      user.id,
      parsed.data.athleteId,
      parsed.data.limit,
    );
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

  // Speed & Agility leaderboard -- Skills-side, same shape and ownership
  // rules as the strength leaderboard above but entirely separate queries
  // (skillSessionLogs only), per the data-isolation requirement.
  app.get("/api/coach/leaderboard/skill-exercises", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getSpeedLeaderboardExercisesForCoach(user.id);
    res.json(list);
  });

  app.get("/api/coach/leaderboard/speed", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ skillExerciseId: z.coerce.number() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "skillExerciseId query param required" });
    }
    const rows = await storage.getSpeedLeaderboardForExercise(user.id, parsed.data.skillExerciseId);
    res.json(rows);
  });

  // ---------------- Athlete ----------------

  app.get("/api/athlete/coaches", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coaches = await storage.getCoachesForAthlete(user.id);
    res.json(coaches);
  });

  // Pending coach invites this athlete can accept or decline -- see
  // storage.sendFreeAgentRequest for why a coach can never link an athlete
  // without this consent step.
  app.get("/api/athlete/coach-requests", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const requests = await storage.getPendingCoachRequestsForAthlete(user.id);
    res.json(requests);
  });

  app.post(
    "/api/athlete/coach-requests/:requestId/respond",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const requestId = Number(req.params.requestId);
      const accept = req.body?.accept === true;
      const result = await storage.respondToCoachAthleteRequest(user.id, requestId, accept);
      if (!result.ok) {
        const messages = {
          not_found: "That invite isn't available anymore.",
          already_coached: "You already have a coach, so this invite was declined.",
        };
        return res.status(400).json({ message: messages[result.reason] });
      }
      res.status(204).end();
    },
  );

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

  // Nutrition goal -- the nutrition AI's one-time (until reset) "what are
  // you trying to do" questionnaire. Free-Agent-only, same as the ask box
  // it personalizes (a coached athlete's nutrition plan is their coach's
  // call, not a self-serve AI goal). GET returns null goal to mean "hasn't
  // answered yet," which is exactly what the client uses to decide whether
  // to show the questionnaire instead of the normal ask UI.
  app.get(
    "/api/athlete/nutrition/goal",
    requireRole("athlete"),
    requireFreeAgent,
    async (req, res) => {
      const user = currentUser(req);
      const goal = await storage.getNutritionGoalForAthlete(user.id);
      res.json(goal ?? { nutritionGoal: null, nutritionGoalNote: null });
    },
  );

  app.post(
    "/api/athlete/nutrition/goal",
    requireRole("athlete"),
    requireFreeAgent,
    async (req, res) => {
      const user = currentUser(req);
      const parsed = setNutritionGoalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const goal = await storage.setNutritionGoalForAthlete(user.id, parsed.data);
      res.status(201).json(goal);
    },
  );

  // "Set new goal" -- wipes the stored answer so the questionnaire re-shows
  // next time the athlete opens Nutrition, without touching their numeric
  // targets or food log.
  app.delete(
    "/api/athlete/nutrition/goal",
    requireRole("athlete"),
    requireFreeAgent,
    async (req, res) => {
      const user = currentUser(req);
      const goal = await storage.resetNutritionGoalForAthlete(user.id);
      res.json(goal);
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

  app.patch("/api/athlete/food-log/:id", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const parsed = updateFoodLogEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const entry = await storage.updateFoodLogEntry(user.id, id, parsed.data);
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    res.json(entry);
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

  // Uncapped version of the Progress page's Recent PRs card (which only
  // shows the top 5) -- backs the "View Full History" page.
  app.get("/api/athlete/pr-history", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const history = await storage.getFullPrHistoryForAthlete(user.id);
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

  app.get("/api/athlete/skill-exercises-with-history", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getSkillExercisesWithHistoryForAthlete(user.id);
    res.json(list);
  });

  // Suggests an existing corrective for a fault flagged during a Skills
  // sprint/mechanics capture -- see getSuggestedCorrectivesForFault's
  // comment for why this is the one deliberate bridge back to the
  // strength-side exercises table.
  app.get("/api/athlete/suggested-correctives", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ faultCode: z.string().min(1) });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "faultCode query param required" });
    }
    const list = await storage.getSuggestedCorrectivesForFault(user.id, parsed.data.faultCode);
    res.json(list);
  });

  // Fetched by the sprint/mechanics tracker dialogs right before scoring a
  // capture -- resolves to whichever coach owns this skill assignment, so
  // an athlete always gets their own coach's sensitivity settings, never a
  // guessed one. Falls back to the built-in defaults transparently (see
  // resolveSkillFaultThresholds) when the coach never customized anything.
  app.get("/api/athlete/skill-fault-thresholds", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ skillAssignmentId: z.coerce.number() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "skillAssignmentId query param required" });
    }
    const thresholds = await storage.getSkillFaultThresholdsForAssignment(
      user.id,
      parsed.data.skillAssignmentId,
    );
    if (!thresholds) return res.status(404).json({ message: "Skill assignment not found" });
    res.json(thresholds);
  });

  app.get("/api/athlete/goals", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getGoalsForAthlete(user.id, req.query.history === "true");
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
    await storage.archiveGoal(user.id, Number(req.params.id));
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

  // Injury history -- every athlete, coached or Free Agent, can log their
  // own (a coach can also log one for a roster athlete via the roster route
  // below). Feeds getAthleteAiContext so every AI bot -- program builder,
  // nutrition, readiness, form-check -- knows about it, not just whichever
  // one the athlete happens to mention it to.
  app.get("/api/athlete/injury-history", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const history = await storage.getInjuryHistoryForAthlete(user.id);
    res.json(history);
  });

  app.post("/api/athlete/injury-history", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = submitInjurySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const entry = await storage.addInjuryHistoryEntry(user.id, parsed.data);
    res.status(201).json(entry);
  });

  app.patch("/api/athlete/injury-history/:id", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ resolved: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "resolved must be true or false" });
    }
    const entry = await storage.setInjuryResolved(user.id, Number(req.params.id), parsed.data.resolved);
    if (!entry) return res.status(404).json({ message: "Injury entry not found" });
    res.json(entry);
  });

  app.delete("/api/athlete/injury-history/:id", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    await storage.deleteInjuryHistoryEntry(user.id, Number(req.params.id));
    res.status(204).end();
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
    requirePaidAiAccess("strengthAi"),
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
    requirePaidAiAccess("strengthAi"),
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

  // Lightweight version of the above -- just exercise names + sets/reps, no
  // logging state or history -- backs the Calendar Today view's inline
  // expand, so tapping to peek at a workout doesn't navigate away from the
  // calendar at all.
  app.get("/api/athlete/day-preview", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({
      assignmentId: z.coerce.number(),
      programDayId: z.coerce.number(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Missing or invalid query params" });
    }
    const preview = await storage.getWorkoutDayPreview(
      user.id,
      parsed.data.assignmentId,
      parsed.data.programDayId,
    );
    if (!preview) return res.status(404).json({ message: "Workout not found" });
    res.json(preview);
  });

  // Skill-day view -- the day's plan, plus (when ?date= is given) that
  // occurrence's completion state. date is optional since the coach-preview
  // path through SkillDayViewDialog has none to give (it's previewing the
  // program's structure, not one athlete's specific occurrence of it).
  app.get(
    "/api/athlete/skill-day/:skillAssignmentId/:skillProgramDayId",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const date = typeof req.query.date === "string" ? req.query.date : undefined;
      const detail = await storage.getSkillDayForAthlete(
        user.id,
        Number(req.params.skillAssignmentId),
        Number(req.params.skillProgramDayId),
        date,
      );
      if (!detail) return res.status(404).json({ message: "Skill session not found" });
      res.json(detail);
    },
  );

  app.post(
    "/api/athlete/skill-day/:skillAssignmentId/:skillProgramDayId/complete",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const parsed = setSkillDayCompleteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const log = await storage.setSkillDayComplete(
        user.id,
        Number(req.params.skillAssignmentId),
        Number(req.params.skillProgramDayId),
        parsed.data.date,
        parsed.data.completed,
      );
      if (!log) return res.status(404).json({ message: "Skill assignment not found" });
      res.status(200).json(log);
    },
  );

  app.get(
    "/api/athlete/skill-assignments/:assignmentId/days/:skillProgramDayId/comments",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const skillProgramDayId = Number(req.params.skillProgramDayId);
      const owned = await storage.getSkillAssignmentForAthlete(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Skill assignment not found" });
      const comments = await storage.getSkillDayComments(assignmentId, skillProgramDayId);
      res.json(comments);
    },
  );

  app.post(
    "/api/athlete/skill-assignments/:assignmentId/days/:skillProgramDayId/comments",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const assignmentId = Number(req.params.assignmentId);
      const skillProgramDayId = Number(req.params.skillProgramDayId);
      const owned = await storage.getSkillAssignmentForAthlete(user.id, assignmentId);
      if (!owned) return res.status(404).json({ message: "Skill assignment not found" });
      const parsed = createSkillDayCommentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const comment = await storage.addSkillDayComment(assignmentId, skillProgramDayId, user.id, parsed.data);

      // Same "self-assigned has nobody to notify" guard as the sprint/
      // mechanics fault notification below -- a Free Agent's own skill
      // program (or self-enrolled Class lesson) stores their own id as
      // coachId, so there's no real coach on the other end of this thread.
      if (owned.coachId !== user.id) {
        const hasVideo = !!parsed.data.videoUrl || !!parsed.data.imageUrl;
        const title = hasVideo ? "New video from an athlete" : "New comment from an athlete";
        const body = `${user.name}: ${parsed.data.body}`;
        await notifyUser(owned.coachId, hasVideo ? "video" : "comment", title, body, "/coach/roster");
      }

      res.status(201).json(comment);
    },
  );

  // ---------------- Athlete: skill camera sessions (sprint/agility) ----------------
  app.post("/api/athlete/skill-session-logs", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const parsed = createSkillSessionLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    // Confirms this assignment is actually the requesting athlete's own --
    // getSkillDayForAthlete already does this same check for reads, this is
    // the write-path equivalent so a session log can't be attributed to an
    // assignment/day/exercise that isn't really this athlete's.
    const detail = await storage.getSkillDayForAthlete(
      user.id,
      parsed.data.skillAssignmentId,
      parsed.data.skillProgramDayId,
    );
    if (!detail) return res.status(404).json({ message: "Skill session not found" });
    const log = await storage.createSkillSessionLog(user.id, parsed.data);

    // Same "flag it for the coach" treatment the strength side's leg-drive
    // asymmetry check gets (see evaluateLegDriveAsymmetryFlags below) -- a
    // captured session's faults are already a whole-capture aggregate read
    // (detectSprintFaults/detectMechanicsFaults run against the full
    // capture, not a single noisy frame), so each faulted session is its
    // own notification-worthy event, the same per-submission granularity
    // leg_asymmetry uses rather than needing its own multi-session
    // consistency check.
    if (parsed.data.faults && parsed.data.faults.length > 0) {
      const coachId = await storage.getSkillAssignmentCoachId(parsed.data.skillAssignmentId);
      // A Free Agent's self-assigned program (or a self-enrolled Class
      // lesson) stores the athlete's own id as coachId -- see the comment on
      // POST /api/athlete/my/skill-assignments. Nobody to notify in that
      // case: notifyUser(coachId) would tell the athlete about themselves in
      // the third person and link to /coach/analytics, a route their own
      // role can't open.
      if (coachId && coachId !== user.id) {
        const exerciseName =
          detail.exercises.find((e) => e.id === parsed.data.skillProgramExerciseId)?.name ?? "a drill";
        const body = parsed.data.faults.map((f) => f.label).join("; ");
        await notifyUser(
          coachId,
          "skill_fault",
          `${user.name} showed a mechanics flag on ${exerciseName}`,
          body,
          "/coach/analytics",
        );
      }
    }

    res.status(201).json(log);
  });

  app.get("/api/athlete/skill-session-logs", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const schema = z.object({ skillProgramExerciseId: z.coerce.number() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "skillProgramExerciseId query param required" });
    }
    const logs = await storage.getSkillSessionLogsForExercise(user.id, parsed.data.skillProgramExerciseId);
    res.json(logs);
  });

  // Opt-in only -- the athlete explicitly taps "save clip for coach" on the
  // mechanics or sprint tracker's review screen (see
  // MechanicsTrackerDialog's privacy comment); a session that's never opted
  // into never reaches this route at all. Returns the URL to attach as
  // videoUrl on the skill-session-log POST above.
  app.post(
    "/api/athlete/skill-video",
    requireRole("athlete"),
    (req, res) => {
      uploadSkillVideo.single("video")(req, res, (err: unknown) => {
        if (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          return res.status(400).json({ message });
        }
        if (!req.file) {
          return res.status(400).json({ message: "No video file provided" });
        }
        res.status(201).json({ url: `/uploads/skill-videos/${req.file.filename}` });
      });
    },
  );

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
    if (!log) return res.status(404).json({ message: "Assignment not found" });
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
    // Same treatment as skill-session faults (see POST
    // /api/athlete/skill-session-logs) -- strength-side form faults
    // previously only ever surfaced if a coach happened to open the set
    // itself.
    const formFaultFlag = await storage.evaluateFormFaultFlags(parsed.data.assignmentId, parsed.data.entries);
    if (formFaultFlag) {
      const body = formFaultFlag.flags.map((f) => `${f.exerciseName}: ${f.faultLabels.join("; ")}`).join(" · ");
      await notifyUser(
        formFaultFlag.coachId,
        "form_fault",
        `${user.name} had a form flag today`,
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
      // A bare "/coach/calendar" link landed the coach on whatever day the
      // calendar happened to default to (today), not the day this comment
      // is actually about -- easy to read as "broken" when the athlete
      // backfilled a past date, since nothing relevant shows up. Carrying
      // the day's identity lets the calendar page open straight to it (see
      // the query-param handling in coach/calendar.tsx).
      const link =
        `/coach/calendar?assignmentId=${assignmentId}&programDayId=${programDayId}` +
        `&athleteId=${user.id}&athleteName=${encodeURIComponent(user.name)}`;
      await notifyUser(owned.coachId, hasVideo ? "video" : "comment", title, body, link);

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

  app.get("/api/athlete/exercises/:id", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const exercise = await storage.getExerciseDetail(id, user.id);
    if (!exercise || (!exercise.isForgeOfficial && !exercise.editable)) {
      return res.status(404).json({ message: "Exercise not found" });
    }
    res.json(exercise);
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
    requirePaidAiAccess("strengthAi"),
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
    requirePaidAiAccess("strengthAi"),
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
    requirePaidAiAccess("strengthAi"),
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
    requirePaidAiAccess("strengthAi"),
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
    requirePaidAiAccess("strengthAi"),
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
      durationWeeks: z.number().int().min(1).max(12).default(1),
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
      parsed.data.durationWeeks,
    );
    res.status(201).json(result);
  });

  // ---------------- Athlete: Conversational AI skills program builder (Free Agent) ----------------
  // Exact mirror of the strength self-service block above -- same
  // requireFreeAgent gate, same plain-CRUD-free/AI-paywalled split -- but
  // against skillPrograms/skillExercises and gated behind "skillsAi"
  // instead of "strengthAi", since paying for one never unlocks the other.
  app.get("/api/athlete/skill-exercises", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getVisibleSkillExercisesForCoach(user.id);
    res.json(list);
  });

  app.get(
    "/api/athlete/skill-exercises/:id",
    requireRole("athlete"),
    requireFreeAgent,
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const skillExercise = await storage.getSkillExerciseDetail(id, user.id);
      if (!skillExercise || (!skillExercise.isForgeOfficial && !skillExercise.editable)) {
        return res.status(404).json({ message: "Skill exercise not found" });
      }
      res.json(skillExercise);
    },
  );

  app.get("/api/athlete/skill-programs", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getVisibleSkillProgramsForCoach(user.id);
    res.json(list);
  });

  app.get("/api/athlete/skill-programs/:id", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const program = await assertCoachOwnsSkillProgram(user.id, id);
    if (!program) return res.status(404).json({ message: "Skill program not found" });
    res.json({ ...program, isForgeOfficial: false, ownerLabel: "YOU", editable: true });
  });

  app.post("/api/athlete/skill-programs", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const parsed = skillProgramStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    const program = await storage.createSkillProgramWithStructure(user.id, parsed.data);
    res.status(201).json(program);
  });

  app.post(
    "/api/athlete/skill-programs/ai-draft",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess("skillsAi"),
    async (req, res) => {
      const user = currentUser(req);
      const parsed = generateProgramDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const draft = await storage.generateSkillProgramDraft(user.id, parsed.data.prompt, user.id);
      res.json(draft);
    },
  );

  app.put("/api/athlete/skill-programs/:id", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsSkillProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Skill program not found" });
    const parsed = skillProgramStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.updateSkillProgramStructure(id, parsed.data);
    const updated = await storage.getSkillProgramFull(id);
    res.json(updated);
  });

  app.delete("/api/athlete/skill-programs/:id", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const owned = await assertCoachOwnsSkillProgram(user.id, id);
    if (!owned) return res.status(404).json({ message: "Skill program not found" });
    await storage.deleteSkillProgram(id);
    res.status(204).end();
  });

  app.get(
    "/api/athlete/skill-programs/:id/chat",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess("skillsAi"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const owned = await assertCoachOwnsSkillProgram(user.id, id);
      if (!owned) return res.status(404).json({ message: "Skill program not found" });
      const messages = await storage.getSkillProgramChatMessages(id);
      res.json(messages);
    },
  );

  app.post(
    "/api/athlete/skill-programs/:id/chat",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess("skillsAi"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const owned = await assertCoachOwnsSkillProgram(user.id, id);
      if (!owned) return res.status(404).json({ message: "Skill program not found" });
      const parsed = sendSkillProgramChatMessageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid message" });
      const result = await storage.generateSkillProgramFromChat(id, user.id, parsed.data.content);
      res.status(201).json(result);
    },
  );

  // "Full function" AI skill form check -- exact mirror of the strength
  // side's /api/athlete/programs/:id/form-check above (see
  // storage.submitSkillFormCheck for why this is the one place the AI
  // critiques technique with no human review step).
  app.post(
    "/api/athlete/skill-programs/:id/form-check",
    requireRole("athlete"),
    requireFreeAgent,
    requirePaidAiAccess("skillsAi"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const owned = await assertCoachOwnsSkillProgram(user.id, id);
      if (!owned) return res.status(404).json({ message: "Skill program not found" });
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
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const result = await storage.submitSkillFormCheck(id, user.id, parsed.data.exerciseName, parsed.data.images);
      if (!result) return res.status(400).json({ message: "This skill program isn't AI-authored yet" });
      res.status(201).json(result);
    },
  );

  // Self-assignment: coachId and athleteId are both this athlete's own id.
  // Same bypass reasoning as /api/athlete/my/assignments above.
  app.post(
    "/api/athlete/my/skill-assignments",
    requireRole("athlete"),
    requireFreeAgent,
    async (req, res) => {
      const user = currentUser(req);
      const schema = z.object({
        skillProgramId: z.number(),
        startDate: z.string(),
        durationWeeks: z.number().int().min(1).max(12).default(1),
        dateOverrides: z.record(z.string(), z.string()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const usable = await storage.getSkillProgramIfUsableByCoach(user.id, parsed.data.skillProgramId);
      if (!usable) return res.status(404).json({ message: "Skill program not found" });

      const result = await storage.createSkillAssignment(
        user.id,
        parsed.data.skillProgramId,
        [{ athleteId: user.id }],
        parsed.data.startDate,
        parsed.data.dateOverrides,
        parsed.data.durationWeeks,
      );
      res.status(201).json(result);
    },
  );

  // ---------------- Athlete: Classes ----------------
  // Unlike the AI Coach, a Class is NOT Free-Agent-exclusive -- a coach can
  // enroll their own roster into their own (or a Forge) Class, and that
  // athlete needs to see their progress regardless of having a coach. Only
  // browsing the Forge catalog to self-enroll, and paying for a lesson, are
  // Free-Agent-only (a coach's own athlete never sees a price, and never
  // self-enrolls in something their coach didn't put them in). Never gated
  // behind requirePaidAiAccess -- Classes are a wholly separate product from
  // the AI Coach ("a scheduled thing" vs. "a self guided thing").

  app.get("/api/athlete/my-classes", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getEnrolledClassesForAthlete(user.id);
    res.json(list);
  });

  // Free Agent only -- the Forge catalog to browse and self-enroll into.
  app.get("/api/athlete/classes", requireRole("athlete"), requireFreeAgent, async (req, res) => {
    const user = currentUser(req);
    const list = await storage.getVisibleClassesForFreeAgent(user.id);
    res.json(list);
  });

  app.get("/api/athlete/classes/:id/progress", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const enrollment = await storage.getClassEnrollmentForAthlete(user.id, id);
    if (!enrollment) {
      // Not enrolled -- only a Free Agent browsing the Forge catalog gets a
      // preview of a class they haven't joined yet.
      const coaches = await storage.getCoachesForAthlete(user.id);
      if (coaches.length > 0) return res.status(404).json({ message: "Class not found" });
    } else {
      // This is the one place an automatic (time/reps/sessions) unlock
      // actually gets detected, since nothing runs on a schedule -- the
      // athlete opening their own progress page IS the trigger.
      const newlyUnlocked = await storage.recomputeClassProgress(enrollment.id);
      await notifyNewlyUnlockedLessons(newlyUnlocked);
    }
    const progress = await storage.getClassProgressForAthlete(user.id, id);
    if (!progress || (!enrollment && !progress.class.isForgeOfficial)) {
      return res.status(404).json({ message: "Class not found" });
    }
    res.json(progress);
  });

  app.post(
    "/api/athlete/classes/:id/enroll",
    requireRole("athlete"),
    requireFreeAgent,
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const parsed = enrollInClassSchema.safeParse({ ...req.body, classId: id });
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      const cls = await storage.getClassById(id);
      if (!cls || !cls.isForgeOfficial) {
        return res.status(404).json({ message: "Class not found" });
      }
      if (cls.isDraft) {
        return res.status(404).json({ message: "Class not found" });
      }
      const prereq = await storage.isClassPrerequisiteSatisfied(user.id, id);
      if (!prereq.satisfied) {
        return res
          .status(400)
          .json({ message: `Complete "${prereq.prerequisiteName}" before enrolling in this class.` });
      }
      const { enrollment, newlyUnlocked } = await storage.enrollSelfInClass(
        user.id,
        id,
        parsed.data.startDate,
      );
      await notifyNewlyUnlockedLessons(newlyUnlocked);
      res.status(201).json(enrollment);
    },
  );

  app.post(
    "/api/athlete/classes/:id/lessons/:lessonId/purchase",
    requireRole("athlete"),
    requireFreeAgent,
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const lessonId = Number(req.params.lessonId);
      if (!testingUnlockAllPaywalls && user.email !== COMPED_FREE_AGENT_LESSON_BUYER) {
        return res.status(402).json({
          message: "Lesson purchases aren't live yet -- payments are coming soon.",
          freeAgentPaywall: true,
        });
      }
      const enrollment = await storage.getClassEnrollmentForAthlete(user.id, id);
      if (!enrollment) return res.status(404).json({ message: "Not enrolled in this class" });
      const newlyUnlocked = await storage.markLessonPurchased(enrollment.id, lessonId);
      await notifyNewlyUnlockedLessons(newlyUnlocked);
      const progress = await storage.getClassProgressForAthlete(user.id, id);
      res.json(progress);
    },
  );

  app.get(
    "/api/athlete/classes/:id/lessons/:lessonId/content",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const lessonId = Number(req.params.lessonId);
      const enrollment = await requireReadableClassLesson(user.id, id, lessonId);
      if (!enrollment) return res.status(404).json({ message: "Lesson not found" });
      const content = await storage.getClassLessonContent(lessonId);
      if (!content) return res.status(404).json({ message: "Lesson not found" });
      res.json(content);
    },
  );

  app.post(
    "/api/athlete/classes/:id/lessons/:lessonId/content/complete",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const lessonId = Number(req.params.lessonId);
      const enrollment = await requireReadableClassLesson(user.id, id, lessonId);
      if (!enrollment) return res.status(404).json({ message: "Lesson not found" });
      const { notifyCoach } = await storage.markClassLessonContentCompleted(enrollment.id, lessonId);
      if (notifyCoach) {
        await notifyUser(
          notifyCoach.coachId,
          "class_completed",
          "Class completed!",
          `${notifyCoach.athleteName} just finished every lesson in ${notifyCoach.className}.`,
          `/coach/classes/${notifyCoach.classId}`,
        );
      }
      const progress = await storage.getClassProgressForAthlete(user.id, id);
      res.json(progress);
    },
  );

  app.post(
    "/api/athlete/classes/:id/lessons/:lessonId/quiz/submit",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const lessonId = Number(req.params.lessonId);
      const enrollment = await requireReadableClassLesson(user.id, id, lessonId);
      if (!enrollment) return res.status(404).json({ message: "Lesson not found" });
      const schema = z.object({
        answers: z.array(z.object({ questionId: z.number(), answerId: z.number() })),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message });
      }
      try {
        const result = await storage.submitClassLessonQuiz(enrollment.id, lessonId, parsed.data.answers);
        if (result.completedNotify) {
          const n = result.completedNotify;
          await notifyUser(
            n.coachId,
            "class_completed",
            "Class completed!",
            `${n.athleteName} just finished every lesson in ${n.className}.`,
            `/coach/classes/${n.classId}`,
          );
        } else if (result.stuckNotify) {
          const n = result.stuckNotify;
          await notifyUser(
            n.coachId,
            "class_quiz_stuck",
            "Athlete could use a hand",
            `${n.athleteName} hasn't passed the Lesson ${n.lessonNumber} (${n.lessonTitle}) quiz in ${n.className} after several tries.`,
            `/coach/classes/${n.classId}`,
          );
        }
        res.json(result);
      } catch (err) {
        res.status(400).json({ message: err instanceof Error ? err.message : "Could not submit quiz" });
      }
    },
  );

  // "Add to Calendar" -- only ever clickable client-side once content and
  // the quiz are both done, but re-verified fully server-side regardless
  // (see activateClassLesson).
  app.post(
    "/api/athlete/classes/:id/lessons/:lessonId/activate",
    requireRole("athlete"),
    async (req, res) => {
      const user = currentUser(req);
      const id = Number(req.params.id);
      const lessonId = Number(req.params.lessonId);
      const enrollment = await storage.getClassEnrollmentForAthlete(user.id, id);
      if (!enrollment) return res.status(404).json({ message: "Not enrolled in this class" });
      try {
        const newlyUnlocked = await storage.activateClassLesson(enrollment.id, lessonId);
        await notifyNewlyUnlockedLessons(newlyUnlocked);
        const progress = await storage.getClassProgressForAthlete(user.id, id);
        res.json(progress);
      } catch (err) {
        res.status(400).json({ message: err instanceof Error ? err.message : "Could not add this lesson to your calendar" });
      }
    },
  );

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

  // Native (APNs) twin of the two routes above -- same shape, a device
  // token instead of a Web Push subscription. apnsEnabled mirrors
  // getVapidPublicKey()'s already-established "tell the client up front so
  // it doesn't bother registering" pattern.
  app.get("/api/push/apns-enabled", requireAuth, async (req, res) => {
    res.json({ enabled: apnsEnabled });
  });

  app.post("/api/push/subscribe-apns", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const parsed = apnsSubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.saveApnsToken(user.id, parsed.data.deviceToken);
    res.status(204).end();
  });

  app.post("/api/push/unsubscribe-apns", requireAuth, async (req, res) => {
    const schema = z.object({ deviceToken: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    }
    await storage.removeApnsToken(parsed.data.deviceToken);
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
