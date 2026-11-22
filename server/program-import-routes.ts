/* eslint-disable ts-patterns/no-magic-numbers -- written in this repo's own style; gating is pinned by program-import.itest.ts */
/**
 * The routes for "Import a program" (see server/program-import.ts for what an import does).
 *
 * One route per builder: the coach's, the admin's and a Free Agent's. Each reads the reader's own
 * exercise library, hands the file to draftProgramFromUpload and returns the draft. Nothing is
 * written. The gates are the ones every AI route of that role already carries, passed in from
 * routes.ts so there is one definition of each.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import multer from "multer";
import { requireRole } from "./auth";
import { storage } from "./storage";
import { MAX_IMPORT_BYTES, draftProgramFromUpload } from "./program-import";
import { roomForActor } from "./equipment-room";
import { roomAllows } from "@shared/exercise-needs";
import type { EquipmentRoom } from "@shared/equipment-profile";
import type { ImportMatch, LibraryExercise } from "@shared/program-import";

function currentUser(req: Request) {
  return req.user as { id: number; role: "coach" | "athlete" | "admin" | "guardian"; email: string };
}

// ---------------------------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
});

/** Multer's own errors (too large, wrong field) as a sentence rather than the generic 500. */
const receiveFile: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    const message = code === "LIMIT_FILE_SIZE"
      ? "That file is over 15 MB. For a photo, a normal phone picture is plenty; for a workbook, save just the program's sheet."
      : "Forge couldn't receive that file. Choose it again and retry.";
    res.status(400).json({ message });
  });
};

function toLibrary(rows: Array<{ id: number; name: string; category?: string | null; muscleGroup?: string | null; equipment?: string | null; videoEligible?: boolean | null }>): LibraryExercise[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category ?? null,
    muscleGroup: r.muscleGroup ?? null,
    equipment: r.equipment ?? null,
    videoEligible: r.videoEligible ?? null,
  }));
}

async function handleImport(req: Request, res: Response, library: LibraryExercise[]) {
  const file = req.file;
  if (!file) return res.status(400).json({ message: "Choose a file to import: an Excel file, a CSV, a PDF or a photo of the program." });
  const result = await draftProgramFromUpload(file.buffer, file.originalname ?? "", library);
  if (!result.ok) return res.status(result.status).json({ message: result.message, importRefused: true });
  // THE ROOM (2026-11-21): a row the coach wrote is kept as written whatever the room has (the
  // review dialog marks it); for a row that needs a decision, what the room can do is offered first.
  const room = await roomForActor(currentUser(req).id);
  return res.json(suggestionsRoomFirst(result.draft, room));
}

export function suggestionsRoomFirst<D extends { days: Array<{ exercises: Array<{ match: ImportMatch }> }> }>(draft: D, room: EquipmentRoom | null): D {
  if (!room) return draft;
  return {
    ...draft,
    days: draft.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((row) =>
        row.match.status === "flagged"
          ? { ...row, match: { ...row.match, suggestions: [...row.match.suggestions].sort((a, b) => Number(roomAllows(b, room)) - Number(roomAllows(a, room))) } }
          : row,
      ),
    })),
  };
}

export type ProgramImportGates = {
  requireActiveCoachPlan: RequestHandler;
  requireFreeAgent: RequestHandler;
  requirePaidAiAccess: (entitlement: "strengthAi") => RequestHandler;
};

export function registerProgramImportRoutes(app: Express, gates: ProgramImportGates): void {
  app.post(
    "/api/coach/programs/import-draft",
    requireRole("coach"),
    gates.requireActiveCoachPlan,
    receiveFile,
    async (req, res) => {
      const user = currentUser(req);
      await handleImport(req, res, toLibrary(await storage.getVisibleExercisesForCoach(user.id)));
    },
  );

  app.post("/api/admin/programs/import-draft", requireRole("admin"), receiveFile, async (req, res) => {
    const user = currentUser(req);
    await handleImport(req, res, toLibrary(await storage.getExercisesByCoach(user.id, { includeAllAdmins: true })));
  });

  // A coached athlete is refused by requireFreeAgent (their coach builds their program); a Free
  // Agent needs the AI coach on their plan.
  app.post(
    "/api/athlete/programs/import-draft",
    requireRole("athlete"),
    gates.requireFreeAgent,
    gates.requirePaidAiAccess("strengthAi"),
    receiveFile,
    async (req, res) => {
      const user = currentUser(req);
      await handleImport(req, res, toLibrary(await storage.getVisibleExercisesForCoach(user.id)));
    },
  );
}
