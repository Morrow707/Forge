/* eslint-disable ts-patterns/no-magic-numbers -- HTTP statuses and upload limits are named at the top; the behaviour is pinned by weight-room-sheets.itest.ts */
/* WEIGHT-ROOM SHEETS, the server half (2026-11-21). The rules are in shared/weight-room-sheet.ts
 * and the drawing in server/weight-room-sheet-pdf.ts; this file reads the day, saves the coach's
 * layout, prints the PDF, reads a filled sheet back, and logs it.
 *
 * PRINTING. A coach programs one group workout for a team and prints it; every athlete on the team
 * gets a row with their own numbers and nobody types anything. The roster is the station's
 * (weight-room.ts `stationAthletes`): the team has to be the coach's, the athlete on it, in the
 * coach's scope and in season. The day's data is read with SET-BASED queries for the whole roster
 * (one for the assignments, one for the day, one for every logged set of every lift), never one
 * per athlete, so a 120-athlete football roster costs what a 12-athlete one does. Names and
 * numbers on a printout come from Forge's data, never from a model.
 *
 * READING A FILLED SHEET. A photo or PDF of ANY sheet (ours, a whiteboard, a notebook page) goes
 * to the model through a forced tool call, which only TRANSCRIBES: names as written, lifts as
 * written, each set cell as written, the coach notes strip and any custom column. Forge then
 * matches names against the in-scope roster on that team only (so an athlete outside the coach's
 * scope can never be matched), lifts against the day's own lifts, and parses each cell itself.
 * Nothing is guessed: an ambiguous name or lift is listed with its candidates. Several photos or
 * a multi-page PDF in any order are merged by sheet code and athlete.
 *
 * LOGGING. Nothing is written until the coach presses Log on the review. Each athlete's sets go
 * through storage.submitWorkoutLog, the athlete's own save path, merged over what the day already
 * holds (weight-room-merge.ts), at the day's current revision. A set already logged on the
 * athlete's phone -- above all a filmed one -- is never overwritten and is reported as skipped. An
 * athlete with no assignment that day is reported as needing one; the station refuses that too,
 * so no assignment is invented. Attendance comes from the numbers alone: a set written on the
 * sheet is "present", nothing written is "not marked", never "absent".
 */
