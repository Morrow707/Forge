/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/require-regex-example -- byte signatures and expected sentences */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  IMPORT_TOOL,
  MAX_SOURCE_CHARS,
  draftProgramFromUpload,
  identifyUpload,
  setProgramImportModelForTests,
  type ImportSource,
} from "./program-import";
import type { LibraryExercise, RawImportDraft } from "@shared/program-import";

const FIXTURES = path.join(__dirname, "__fixtures__", "program-import");
const LIBRARY: LibraryExercise[] = [
  { id: 1, name: "Back Squat" },
  { id: 3, name: "Romanian Deadlift" },
  { id: 4, name: "Bench Press" },
  { id: 7, name: "Bulgarian Split Squat" },
];

afterEach(() => setProgramImportModelForTests(null));

describe("identifyUpload reads the bytes, not the name", () => {
  it("an .xlsx becomes text with its rows", () => {
    const src = identifyUpload(readFileSync(path.join(FIXTURES, "libreoffice-program.xlsx")), "program.xlsx");
    expect(src.kind).toBe("text");
    if (src.kind !== "text") return;
    expect(src.format).toBe("xlsx");
    expect(src.text).toContain("R2: Day 1 - Lower | 2026-11-23 | Back Squat | 5 | 5 | 75% | 3:00 | 3-1-1 | Belt on top set");
    expect(src.text).toContain("=== Sheet: Notes ===");
    expect(src.notice).toBeNull();
  });

  it("a CSV becomes text, even when it was named .txt", () => {
    const src = identifyUpload(Buffer.from("Exercise,Sets,Reps\nRDL,3,8\n"), "week.txt");
    expect(src).toMatchObject({ kind: "text", format: "csv" });
    if (src.kind === "text") expect(src.text).toContain("R2: RDL | 3 | 8");
  });

  it("a PDF and the photo formats go to the model as files", () => {
    expect(identifyUpload(Buffer.from("%PDF-1.7\n..."), "x.pdf").kind).toBe("pdf");
    expect(identifyUpload(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]), "x.jpg")).toMatchObject({ kind: "image", mediaType: "image/jpeg" });
    expect(identifyUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]), "x.png")).toMatchObject({ kind: "image", mediaType: "image/png" });
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
    expect(identifyUpload(webp, "x.webp")).toMatchObject({ kind: "image", mediaType: "image/webp" });
  });

  it.each([
    ["an old .xls", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "old.xls", /older Excel file/],
    ["a HEIC photo", Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)]), "IMG.HEIC", /HEIC/],
    ["a binary file", Buffer.from([0, 1, 2, 3, 0, 0, 7, 9, 200, 201]), "thing.bin", /can't read that kind of file/],
    ["an empty file", Buffer.alloc(0), "empty.csv", /empty/],
    ["a damaged workbook", Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]), "x.xlsx", /couldn't open that Excel file/],
  ])("%s is refused with a sentence", (_what, buf, name, sentence) => {
    expect(() => identifyUpload(buf, name)).toThrow(sentence);
  });

  it("a sheet too long to send whole says which rows were read, rather than dropping the rest unsaid", () => {
    const lines = Array.from({ length: 6000 }, (_, i) => `Back Squat,5,5,row ${i} padding padding padding`).join("\n");
    const src = identifyUpload(Buffer.from(lines), "long.csv");
    expect(src.kind).toBe("text");
    if (src.kind !== "text") return;
    expect(src.text.length).toBeLessThanOrEqual(MAX_SOURCE_CHARS);
    expect(src.notice).toMatch(/only the rows up to row \d+ were read/);
  });
});

