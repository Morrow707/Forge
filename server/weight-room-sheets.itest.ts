/* eslint-disable ts-patterns/no-magic-numbers -- HTTP statuses, loads, reps and roster sizes are the examples */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { and, eq } from "drizzle-orm";
import {
  assignments,
  coachAthletes,
  externalWaivers,
  programDays,
  programExercises,
  programWeeks,
  programs,
  teamMembers,
  teams,
  users,
  weightRoomSheetLayouts,
  weightRoomSheetUploads,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import { DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS, buildSheet } from "@shared/weight-room-sheet";
import { db, onDbQuery } from "./db";
import { makeExercise, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";
import { attendanceFromSheet, loadSheetDay, setSheetReadModelForTests, type RawSheetRead } from "./weight-room-sheets";

/* WEIGHT-ROOM SHEETS ON REAL POSTGRES (2026-11-21).
 *
 * PRINT: the sheet carries every athlete on the team with their own numbers (a tested max of 300
 * at 75% is a 225 target), never an athlete outside the team, and the PDF prints those numbers.
 * The roster's numbers are read with a fixed number of queries whatever the roster's size.
 * UPLOAD: with the model faked (there is no AI key here), a filled sheet logs onto the right
 * athletes' own days, a set the athlete already logged on their phone (filmed) is skipped and
 * left as the camera recorded it, an out-of-scope name is never matched, a name that could be two
 * athletes is never guessed, and attendance comes from the numbers alone. The saved layout
 * refuses a branding field. */

const OK = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const ISO_DATE_LENGTH = 10;
const FILMED_MEAN_MPS = 0.77;
const PRIOR_DATE = "2026-01-02";

let server: TestServer;
let coach: Awaited<ReturnType<typeof makeLoginableUser>>;
let otherCoach: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachClient: TestClient;
let jordan: Awaited<ReturnType<typeof makeLoginableUser>>;
let avery: Awaited<ReturnType<typeof makeLoginableUser>>;
let stranger: Awaited<ReturnType<typeof makeLoginableUser>>;
let teamId: number;
let otherTeamId: number;
let dayId: number;
let squatPeId: number;
let squatId: number;
let assignmentOf: Map<number, number>;
let today: string;

const waiver = (athleteId: number) => ({
  athleteId,
  uploadedByUserId: athleteId,
  kind: "participation_waiver" as const,
  fileUrl: `/uploads/waivers/w-${athleteId}.pdf`,
  mimeType: "application/pdf",
  sizeBytes: 1024,
  reviewStatus: "accepted" as const,
  signedOn: "2026-09-01",
});

/** One program, one day (Back Squat 3 × 5 @ 75%), assigned to each athlete starting today. */
async function teamProgram(coachId: number, athleteIds: number[], exerciseIds: number[]) {
  const [program] = await db.insert(programs).values({ coachId, name: "Team Strength" }).returning();
  const [week] = await db.insert(programWeeks).values({ programId: program.id, weekNumber: 1 }).returning();
  const [day] = await db.insert(programDays).values({ weekId: week.id, dayNumber: 1, title: "Lower A" }).returning();
  const pes = await db
    .insert(programExercises)
    .values(exerciseIds.map((exerciseId, i) => ({ dayId: day.id, exerciseId, orderIndex: i, sets: 3, reps: "5", weight: "75%" })))
    .returning();
  const rows = athleteIds.length
    ? await db.insert(assignments).values(athleteIds.map((athleteId) => ({ programId: program.id, athleteId, coachId, startDate: today }))).returning()
    : [];
  return { day, pes, assignmentOf: new Map(rows.map((a) => [a.athleteId, a.id])) };
}

/** Every text string drawn in a pdfkit PDF: inflate each stream, then decode the hex strings. */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const marker = "stream";
  const chunks = raw.split("endstream").map((part) => {
    const at = part.lastIndexOf(marker);
    if (at < 0) return "";
    const body = Buffer.from(part.slice(at + marker.length).replace(/^\r?\n/, ""), "latin1"); // eslint-disable-line ts-patterns/require-regex-example -- strips the line break after "stream": matches "\r\n" or "\n" at the start; rejects "x"
    try {
      return inflateSync(body).toString("latin1");
    } catch {
      return "";
    }
  });
  // A pdfkit text string: matches "<323235206c62>"; rejects "<<" dictionaries. https://regex101.com/?regex=%3C%28%5B0-9a-f%5D%2B%29%3E&testString=%3C323235206c62%3E
  const hex = /<([0-9a-f]+)>/g;
  return chunks.flatMap((c) => Array.from(c.matchAll(hex)).map((m) => Buffer.from(m[1], "hex").toString("latin1"))).join("|");
}

async function uploadSheet(form: FormData) {
  const res = await fetch(`${server.baseUrl}/api/coach/weight-room/sheets/read`, { method: "POST", headers: { cookie: coachClient.cookieHeader() }, body: form });
  return { status: res.status, body: await res.json() };
}

function sheetPhoto(fields: Record<string, string> = {}) {
  const form = new FormData();
  // A tiny PNG's signature is all identifyUpload needs; the model is faked.
  form.append("files", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], { type: "image/png" }), "sheet.png");
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  return form;
}

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  today = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
  coach = await makeLoginableUser({ role: "coach", name: "Coach Rivera" } as never);
  otherCoach = await makeLoginableUser({ role: "coach", name: "Other Program" } as never);
  jordan = await makeLoginableUser({ role: "athlete", name: "Jordan Reyes" } as never);
  avery = await makeLoginableUser({ role: "athlete", name: "Avery Brooks" } as never);
  stranger = await makeLoginableUser({ role: "athlete", name: "Sam Elsewhere" } as never);
  coachClient = await loginAs(server.baseUrl, coach);
  await db.update(users).set({ squatMaxLbs: 300 }).where(eq(users.id, jordan.id));
  await db.insert(coachAthletes).values([
    { coachId: coach.id, athleteId: jordan.id },
    { coachId: coach.id, athleteId: avery.id },
    { coachId: otherCoach.id, athleteId: stranger.id },
  ]);
  [{ id: teamId }] = await db.insert(teams).values({ coachId: coach.id, name: "Varsity" }).returning();
  [{ id: otherTeamId }] = await db.insert(teams).values({ coachId: otherCoach.id, name: "Rivals" }).returning();
  await db.insert(teamMembers).values([
    { teamId, athleteId: jordan.id },
    { teamId, athleteId: avery.id },
    { teamId: otherTeamId, athleteId: stranger.id },
  ]);
  await db.insert(externalWaivers).values([jordan, avery, stranger].map((a) => waiver(a.id)));
  squatId = (await makeExercise(coach.id, { name: "Back Squat", equipment: "Barbell", category: "strength", movementType: "Squat" })).id;
  const made = await teamProgram(coach.id, [jordan.id, avery.id], [squatId]);
  dayId = made.day.id;
  squatPeId = made.pes[0].id;
  assignmentOf = made.assignmentOf;
  // Jordan squatted 225 × 5 on an earlier day: that is "last time".
  const [prior] = await db.insert(workoutLogs).values({ assignmentId: assignmentOf.get(jordan.id)!, programDayId: dayId, athleteId: jordan.id, date: PRIOR_DATE }).returning();
  const [priorEntry] = await db.insert(workoutLogEntries).values({ workoutLogId: prior.id, programExerciseId: squatPeId, exerciseId: squatId }).returning();
  await db.insert(workoutSetEntries).values({ logEntryId: priorEntry.id, setNumber: 1, reps: "5", weight: "225" });
});