import { resolveWarmupBlock } from "./program-day-warmup";
import { warmupItemLine } from "@shared/program-day-warmup";
import type { Express, Request, RequestHandler, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { formatISO } from "date-fns";
import { db } from "./db";
import { requireRole } from "./auth";
import { leaderboardDisplayName, storage, StaleWorkoutLogError, assignmentWeekOccurrences, resolveAssignmentDate } from "./storage";
import { aiEnabled, askClaudeFileStructured, askClaudeStructured } from "./ai";
import { ImportFileError, identifyUpload, type ImportSource } from "./program-import";
import { emailAssetOrigin } from "./email-branding";
import { pdfBrandForCoach } from "./pdf-brand";
import { renderSheetPdf } from "./weight-room-sheet-pdf";
import { assertOwnsTeam, documentGate, stationAthletes, storedEntriesOf } from "./weight-room";
import { mergeStationSets, setWasFilmed, type StationSet } from "./weight-room-merge";
import {
  assignments,
  programDays,
  programExercises,
  weightRoomSheetLayouts,
  weightRoomSheetPrints,
  weightRoomSheetUploads,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
  type WeightRoomSheetUpload,
} from "@shared/schema";
import {
  DEFAULT_SHEET_LAYOUT,
  buildSheet,
  decodeSheetCode,
  matchAthleteName,
  matchLift,
  parseSetCell,
  prescriptionChanges,
  prescriptionVersion,
  presenceFromSets,
  sheetDayEditsSchema,
  sheetLayoutSchema,
  type LoggedSet,
  type SheetAttendance,
  type SheetLayout,
  type SheetSource,
  type SheetSourceAthlete,
  type SheetSourceLift,
  type WeightUnit,
} from "@shared/weight-room-sheet";
import { resolveRosterGroups } from "@shared/roster-groups";
import { ownTrainingCalendarRoute } from "@shared/own-training-routes";
import { sideForNewSet } from "@shared/unilateral-sides";
import { PERIODIZATION_PHASE_LABEL } from "@shared/schema";

const HTTP = { ok: 200, badRequest: 400, notFound: 404, conflict: 409, unprocessable: 422, unavailable: 503 } as const;
const ISO_DATE_LENGTH = 10;
const MAX_FILES = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_SETS_PER_ROW = 200;
const TEXT_MAX = 500;
const STALE_RETRIES = 2;

function currentUser(req: Request) {
  return req.user as { id: number; role: string; name: string };
}

// An ISO calendar day: matches "2026-11-21"; rejects "11/21/2026" and "2026-11-21T09:00".
// https://regex101.com/?regex=%5E%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7D%24&testString=2026-11-21
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = z.string().regex(ISO_DAY);

/* ================================================================ which athletes have the day */

type DayOccurrence = { athleteId: number; assignmentId: number; programDayId: number; title: string; programName: string };

/** Every program day the roster has on `date`, from ONE query over all their assignments. Only
 * assignments made by this coach's program count: a sheet prints the program's workout. */
async function occurrencesOn(coachId: number, athleteIds: number[], date: string): Promise<DayOccurrence[]> {
  if (athleteIds.length === 0) return [];
  const coachIds = await storage.getEffectiveCoachIds(coachId);
  const rows = await db.query.assignments.findMany({
    where: and(inArray(assignments.athleteId, athleteIds), inArray(assignments.coachId, coachIds)),
    with: { program: { with: { weeks: { with: { days: true } } } } },
  });
  return rows.flatMap((a) =>
    Array.from(assignmentWeekOccurrences(a.program.weeks, a.durationWeeks)).flatMap(({ week, calendarWeekNumber, isFirstCycle }) =>
      week.days
        .filter((day) => !day.isRestDay)
        .filter((day) => formatISO(resolveAssignmentDate(a, calendarWeekNumber, day.dayNumber, day.id, isFirstCycle), { representation: "date" }) === date)
        .map((day) => ({ athleteId: a.athleteId, assignmentId: a.id, programDayId: day.id, title: day.title, programName: a.program.name })),
    ),
  );
}

export type DayChoice = { programDayId: number; title: string; programName: string; athletes: number };

function dayChoices(occurrences: DayOccurrence[]): DayChoice[] {
  const byDay = new Map<number, DayChoice>();
  occurrences.forEach((o) => {
    const existing = byDay.get(o.programDayId);
    byDay.set(o.programDayId, { programDayId: o.programDayId, title: o.title, programName: o.programName, athletes: (existing?.athletes ?? 0) + 1 });
  });
  return Array.from(byDay.values()).sort((a, b) => b.athletes - a.athletes || a.programDayId - b.programDayId);
}

/* ================================================================ the day and the roster's numbers */

/** Tested maxes on the profile are three named lifts, in lb. */
const TESTED_MAX_BY_NAME: Record<string, "squatMaxLbs" | "benchMaxLbs" | "deadliftMaxLbs"> = {
  "back squat": "squatMaxLbs",
  squat: "squatMaxLbs",
  "bench press": "benchMaxLbs",
  bench: "benchMaxLbs",
  deadlift: "deadliftMaxLbs",
  "conventional deadlift": "deadliftMaxLbs",
};

async function loadDay(programDayId: number) {
  return db.query.programDays.findFirst({
    where: eq(programDays.id, programDayId),
    with: {
      exercises: { orderBy: asc(programExercises.orderIndex), with: { exercise: true } },
      week: { with: { block: true, program: { with: { weeks: { columns: { id: true } } } } } },
    },
  });
}
type LoadedDay = NonNullable<Awaited<ReturnType<typeof loadDay>>>;

function liftsOf(day: LoadedDay): SheetSourceLift[] {
  return day.exercises.map((pe) => ({
    programExerciseId: pe.id,
    exerciseId: pe.exercise.id,
    name: pe.exercise.name,
    sets: pe.sets,
    reps: pe.reps,
    weight: pe.weight ?? null,
    restSeconds: pe.restSeconds ?? null,
    notes: pe.notes ?? null,
    category: pe.exercise.category ?? null,
    movementType: pe.exercise.movementType ?? null,
    equipment: pe.exercise.equipment ?? null,
    laterality: pe.exercise.laterality ?? null,
    usesWeight: pe.exercise.usesWeight,
    usesBodyweight: pe.exercise.usesBodyweight,
    supersetGroup: pe.supersetGroup ?? null,
    restAfterGroupOnly: pe.restAfterGroupOnly,
  }));
}

function phaseLineOf(day: LoadedDay): { line: string | null; lighter: boolean } {
  const totalWeeks = day.week.program.weeks.length;
  const block = day.week.block;
  const phase = block?.phase ? PERIODIZATION_PHASE_LABEL[block.phase] : null;
  const name = block?.name?.trim() || phase;
  const week = totalWeeks > 1 ? `week ${day.week.weekNumber} of ${totalWeeks}` : null;
  const line = [name, week].filter(Boolean).join(", ");
  return { line: line ? line.charAt(0).toUpperCase() + line.slice(1) : null, lighter: block?.phase === "deload" };
}

/** Every logged set of every lift on the day, for the whole roster, before the sheet's date. ONE
 * query. Only weight and reps are read; no camera number ever reaches a sheet. */
async function historyFor(athleteIds: number[], exerciseIds: number[], before: string) {
  if (athleteIds.length === 0 || exerciseIds.length === 0) return [];
  return db
    .select({
      athleteId: workoutLogs.athleteId,
      exerciseId: workoutLogEntries.exerciseId,
      date: workoutLogs.date,
      reps: workoutSetEntries.reps,
      weight: workoutSetEntries.weight,
      weightUnit: workoutSetEntries.weightUnit,
      weightMode: workoutLogEntries.weightMode,
    })
    .from(workoutSetEntries)
    .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .where(and(inArray(workoutLogs.athleteId, athleteIds), inArray(workoutLogEntries.exerciseId, exerciseIds), lt(workoutLogs.date, before)));
}

export type SheetDayData = {
  source: SheetSource | null;
  days: DayChoice[];
  layout: SheetLayout;
  brand: { teamName: string | null; primaryColor: string | null; logoUrl: string | null };
};

async function savedLayout(coachId: number, teamId: number): Promise<SheetLayout> {
  const row = await db.query.weightRoomSheetLayouts.findFirst({
    where: and(eq(weightRoomSheetLayouts.coachId, coachId), eq(weightRoomSheetLayouts.teamId, teamId)),
  });
  const parsed = sheetLayoutSchema.safeParse(row?.layout ?? {});
  return parsed.success ? parsed.data : DEFAULT_SHEET_LAYOUT;
}

/** Everything a sheet needs, for one team on one date. Null when the team is not the coach's. */
export async function loadSheetDay(coachId: number, teamId: number, date: string, programDayId: number | null): Promise<SheetDayData | null> {
  const roster = await stationAthletes(coachId, teamId);
  if (!roster) return null;
  const ids = roster.athletes.map((a) => a.id);
  const [occurrences, coach, rosterRows, groups, layout, branding] = await Promise.all([
    occurrencesOn(coachId, ids, date),
    storage.getUser(coachId),
    storage.getRosterForCoach(coachId),
    storage.getRosterGroupsForCoach(coachId),
    savedLayout(coachId, teamId),
    storage.getEffectiveBrandingForUser(coachId),
  ]);
  const brand = {
    teamName: branding?.brandTeamName ?? null,
    primaryColor: branding?.brandPrimaryColor ?? null,
    logoUrl: branding?.brandLogoUrl ?? null,
  };
  const days = dayChoices(occurrences);
  const chosen = programDayId ?? days[0]?.programDayId ?? null;
  if (chosen == null || !days.some((d) => d.programDayId === chosen)) return { source: null, days, layout, brand };
  const day = await loadDay(chosen);
  if (!day) return { source: null, days, layout, brand };

  const lifts = liftsOf(day);
  const history = await historyFor(ids, Array.from(new Set(lifts.map((l) => l.exerciseId))), date);
  const groupLabel = new Map(resolveRosterGroups(groups).map((g) => [g.id, g.label]));
  const groupOf = new Map(rosterRows.map((r) => [r.id, (r as { groupId?: string | null }).groupId ?? null]));
  const onDay = new Set(occurrences.filter((o) => o.programDayId === chosen).map((o) => o.athleteId));
  const historyByKey = history.reduce((map, h) => {
    const weight = Number.parseFloat(String(h.weight ?? ""));
    const reps = Number.parseInt(String(h.reps ?? ""), 10);
    if (h.weightMode !== "numeric" || !(weight > 0) || !(reps > 0) || h.exerciseId == null) return map;
    const key = `${h.athleteId}:${h.exerciseId}`;
    const set: LoggedSet = { date: String(h.date), weight, reps, unit: (h.weightUnit ?? "lbs") as WeightUnit };
    map.set(key, [...(map.get(key) ?? []), set]);
    return map;
  }, new Map<string, LoggedSet[]>());

  const athletes: SheetSourceAthlete[] = roster.athletes.map((a) => ({
    athleteId: a.id,
    name: a.name,
    displayName: leaderboardDisplayName(a.name),
    position: a.position ?? null,
    groupLabel: groupLabel.get(groupOf.get(a.id) ?? "") ?? null,
    onDay: onDay.has(a.id),
    lifts: Object.fromEntries(
      lifts.map((l) => {
        const testedColumn = TESTED_MAX_BY_NAME[l.name.trim().toLowerCase()];
        const tested = testedColumn ? (a as Record<string, unknown>)[testedColumn] : null;
        return [String(l.exerciseId), { testedLbs: typeof tested === "number" && tested > 0 ? tested : null, history: historyByKey.get(`${a.id}:${l.exerciseId}`) ?? [] }];
      }),
    ),
  }));
  const phase = phaseLineOf(day);
  // The day's real warm-up block, printed in place of the mobility-lift guess (2026-11-22).
  const warmup = await resolveWarmupBlock(day.warmup);
  const warmupBlock = (warmup?.items ?? []).flatMap((i) => (i.exercise ? [warmupItemLine(i, i.exercise.name)] : []));
  const source: SheetSource = {
    teamId,
    teamName: roster.team.name,
    date,
    programDayId: chosen,
    dayTitle: day.title,
    programName: days.find((d) => d.programDayId === chosen)?.programName ?? "",
    coachName: coach?.name ?? "",
    phaseLine: phase.line,
    lighterWeek: phase.lighter,
    // The QR opens the athlete's own calendar on that date: a route and a date, never an athlete
    // id or a token, because a printed sheet hangs on a wall.
    qrUrl: `${emailAssetOrigin()}${ownTrainingCalendarRoute("athlete")}?date=${date}`,
    coachUnit: (coach?.preferredWeightUnit ?? "lbs") as WeightUnit,
    lifts,
    athletes,
    warmupBlock,
  };
  return { source, days, layout, brand };
}

/* ================================================================ reading a filled sheet */

export type RawSheetRead = {
  sheetCode?: string | null;
  coachNotes?: string | null;
  rows?: {
    athleteAsWritten: string;
    lifts?: { liftAsWritten: string; columnWeight?: string | null; cells?: string[] | null }[] | null;
    custom?: { header: string; text: string }[] | null;
  }[];
  notPlaced?: string[];
};

export const SHEET_READ_TOOL = {
  name: "report_filled_sheet",
  description: "Reports what is handwritten on a filled-in weight-room sheet, exactly as written.",
  input_schema: {
    type: "object",
    properties: {
      sheetCode: { type: "string", description: "A code printed in a corner like 'FS-C-20261121-9N-0A1B2-K', copied exactly, if there is one." },
      coachNotes: { type: "string", description: "Anything written in a 'Coach notes' strip, as written." },
      rows: {
        type: "array",
        description: "One entry per athlete row or name on the sheet, in the order they appear.",
        items: {
          type: "object",
          properties: {
            athleteAsWritten: { type: "string", description: "The name exactly as written: a first name, a nickname, 'Jordan R.', initials." },
            lifts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  liftAsWritten: { type: "string", description: "The lift as written or headed: 'BS', 'RDL', 'Bench', 'OHP'." },
                  columnWeight: { type: "string", description: "A weight written as a column heading or target over reps-only boxes, if any." },
                  cells: {
                    type: "array",
                    items: { type: "string" },
                    description: "Each filled set box or entry for this lift, left to right, as written: '225x5', '5@225', '3x5 225', '8', '||||'. Leave out empty boxes.",
                  },
                },
                required: ["liftAsWritten"],
              },
            },
            custom: {
              type: "array",
              description: "Anything written in a column headed by something other than a lift or set (e.g. 'Hurt?', 'Bar #'), with that column's header.",
              items: { type: "object", properties: { header: { type: "string" }, text: { type: "string" } }, required: ["header", "text"] },
            },
          },
          required: ["athleteAsWritten"],
        },
      },
      notPlaced: { type: "array", items: { type: "string" }, description: "Any other writing you could not place, quoted." },
    },
    required: ["rows"],
  },
};