describe("draftProgramFromUpload with a fake model", () => {
  it("hands the model the sheet and the library names, and returns a reviewed draft", async () => {
    let seen: { source: ImportSource; names: string[] } | null = null;
    setProgramImportModelForTests(async (source, names) => {
      seen = { source, names };
      const draft: RawImportDraft = {
        name: "Week 1",
        days: [
          {
            label: "Day 1 - Lower",
            order: 1,
            date: "2026-11-23",
            exercises: [
              { nameAsWritten: "Back Squat", sets: 5, reps: "5", percent1RM: 75, restSeconds: 180, tempo: "3-1-1" },
              { nameAsWritten: "RDL", sets: 3, reps: "8", load: "135" },
              { nameAsWritten: "Bulgrian Split Squat", sets: 3, reps: "8 each", supersetGroup: "A", libraryName: "Bulgarian Split Squat" },
              { nameAsWritten: "Copenhagen Plank", sets: 3, reps: "20s", supersetGroup: "A" },
            ],
          },
        ],
        notPlaced: ["Deload every 4th week"],
      };
      return draft;
    });
    const result = await draftProgramFromUpload(readFileSync(path.join(FIXTURES, "openpyxl-program.xlsx")), "p.xlsx", LIBRARY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(seen!.names).toEqual(LIBRARY.map((l) => l.name));
    expect(seen!.source.kind).toBe("text");
    const rows = result.draft.days[0].exercises;
    expect(rows.map((r) => [r.nameAsWritten, r.match.status])).toEqual([
      ["Back Squat", "matched"],
      ["RDL", "matched"],
      ["Bulgrian Split Squat", "flagged"],
      ["Copenhagen Plank", "flagged"],
    ]);
    expect(result.draft.flaggedCount).toBe(2);
    expect(result.draft.notPlaced).toEqual(["Deload every 4th week"]);
    expect(result.draft.library).toEqual(LIBRARY);
  });

  it("a model answer that is not the tool's shape is a sentence, not a crash", async () => {
    setProgramImportModelForTests(async () => ({ days: "lots" }) as unknown as RawImportDraft);
    const result = await draftProgramFromUpload(Buffer.from("a,b\n1,2"), "x.csv", LIBRARY);
    expect(result).toMatchObject({ ok: false, status: 422 });
    if (!result.ok) expect(result.message).toMatch(/couldn't read a program/);
  });

  it("no answer at all (the model call failed or was cut off) is a sentence", async () => {
    setProgramImportModelForTests(async () => null);
    const result = await draftProgramFromUpload(Buffer.from("a,b\n1,2"), "x.csv", LIBRARY);
    expect(result).toMatchObject({ ok: false, status: 422 });
  });

  it("a file with no program in it says so", async () => {
    setProgramImportModelForTests(async () => ({ days: [] }));
    const result = await draftProgramFromUpload(Buffer.from([0xff, 0xd8, 0xff, 1]), "cat.jpg", LIBRARY);
    expect(result).toMatchObject({ ok: false, status: 422 });
    if (!result.ok) expect(result.message).toMatch(/couldn't find a training program/);
  });

  it("an unreadable file is refused before the model is ever asked", async () => {
    let asked = false;
    setProgramImportModelForTests(async () => {
      asked = true;
      return { days: [] };
    });
    const result = await draftProgramFromUpload(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), "old.xls", LIBRARY);
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(asked).toBe(false);
  });

  it("with no model configured (no AI key) the import says the AI is not set up", async () => {
    setProgramImportModelForTests(null);
    const result = await draftProgramFromUpload(Buffer.from("a,b\n1,2"), "x.csv", LIBRARY);
    expect(result).toMatchObject({ ok: false, status: 503 });
  });
});

describe("the model call", () => {
  it("is a forced tool whose rows require the name as written", () => {
    const src = readFileSync(path.join(__dirname, "program-import.ts"), "utf8");
    expect(src).toMatch(/askClaudeStructured<RawImportDraft>\([^)]*IMPORT_TOOL/);
    expect(src).toMatch(/askClaudeFileStructured<RawImportDraft>\(/);
    expect(src).toContain('feature: "program-import"');
    type Schema = { properties: { days: { items: { properties: { exercises: { items: { required: string[] } } } } } } };
    const day = (IMPORT_TOOL.input_schema as unknown as Schema).properties.days.items;
    expect(day.properties.exercises.items.required).toEqual(["nameAsWritten"]);
  });
});