afterAll(async () => {
  setSheetReadModelForTests(null);
  await server.close();
});

describe("printing the team sheet", () => {
  it("fills in every athlete on the team with their own numbers, and nobody else", async () => {
    const res = await coachClient.get(`/api/coach/weight-room/sheets/${teamId}?date=${today}`);
    expect(res.status).toBe(OK);
    const names = res.body.source.athletes.map((a: { displayName: string }) => a.displayName).sort();
    expect(names).toEqual(["Avery B.", "Jordan R."]);
    const model = buildSheet(res.body.source, res.body.layout, EMPTY_DAY_EDITS);
    const jordanRow = model.groups[0].rows.find((r) => r.athleteId === jordan.id)!;
    expect(jordanRow.cells[0].target).toBe("225 lb");
    expect(jordanRow.cells[0].last).toBe("225×5");
    const averyRow = model.groups[0].rows.find((r) => r.athleteId === avery.id)!;
    expect(averyRow.cells[0].target).toBe("—");
  });

  it("prints a PDF carrying those targets", async () => {
    const res = await fetch(`${server.baseUrl}/api/coach/weight-room/sheets/${teamId}/pdf`, {
      method: "POST",
      headers: { cookie: coachClient.cookieHeader(), "content-type": "application/json" },
      body: JSON.stringify({ date: today, layout: { ...DEFAULT_SHEET_LAYOUT, toggles: { ...DEFAULT_SHEET_LAYOUT.toggles, max: true } } }),
    });
    expect(res.status).toBe(OK);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const text = pdfText(pdf);
    expect(text).toContain("225 lb");
    expect(text).toContain("300 lb");
    expect(text).toContain("Jordan R.");
    expect(text).not.toContain("Sam E.");
  });

  it("another coach's team is not found, and the layout refuses a branding field", async () => {
    expect((await coachClient.get(`/api/coach/weight-room/sheets/${otherTeamId}?date=${today}`)).status).toBe(NOT_FOUND);
    const branded = await coachClient.put(`/api/coach/weight-room/sheets/${teamId}/layout`, { layout: { ...DEFAULT_SHEET_LAYOUT, brandPrimaryColor: "#ff0000" } });
    expect(branded.status).toBe(BAD_REQUEST);
    const saved = await coachClient.put(`/api/coach/weight-room/sheets/${teamId}/layout`, { layout: { ...DEFAULT_SHEET_LAYOUT, view: "across" } });
    expect(saved.status).toBe(OK);
    const [row] = await db.select().from(weightRoomSheetLayouts).where(and(eq(weightRoomSheetLayouts.coachId, coach.id), eq(weightRoomSheetLayouts.teamId, teamId)));
    expect((row.layout as { view: string }).view).toBe("across");
    await db.delete(weightRoomSheetLayouts);
  });

  it("reads the roster's numbers with the same number of queries for 12 athletes or 120", async () => {
    const big = await makeLoginableUser({ role: "coach", name: "Football Coach" } as never);
    const lifts = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => makeExercise(big.id, { name: `Big Lift ${i}` })));
    const countFor = async (n: number) => {
      const roster = await db
        .insert(users)
        .values(Array.from({ length: n }, (_, i) => ({ email: `fb-${n}-${i}@example.test`, passwordHash: "x", name: `Player${i} Team${n}`, role: "athlete" as const, isBetaAccount: true })))
        .returning();
      await db.insert(coachAthletes).values(roster.map((a) => ({ coachId: big.id, athleteId: a.id })));
      const [team] = await db.insert(teams).values({ coachId: big.id, name: `Football ${n}`, code: `FB${n}${Date.now() % 100000}` }).returning();
      await db.insert(teamMembers).values(roster.map((a) => ({ teamId: team.id, athleteId: a.id })));
      await teamProgram(big.id, roster.map((a) => a.id), lifts.map((l) => l.id));
      await loadSheetDay(big.id, team.id, today, null);
      let queries = 0;
      const stop = onDbQuery(() => {
        queries += 1;
      });
      const start = Date.now();
      const data = await loadSheetDay(big.id, team.id, today, null);
      stop();
      expect(data?.source?.athletes).toHaveLength(n);
      expect(data?.source?.lifts).toHaveLength(6);
      return { queries, ms: Date.now() - start };
    };
    const small = await countFor(12);
    const large = await countFor(120);
    expect(small.queries).toBeGreaterThan(0);
    expect(large.queries).toBe(small.queries);
    expect(large.ms).toBeLessThan(10_000);
  });
});