const READ_PROMPT = [
  "You read a filled-in weight-room sheet (a printed team sheet, a whiteboard, a notebook page or a spreadsheet printout) and report through the tool exactly what is written.",
  "Rules:",
  "1. Transcribe only. Never add, correct, total or guess a number. Leave out a box that is empty.",
  "2. Write names exactly as written, including nicknames and initials. Do not expand or correct a name.",
  "3. Write lift names exactly as written, including shorthand (BS, FS, RDL, OHP, BP, PC).",
  "4. Copy each set entry as written: '225x5', '225/5', '5@225', '3x5 225', a bare number under a weight column, or tally marks.",
  "5. Anything written in a 'Coach notes' strip goes in coachNotes; writing in other non-lift columns goes in that row's custom list with the column header.",
  "6. If a code like 'FS-...' is printed in a corner, copy it exactly into sheetCode.",
].join("\n");

export type SheetReadModel = (source: ImportSource, hints: { lifts: string[]; names: string[] }) => Promise<RawSheetRead | null>;

const defaultReadModel: SheetReadModel = async (source, hints) => {
  const context = `Lifts on the day: ${hints.lifts.join(", ") || "(unknown)"}\nNames on the team: ${hints.names.join(", ") || "(unknown)"}`;
  const options = { feature: "weight-room-sheet-read", maxTokens: 8000 };
  if (source.kind === "text") return askClaudeStructured<RawSheetRead>(READ_PROMPT, `${context}\n\nThe sheet:\n${source.text}`, SHEET_READ_TOOL, options);
  const file = source.kind === "pdf" ? { kind: "pdf" as const, data: source.data } : { kind: "image" as const, mediaType: source.mediaType, data: source.data };
  return askClaudeFileStructured<RawSheetRead>(READ_PROMPT, `${context}\n\nRead the filled sheet above.`, file, SHEET_READ_TOOL, options);
};

let readModel: SheetReadModel = defaultReadModel;
let readAvailable = () => aiEnabled;

/** Tests have no AI key: they hand in a fake model. */
export function setSheetReadModelForTests(model: SheetReadModel | null): void {
  readModel = model ?? defaultReadModel;
  readAvailable = model ? () => true : () => aiEnabled;
}

const rawReadSchema = z.object({
  sheetCode: z.string().nullish(),
  coachNotes: z.string().nullish(),
  rows: z
    .array(
      z.object({
        athleteAsWritten: z.string(),
        lifts: z.array(z.object({ liftAsWritten: z.string(), columnWeight: z.string().nullish(), cells: z.array(z.union([z.string(), z.number()]).transform(String)).nullish() })).nullish(),
        custom: z.array(z.object({ header: z.string(), text: z.string() })).nullish(),
      }),
    )
    .nullish(),
  notPlaced: z.array(z.string()).nullish(),
});

export type DraftSet = {
  programExerciseId: number;
  setNumber: number;
  reps: string;
  weight: string | null;
  weightUnit: WeightUnit;
  side: "left" | "right" | null;
  uncertain: boolean;
  alreadyLogged: boolean;
};
export type DraftLift = {
  written: string;
  cells: string[];
  match: { status: "matched" | "ambiguous" | "unmatched"; programExerciseId: number | null; candidates: { programExerciseId: number; name: string }[] };
  unreadCells: string[];
  sets: DraftSet[];
};
export type DraftRow = {
  key: string;
  written: string[];
  match: { status: "matched" | "ambiguous" | "unmatched"; athleteId: number | null; displayName: string | null; candidates: { athleteId: number; displayName: string }[] };
  assignmentId: number | null;
  blocked: string[] | null;
  lifts: DraftLift[];
  notes: Record<string, string>;
  attendance: SheetAttendance;
};
export type SheetDraft = {
  teamId: number;
  teamName: string;
  date: string;
  programDayId: number | null;
  fromCode: boolean;
  codes: string[];
  version: { printed: string | null; current: string | null; changed: boolean; changes: string[] };
  dayLifts: { programExerciseId: number; name: string; laterality: string | null }[];
  roster: { athleteId: number; displayName: string }[];
  rows: DraftRow[];
  coachNotes: string;
  notPlaced: string[];
  unit: WeightUnit;
};

/** Sets already on a day that a sheet must not overwrite: filled in, or filmed. ONE query. */
async function filledSetsOn(athleteIds: number[], date: string, programDayId: number): Promise<Set<string>> {
  if (athleteIds.length === 0) return new Set();
  const rows = await db
    .select({ athleteId: workoutLogs.athleteId, programExerciseId: workoutLogEntries.programExerciseId, set: workoutSetEntries })
    .from(workoutSetEntries)
    .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .where(and(inArray(workoutLogs.athleteId, athleteIds), eq(workoutLogs.date, date), eq(workoutLogs.programDayId, programDayId)));
  return new Set(
    rows
      .filter((r) => r.programExerciseId != null && (String(r.set.reps ?? "").trim() !== "" || String(r.set.weight ?? "").trim() !== "" || setWasFilmed(r.set as unknown as Record<string, unknown>)))
      .map((r) => `${r.athleteId}:${r.programExerciseId}:${r.set.setNumber}`),
  );
}

/** Builds the review: every written row matched (or not) against the team's in-scope roster, every
 * lift against the day, every cell parsed. Writes nothing. */