describe("uploading a filled sheet", () => {
  it("logs onto the right athletes, skips a set already filmed on the phone, never matches an out-of-scope name", async () => {
    // Avery filmed set 1 on their phone.
    const [log] = await db.insert(workoutLogs).values({ assignmentId: assignmentOf.get(avery.id)!, programDayId: dayId, athleteId: avery.id, date: today, revision: 1 }).returning();
    const [entry] = await db.insert(workoutLogEntries).values({ workoutLogId: log.id, programExerciseId: squatPeId, exerciseId: squatId }).returning();
    await db.insert(workoutSetEntries).values({ logEntryId: entry.id, setNumber: 1, reps: "5", weight: "185", meanVelocityMps: FILMED_MEAN_MPS });

    const reply: RawSheetRead = {
      coachNotes: "Avery's knee felt off",
      rows: [
        { athleteAsWritten: "Jordan R.", lifts: [{ liftAsWritten: "BS", cells: ["225x5", "225x5", "230x4"] }], custom: [{ header: "Hurt?", text: "no" }] },
        { athleteAsWritten: "Avery", lifts: [{ liftAsWritten: "Squat", cells: ["999x9", "195x5"] }] },
        { athleteAsWritten: "Sam Elsewhere", lifts: [{ liftAsWritten: "BS", cells: ["135x5"] }] },
      ],
    };
    setSheetReadModelForTests(async () => reply);
    const read = await uploadSheet(sheetPhoto({ teamId: String(teamId), date: today }));
    expect(read.status).toBe(OK);
    const draft = read.body;
    const byWritten = (w: string) => draft.rows.find((r: { written: string[] }) => r.written.includes(w));
    expect(byWritten("Jordan R.").match).toMatchObject({ status: "matched", athleteId: jordan.id });
    expect(byWritten("Avery").match).toMatchObject({ status: "matched", athleteId: avery.id });
    expect(byWritten("Sam Elsewhere").match).toMatchObject({ status: "unmatched", athleteId: null });
    expect(JSON.stringify(draft.roster)).not.toContain(String(stranger.id));
    expect(byWritten("Avery").lifts[0].sets[0].alreadyLogged).toBe(true);
    expect(byWritten("Jordan R.").attendance).toBe("present");
    // Nothing is written by reading.
    expect((await db.select().from(weightRoomSheetUploads)).length).toBe(0);

    const rows = draft.rows
      .filter((r: { match: { athleteId: number | null } }) => r.match.athleteId)
      .map((r: { match: { athleteId: number }; lifts: { sets: { programExerciseId: number; setNumber: number; reps: string; weight: string; weightUnit: string }[] }[]; notes: Record<string, string> }) => ({
        athleteId: r.match.athleteId,
        notes: r.notes,
        sets: r.lifts.flatMap((l) => l.sets).map((s) => ({ programExerciseId: s.programExerciseId, setNumber: s.setNumber, reps: s.reps, weight: s.weight, weightUnit: s.weightUnit })),
      }));
    // Try to sneak the out-of-scope athlete in by id as well.
    rows.push({ athleteId: stranger.id, notes: {}, sets: [{ programExerciseId: squatPeId, setNumber: 1, reps: "5", weight: "135", weightUnit: "lbs" }] });
    const logged = await coachClient.post("/api/coach/weight-room/sheets/log", { teamId, date: today, programDayId: dayId, version: null, logAgainst: "current", coachNote: draft.coachNotes, rows });
    expect(logged.status).toBe(OK);
    const result = (id: number) => logged.body.results.find((r: { athleteId: number }) => r.athleteId === id);
    expect(result(jordan.id)).toMatchObject({ status: "logged", written: 3 });
    expect(result(avery.id).skippedAlreadyLogged).toEqual([{ programExerciseId: squatPeId, setNumber: 1 }]);
    expect(result(stranger.id).status).toBe("not_on_team");

    const setsOf = (athleteId: number) =>
      db
        .select({ setNumber: workoutSetEntries.setNumber, reps: workoutSetEntries.reps, weight: workoutSetEntries.weight, mean: workoutSetEntries.meanVelocityMps })
        .from(workoutSetEntries)
        .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
        .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
        .where(and(eq(workoutLogs.athleteId, athleteId), eq(workoutLogs.date, today)))
        .orderBy(workoutSetEntries.setNumber);
    expect(await setsOf(jordan.id)).toEqual([
      { setNumber: 1, reps: "5", weight: "225", mean: null },
      { setNumber: 2, reps: "5", weight: "225", mean: null },
      { setNumber: 3, reps: "4", weight: "230", mean: null },
    ]);
    expect(await setsOf(avery.id)).toEqual([
      { setNumber: 1, reps: "5", weight: "185", mean: FILMED_MEAN_MPS },
      { setNumber: 2, reps: "5", weight: "195", mean: null },
    ]);
    expect(await setsOf(stranger.id)).toEqual([]);

    const [upload] = await db.select().from(weightRoomSheetUploads);
    expect(upload.coachNote).toBe("Avery's knee felt off");
    expect(upload.athleteNotes).toEqual({ [String(jordan.id)]: { "Hurt?": "no" } });
    expect(attendanceFromSheet(upload).map((a) => [a.athleteId, a.status]).sort()).toEqual(
      [[jordan.id, "present"], [avery.id, "present"]].sort(),
    );
  });

  it("a name that could be two athletes is never guessed, and an athlete with no workout that day is not given one", async () => {
    const second = await makeLoginableUser({ role: "athlete", name: "Jordan Kim" } as never);
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: second.id });
    await db.insert(teamMembers).values({ teamId, athleteId: second.id });
    await db.insert(externalWaivers).values(waiver(second.id));
    setSheetReadModelForTests(async () => ({ rows: [{ athleteAsWritten: "Jordan", lifts: [{ liftAsWritten: "BS", cells: ["200x5"] }] }] }));
    const read = await uploadSheet(sheetPhoto({ teamId: String(teamId), date: today }));
    expect(read.body.rows[0].match.status).toBe("ambiguous");
    expect(read.body.rows[0].match.athleteId).toBeNull();
    const logged = await coachClient.post("/api/coach/weight-room/sheets/log", {
      teamId,
      date: today,
      programDayId: dayId,
      rows: [{ athleteId: second.id, sets: [{ programExerciseId: squatPeId, setNumber: 1, reps: "5", weight: "200", weightUnit: "lbs" }] }],
    });
    expect(logged.body.results[0].status).toBe("needs_assignment");
  });

  it("with no code and no team picked, it asks for the team and date rather than guessing", async () => {
    setSheetReadModelForTests(async () => ({ rows: [] }));
    const read = await uploadSheet(sheetPhoto());
    expect(read.status).toBe(BAD_REQUEST);
  });
});