export async function draftFromReads(
  coachId: number,
  reads: RawSheetRead[],
  pick: { teamId: number | null; date: string | null; programDayId: number | null },
): Promise<{ ok: true; draft: SheetDraft } | { ok: false; status: number; message: string }> {
  const codes = Array.from(new Set(reads.map((r) => r.sheetCode).filter((c): c is string => Boolean(c))));
  const decoded = codes.map(decodeSheetCode).filter((c): c is NonNullable<typeof c> => c != null);
  const code = decoded[0] ?? null;
  const teamId = code?.teamId ?? pick.teamId;
  const date = code?.date ?? pick.date;
  if (!teamId || !date) {
    return { ok: false, status: HTTP.badRequest, message: "Forge couldn't find a sheet code on that sheet. Pick the team and the date it was for, then read it again." };
  }
  const data = await loadSheetDay(coachId, teamId, date, code?.programDayId ?? pick.programDayId);
  if (!data) return { ok: false, status: HTTP.notFound, message: "That sheet is for a team that isn't yours." };
  const roster = await stationAthletes(coachId, teamId);
  const athletes = roster?.athletes ?? [];
  const nameList = athletes.map((a) => ({ id: a.id, name: a.name }));
  const display = new Map(athletes.map((a) => [a.id, leaderboardDisplayName(a.name)]));
  const source = data.source;
  const dayLifts = source?.lifts ?? [];
  const programDayId = source?.programDayId ?? null;
  const unit: WeightUnit = data.layout.unit ?? source?.coachUnit ?? "lbs";

  // The version printed, and what changed since.
  const currentVersion = source ? prescriptionVersion(source.lifts) : null;
  const printedRow =
    code && programDayId
      ? await db.query.weightRoomSheetPrints.findFirst({
          where: and(eq(weightRoomSheetPrints.teamId, teamId), eq(weightRoomSheetPrints.date, date), eq(weightRoomSheetPrints.programDayId, programDayId), eq(weightRoomSheetPrints.version, code.version)),
        })
      : null;
  const changed = Boolean(code && currentVersion && code.version !== currentVersion);
  const changes = changed && printedRow ? prescriptionChanges(printedRow.lifts, dayLifts) : [];

  // Rows by athlete, merged across pages; unmatched rows kept by what was written.
  const parsedReads = reads.map((r) => rawReadSchema.safeParse(r)).filter((r) => r.success).map((r) => r.data);
  const writtenRows = parsedReads.flatMap((r) => r.rows ?? []);
  const occurrences = source ? await occurrencesOn(coachId, athletes.map((a) => a.id), date) : [];
  const assignmentOf = new Map(occurrences.filter((o) => o.programDayId === programDayId).map((o) => [o.athleteId, o.assignmentId]));
  const filled = programDayId ? await filledSetsOn(athletes.map((a) => a.id), date, programDayId) : new Set<string>();

  const grouped = writtenRows.reduce((map, row) => {
    const match = matchAthleteName(row.athleteAsWritten, nameList);
    const key = match.status === "matched" ? `a:${match.athleteId}` : `w:${row.athleteAsWritten.trim().toLowerCase()}`;
    const existing = map.get(key);
    map.set(key, { match, written: [...(existing?.written ?? []), row.athleteAsWritten], lifts: [...(existing?.lifts ?? []), ...(row.lifts ?? [])], custom: [...(existing?.custom ?? []), ...(row.custom ?? [])] });
    return map;
  }, new Map<string, { match: ReturnType<typeof matchAthleteName>; written: string[]; lifts: NonNullable<NonNullable<RawSheetRead["rows"]>[number]["lifts"]>; custom: { header: string; text: string }[] }>());

  const gates = await Promise.all(
    Array.from(grouped.values()).map(async (g) => (g.match.status === "matched" ? [g.match.athleteId, await documentGate(g.match.athleteId)] as const : null)),
  );
  const gateOf = new Map(gates.filter((g): g is NonNullable<typeof g> => g != null));

  const rows: DraftRow[] = Array.from(grouped.entries()).map(([key, g]) => {
    const athleteId = g.match.status === "matched" ? g.match.athleteId : null;
    const counters = new Map<number, number>();
    const lifts: DraftLift[] = g.lifts.map((lift) => {
      const m = matchLift(lift.liftAsWritten, dayLifts);
      const pe = m.status === "matched" ? m.programExerciseId : null;
      const laterality = dayLifts.find((l) => l.programExerciseId === pe)?.laterality ?? null;
      const cells = (lift.cells ?? []).map((c) => c.trim()).filter(Boolean);
      const parsed = cells.map((cell) => ({ cell, read: parseSetCell(cell, lift.columnWeight ?? null) }));
      const sets: DraftSet[] =
        pe == null
          ? []
          : parsed.flatMap(({ read }) =>
              (read?.sets ?? []).map((s) => {
                const setNumber = (counters.get(pe) ?? 0) + 1;
                counters.set(pe, setNumber);
                return {
                  programExerciseId: pe,
                  setNumber,
                  reps: s.reps,
                  weight: s.weight,
                  weightUnit: s.unit ?? unit,
                  side: sideForNewSet(setNumber, laterality),
                  uncertain: Boolean(read?.uncertain),
                  alreadyLogged: athleteId != null && filled.has(`${athleteId}:${pe}:${setNumber}`),
                };
              }),
            );
      const candidates = m.status === "ambiguous" ? m.candidateIds : [];
      return {
        written: lift.liftAsWritten,
        cells,
        match: {
          status: m.status,
          programExerciseId: pe,
          candidates: candidates.map((id) => ({ programExerciseId: id, name: dayLifts.find((l) => l.programExerciseId === id)?.name ?? "" })),
        },
        unreadCells: parsed.filter((p) => !p.read).map((p) => p.cell),
        sets,
      };
    });
    const gate = athleteId != null ? gateOf.get(athleteId) : null;
    const candidateIds = g.match.status === "ambiguous" ? g.match.candidateIds : [];
    const writtenSets = lifts.reduce((n, l) => n + l.sets.length, 0);
    return {
      key,
      written: g.written,
      match: {
        status: g.match.status,
        athleteId,
        displayName: athleteId != null ? display.get(athleteId) ?? null : null,
        candidates: candidateIds.map((id) => ({ athleteId: id, displayName: display.get(id) ?? "" })),
      },
      assignmentId: athleteId != null ? assignmentOf.get(athleteId) ?? null : null,
      blocked: gate?.blocked ? gate.missing : null,
      lifts,
      notes: Object.fromEntries(g.custom.filter((c) => c.text.trim()).map((c) => [c.header.trim(), c.text.trim()])),
      attendance: presenceFromSets(writtenSets),
    };
  });

  return {
    ok: true,
    draft: {
      teamId,
      teamName: source?.teamName ?? roster?.team.name ?? "",
      date,
      programDayId,
      fromCode: code != null,
      codes,
      version: { printed: code?.version ?? null, current: currentVersion, changed, changes },
      dayLifts: dayLifts.map((l) => ({ programExerciseId: l.programExerciseId, name: l.name, laterality: l.laterality })),
      roster: athletes.map((a) => ({ athleteId: a.id, displayName: display.get(a.id) ?? "" })),
      rows,
      coachNotes: parsedReads.map((r) => r.coachNotes?.trim()).filter(Boolean).join("\n"),
      notPlaced: parsedReads.flatMap((r) => r.notPlaced ?? []),
      unit,
    },
  };
}

/* ================================================================ logging the reviewed sheet */

const logSetSchema = z.object({
  programExerciseId: z.number().int().positive(),
  setNumber: z.number().int().positive().max(MAX_SETS_PER_ROW),
  reps: z.string().trim().max(TEXT_MAX).nullable(),
  weight: z.string().trim().max(TEXT_MAX).nullable(),
  weightUnit: z.enum(["lbs", "kg"]).default("lbs"),
});
export const sheetLogSchema = z.object({
  teamId: z.number().int().positive(),
  date: isoDay,
  programDayId: z.number().int().positive(),
  version: z.string().max(TEXT_MAX).nullable().optional(),
  logAgainst: z.enum(["current", "printed"]).default("current"),
  coachNote: z.string().max(TEXT_MAX * 4).nullable().optional(),
  rows: z
    .array(
      z.object({
        athleteId: z.number().int().positive(),
        sets: z.array(logSetSchema).max(MAX_SETS_PER_ROW),
        notes: z.record(z.string(), z.string().max(TEXT_MAX)).optional(),
      }),
    )
    .max(MAX_ROWS),
});
export type SheetLogInput = z.infer<typeof sheetLogSchema>;

export type SheetLogResult = {
  athleteId: number;
  status: "logged" | "nothing_new" | "needs_assignment" | "blocked" | "not_on_team" | "conflict";
  written: number;
  skippedAlreadyLogged: { programExerciseId: number; setNumber: number }[];
  missing?: string[];
};

async function logOneAthlete(
  athleteId: number,
  assignmentId: number,
  input: SheetLogInput,
  sets: SheetLogInput["rows"][number]["sets"],
  allowed: Set<number> | null,
): Promise<Omit<SheetLogResult, "athleteId">> {
  const attempt = async (left: number): Promise<Omit<SheetLogResult, "athleteId">> => {
    const detail = await storage.getWorkoutDayDetail(athleteId, assignmentId, input.programDayId, input.date);
    if (!detail) return { status: "needs_assignment", written: 0, skippedAlreadyLogged: [] };
    const stored = storedEntriesOf(detail);
    const filled = new Set(
      stored.flatMap((e) =>
        e.programExerciseId == null
          ? []
          : e.sets
              .filter((s) => String(s.reps ?? "").trim() !== "" || String(s.weight ?? "").trim() !== "" || setWasFilmed(s))
              .map((s) => `${e.programExerciseId}:${s.setNumber}`),
      ),
    );
    const inScope = sets.filter((s) => allowed == null || allowed.has(s.programExerciseId));
    const skipped = inScope.filter((s) => filled.has(`${s.programExerciseId}:${s.setNumber}`));
    const usable: StationSet[] = inScope.filter((s) => !filled.has(`${s.programExerciseId}:${s.setNumber}`));
    if (usable.length === 0) return { status: "nothing_new", written: 0, skippedAlreadyLogged: skipped.map(({ programExerciseId, setNumber }) => ({ programExerciseId, setNumber })) };
    const laterality = new Map(detail.day.exercises.map((pe) => [pe.id, pe.exercise.laterality ?? null]));
    const merged = mergeStationSets(
      stored,
      usable,
      detail.day.exercises.map((pe) => ({ programExerciseId: pe.id, exerciseId: pe.exercise.id, weightMode: "numeric" as const })),
    );
    // A one-side prescription logs each side as its own set row, as the app does.
    const entries = merged.entries.map((entry) => {
      const pe = (entry as { programExerciseId?: number }).programExerciseId;
      const lat = pe != null ? laterality.get(pe) ?? null : null;
      return { ...entry, sets: entry.sets.map((s) => ((s as { side?: unknown }).side == null && lat ? { ...s, side: sideForNewSet(Number(s.setNumber), lat) } : s)) };
    }) as typeof merged.entries;
    try {
      await storage.submitWorkoutLog(athleteId, {
        assignmentId,
        programDayId: input.programDayId,
        date: input.date,
        completed: detail.log?.completed ?? false,
        entries,
        ...(detail.log?.revision != null ? { baseRevision: detail.log.revision } : {}),
      });
    } catch (err) {
      if (err instanceof StaleWorkoutLogError && left > 0) return attempt(left - 1);
      if (err instanceof StaleWorkoutLogError) return { status: "conflict", written: 0, skippedAlreadyLogged: [] };
      throw err;
    }
    await storage.evaluateAcwrRiskFlag(assignmentId, athleteId);
    return { status: "logged", written: merged.written, skippedAlreadyLogged: [...skipped, ...merged.skippedFilmed].map(({ programExerciseId, setNumber }) => ({ programExerciseId, setNumber })) };
  };
  return attempt(STALE_RETRIES);
}

/** Logs a reviewed sheet. Every athlete is checked against the team's in-scope roster again here,
 * whatever the review said, and nothing is invented: no assignment, no athlete, no set. */
export async function logReviewedSheet(coachId: number, input: SheetLogInput): Promise<{ results: SheetLogResult[]; uploadId: number } | null> {
  const roster = await stationAthletes(coachId, input.teamId);
  if (!roster) return null;
  const onTeam = new Set(roster.athletes.map((a) => a.id));
  const occurrences = await occurrencesOn(coachId, Array.from(onTeam), input.date);
  const assignmentOf = new Map(occurrences.filter((o) => o.programDayId === input.programDayId).map((o) => [o.athleteId, o.assignmentId]));
  const printed =
    input.logAgainst === "printed" && input.version
      ? await db.query.weightRoomSheetPrints.findFirst({
          where: and(eq(weightRoomSheetPrints.teamId, input.teamId), eq(weightRoomSheetPrints.date, input.date), eq(weightRoomSheetPrints.programDayId, input.programDayId), eq(weightRoomSheetPrints.version, input.version)),
        })
      : null;
  const allowed = printed ? new Set(printed.lifts.map((l) => l.programExerciseId)) : null;

  const results: SheetLogResult[] = await input.rows.reduce(async (accP, row) => {
    const acc = await accP;
    const base = { athleteId: row.athleteId, written: 0, skippedAlreadyLogged: [] };
    if (!onTeam.has(row.athleteId) || !(await storage.athleteIsInCoachScope(coachId, row.athleteId))) return [...acc, { ...base, status: "not_on_team" as const }];
    const gate = await documentGate(row.athleteId);
    if (gate.blocked) return [...acc, { ...base, status: "blocked" as const, missing: gate.missing }];
    const assignmentId = assignmentOf.get(row.athleteId);
    if (!assignmentId) return [...acc, { ...base, status: "needs_assignment" as const }];
    const outcome = await logOneAthlete(row.athleteId, assignmentId, input, row.sets, allowed);
    return [...acc, { athleteId: row.athleteId, ...outcome }];
  }, Promise.resolve([] as SheetLogResult[]));

  const attendance = Object.fromEntries(input.rows.filter((r) => onTeam.has(r.athleteId)).map((r) => [String(r.athleteId), presenceFromSets(r.sets.length)]));
  const athleteNotes = Object.fromEntries(input.rows.filter((r) => onTeam.has(r.athleteId) && r.notes && Object.keys(r.notes).length > 0).map((r) => [String(r.athleteId), r.notes as Record<string, string>]));
  const [upload] = await db
    .insert(weightRoomSheetUploads)
    .values({
      coachId,
      teamId: input.teamId,
      date: input.date,
      programDayId: input.programDayId,
      version: input.version ?? null,
      loggedAgainst: input.logAgainst,
      attendance,
      coachNote: input.coachNote?.trim() || null,
      athleteNotes,
      summary: Object.fromEntries(results.map((r) => [String(r.athleteId), { written: r.written, skipped: r.skippedAlreadyLogged.length, reason: r.status === "logged" ? null : r.status }])),
    })
    .returning({ id: weightRoomSheetUploads.id });
  return { results, uploadId: upload.id };
}

/* ================================================================ attendance, for the attendance view */

export type SheetAttendanceRow = { athleteId: number; teamId: number | null; date: string; status: SheetAttendance; source: "weight_room_sheet"; uploadId: number };

/** What one logged sheet says about who was there: "present" for an athlete with a set written,
 * "not_marked" otherwise. Never "absent". The attendance view (being built separately) calls this
 * after the merge. */
export function attendanceFromSheet(upload: Pick<WeightRoomSheetUpload, "id" | "teamId" | "date" | "attendance">): SheetAttendanceRow[] {
  return Object.entries(upload.attendance ?? {}).map(([athleteId, status]) => ({
    athleteId: Number(athleteId),
    teamId: upload.teamId,
    date: String(upload.date).slice(0, ISO_DATE_LENGTH),
    status,
    source: "weight_room_sheet",
    uploadId: upload.id,
  }));
}

/** Every sheet-read attendance row for one coach's team on a date. */
export async function sheetAttendanceFor(coachId: number, teamId: number, date: string): Promise<SheetAttendanceRow[]> {
  const rows = await db.query.weightRoomSheetUploads.findMany({
    where: and(eq(weightRoomSheetUploads.coachId, coachId), eq(weightRoomSheetUploads.teamId, teamId), eq(weightRoomSheetUploads.date, date)),
  });
  return rows.flatMap(attendanceFromSheet);
}

/* ================================================================ routes */

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES } });
const receiveFiles: RequestHandler = (req, res, next) => {
  upload.array("files", MAX_FILES)(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    const message = code === "LIMIT_FILE_SIZE" ? "One of those files is over 15 MB. A normal phone photo is plenty." : "Forge couldn't receive those files. Choose them again and retry.";
    res.status(HTTP.badRequest).json({ message });
  });
};

const pdfBodySchema = z
  .object({
    date: isoDay,
    programDayId: z.number().int().positive().nullable().optional(),
    layout: sheetLayoutSchema.optional(),
    edits: sheetDayEditsSchema.optional(),
  })
  .strict();

export type SheetGates = { requireActiveCoachPlan: RequestHandler };

async function sendPdf(req: Request, res: Response) {
  const user = currentUser(req);
  const teamId = Number(req.params.teamId);
  const parsed = pdfBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
  const data = await loadSheetDay(user.id, teamId, parsed.data.date, parsed.data.programDayId ?? null);
  if (!data) return res.status(HTTP.notFound).json({ message: "Team not found" });
  if (!data.source) return res.status(HTTP.notFound).json({ message: "Nobody on this team has a workout from your program on that date." });
  const layout = parsed.data.layout ?? data.layout;
  const model = buildSheet(data.source, layout, parsed.data.edits ?? sheetDayEditsSchema.parse({}));
  await db
    .insert(weightRoomSheetPrints)
    .values({
      coachId: user.id,
      teamId,
      date: data.source.date,
      programDayId: data.source.programDayId,
      version: model.version,
      lifts: data.source.lifts.map((l) => ({ programExerciseId: l.programExerciseId, exerciseId: l.exerciseId, name: l.name, sets: l.sets, reps: l.reps, weight: l.weight, restSeconds: l.restSeconds })),
    })
    .onConflictDoNothing();
  const brand = await pdfBrandForCoach(user.id);
  const pdf = await renderSheetPdf(model, brand);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="sheet-${data.source.date}.pdf"`);
  return res.end(pdf);
}

export function registerWeightRoomSheetRoutes(app: Express, gates: SheetGates): void {
  const coachOnly = requireRole("coach");

  /** The day's sheet data, the saved layout and the program's look. The client builds the
   * preview with the same buildSheet the PDF uses. */
  app.get("/api/coach/weight-room/sheets/:teamId", coachOnly, async (req, res, next) => {
    try {
      const date = String(req.query.date ?? "");
      if (!ISO_DAY.test(date)) return res.status(HTTP.badRequest).json({ message: "Pick a date." });
      const day = req.query.programDayId ? Number(req.query.programDayId) : null;
      const user = currentUser(req);
      const teamId = Number(req.params.teamId);
      if (!(await assertOwnsTeam(user.id, teamId))) return res.status(HTTP.notFound).json({ message: "Team not found" });
      const data = await loadSheetDay(user.id, teamId, date, day);
      if (!data) return res.status(HTTP.notFound).json({ message: "Team not found" });
      return res.json(data);
    } catch (err) {
      return next(err);
    }
  });

  /** Saves the team default. Only the layout; a branding field is refused by the strict schema. */
  app.put("/api/coach/weight-room/sheets/:teamId/layout", coachOnly, async (req, res, next) => {
    try {
      const user = currentUser(req);
      const teamId = Number(req.params.teamId);
      if (!(await assertOwnsTeam(user.id, teamId))) return res.status(HTTP.notFound).json({ message: "Team not found" });
      const parsed = z.object({ layout: sheetLayoutSchema }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message ?? "That layout isn't valid." });
      await db
        .insert(weightRoomSheetLayouts)
        .values({ coachId: user.id, teamId, layout: parsed.data.layout, updatedAt: new Date() })
        .onConflictDoUpdate({ target: [weightRoomSheetLayouts.coachId, weightRoomSheetLayouts.teamId], set: { layout: parsed.data.layout, updatedAt: new Date() } });
      return res.json({ layout: parsed.data.layout });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/api/coach/weight-room/sheets/:teamId/pdf", coachOnly, async (req, res, next) => {
    try {
      if (!(await assertOwnsTeam(currentUser(req).id, Number(req.params.teamId)))) return res.status(HTTP.notFound).json({ message: "Team not found" });
      return await sendPdf(req, res);
    } catch (err) {
      return next(err);
    }
  });

  /** Reads one or more photos or PDFs of a filled sheet into a review. Writes nothing. */
  app.post("/api/coach/weight-room/sheets/read", coachOnly, gates.requireActiveCoachPlan, receiveFiles, async (req, res, next) => {
    try {
      const user = currentUser(req);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) return res.status(HTTP.badRequest).json({ message: "Choose a photo or PDF of the filled sheet." });
      if (!readAvailable()) return res.status(HTTP.unavailable).json({ message: "Reading a sheet needs Forge's AI, which isn't set up on this server." });
      const pick = {
        teamId: req.body?.teamId ? Number(req.body.teamId) : null,
        date: ISO_DAY.test(String(req.body?.date ?? "")) ? String(req.body.date) : null,
        programDayId: req.body?.programDayId ? Number(req.body.programDayId) : null,
      };
      const hintDay = pick.teamId && pick.date ? await loadSheetDay(user.id, pick.teamId, pick.date, pick.programDayId) : null;
      const hints = {
        lifts: hintDay?.source?.lifts.map((l) => l.name) ?? [],
        names: hintDay?.source?.athletes.map((a) => a.displayName) ?? [],
      };
      const sources = files.map((f) => {
        try {
          return identifyUpload(f.buffer, f.originalname ?? "");
        } catch (err) {
          if (err instanceof ImportFileError) return err;
          throw err;
        }
      });
      const refused = sources.find((s): s is ImportFileError => s instanceof ImportFileError);
      if (refused) return res.status(HTTP.unprocessable).json({ message: refused.sentence });
      const reads = await Promise.all((sources as ImportSource[]).map((s) => readModel(s, hints)));
      const usable = reads.filter((r): r is RawSheetRead => r != null);
      if (usable.length === 0) return res.status(HTTP.unprocessable).json({ message: "Forge couldn't read that sheet. Try a closer, straighter photo in good light." });
      const result = await draftFromReads(user.id, usable, pick);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      return res.json(result.draft);
    } catch (err) {
      return next(err);
    }
  });

  /** Logs the reviewed sheet. */
  app.post("/api/coach/weight-room/sheets/log", coachOnly, async (req, res, next) => {
    try {
      const parsed = sheetLogSchema.safeParse(req.body);
      if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
      const result = await logReviewedSheet(currentUser(req).id, parsed.data);
      if (!result) return res.status(HTTP.notFound).json({ message: "Team not found" });
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  });
}
