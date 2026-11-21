/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/require-regex-example, ts-patterns/no-loop-statements -- written in this repo's own style; the behaviour is pinned by program-import.test.ts and program-import.itest.ts */
/**
 * "IMPORT A PROGRAM": a coach's Excel sheet, CSV, PDF or phone photo of a whiteboard becomes a
 * DRAFT in the program builder, which the coach reviews before anything is saved.
 *
 * What happens, in order:
 *   1. The file is identified by its bytes, not its name (`identifyUpload`): a ZIP is an .xlsx,
 *      `%PDF` is a PDF, JPEG/PNG/WebP/GIF magic is a photo, readable text is a CSV. Anything else
 *      -- an old binary .xls, an Apple Numbers file, a HEIC the phone did not convert -- is turned
 *      away with a sentence saying what to do instead, never a stack trace.
 *   2. A spreadsheet is read here into a grid of text (server/spreadsheet-reader.ts); a PDF or a
 *      photo goes to the model as the file itself.
 *   3. The model is handed that, plus the names in the reader's own exercise library, and asked
 *      through a FORCED tool call for the program: name, days in order (with a date where the
 *      source has one) and per day each exercise AS WRITTEN with sets, reps, load or %1RM, rest,
 *      tempo, notes and superset grouping, plus anything it saw and could not place.
 *   4. shared/program-import.ts matches each row to the library by name and FLAGS every row it
 *      cannot match with certainty. The coach decides those in the review dialog.
 *
 * NOTHING HERE WRITES TO THE DATABASE. The route returns a draft; the builder puts it on screen;
 * the coach's own Save Program is the only write, through the save path every program uses.
 *
 * Gating, by role (server/program-import-routes.ts): a coach needs a live plan (`requireActiveCoachPlan`, like
 * every coach AI route); an admin passes; a Free Agent needs a tier with the AI coach
 * (`requireFreeAgent` then `requirePaidAiAccess("strengthAi")`), and a coached athlete is refused
 * by `requireFreeAgent` -- their coach builds their program. The daily model ceiling and the
 * usage record live in callAnthropic and apply here like everywhere else.
 */
import { aiEnabled, askClaudeFileStructured, askClaudeStructured } from "./ai";
import { SpreadsheetReadError, gridToText, parseCsv, readXlsx } from "./spreadsheet-reader";
import {
  buildImportDraft,
  type ImportDraft,
  type LibraryExercise,
  type RawImportDraft,
} from "@shared/program-import";
import { z } from "zod";

/** The most an upload may be. A program is kilobytes; a phone photo or a scanned PDF is a few MB. */
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
/** How much of a spreadsheet's text goes to the model. Past this the coach is TOLD which rows were
 * read, rather than the rest vanishing. */
export const MAX_SOURCE_CHARS = 120_000;
const MAX_LIBRARY_NAMES = 2500;

export type ImportSource =
  | { kind: "text"; format: "csv" | "xlsx"; text: string; notice: string | null }
  | { kind: "pdf"; data: string }
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

/** A refusal about the FILE, carrying the sentence the coach sees. */
export class ImportFileError extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "ImportFileError";
  }
}

const startsWith = (buf: Buffer, bytes: number[]) => bytes.every((b, i) => buf[i] === b);

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8192);
  if (sample.includes(0)) return false;
  const text = sample.toString("utf8");
  // Replacement characters mean the bytes were not UTF-8; a few are tolerable (a stray Windows
  // character), a lot means a binary file.
  const bad = (text.match(/�/g) ?? []).length;
  return bad <= Math.max(2, text.length / 100);
}

function capText(text: string, format: "csv" | "xlsx"): { text: string; notice: string | null } {
  if (text.length <= MAX_SOURCE_CHARS) return { text, notice: null };
  const cut = text.lastIndexOf("\n", MAX_SOURCE_CHARS);
  const kept = text.slice(0, cut > 0 ? cut : MAX_SOURCE_CHARS);
  const lastRow = kept.match(/R(\d+):[^\n]*$/);
  const what = format === "xlsx" ? "workbook" : "file";
  return {
    text: kept,
    notice: lastRow
      ? `That ${what} is longer than Forge reads in one import, so only the rows up to row ${lastRow[1]} were read. Import the rest as a second file.`
      : `That ${what} is longer than Forge reads in one import, so only the first part was read. Import the rest as a second file.`,
  };
}

/** What kind of file this is, by its bytes, and the text or file the model will be given. */
export function identifyUpload(buf: Buffer, fileName = ""): ImportSource {
  if (buf.length === 0) throw new ImportFileError("That file is empty. Choose the program file and try again.");
  const lower = fileName.toLowerCase();

  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    if (lower.endsWith(".numbers")) {
      throw new ImportFileError("Forge can't read Apple Numbers files. In Numbers choose File, Export To, Excel (or CSV), then upload that.");
    }
    if (lower.endsWith(".docx") || lower.endsWith(".pptx")) {
      throw new ImportFileError("Forge reads spreadsheets, PDFs and photos. Save that document as a PDF and upload the PDF.");
    }
    try {
      const sheets = readXlsx(buf);
      const text = gridToText(sheets);
      if (!text.replace(/R\d+:/g, "").trim()) {
        throw new ImportFileError("That spreadsheet has nothing in it Forge can read. Check it is the right file.");
      }
      return { kind: "text", format: "xlsx", ...capText(text, "xlsx") };
    } catch (err) {
      if (err instanceof SpreadsheetReadError) throw new ImportFileError(err.sentence);
      throw err;
    }
  }
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw new ImportFileError("That's an older Excel file (.xls). Open it in Excel and choose Save As, Excel Workbook (.xlsx) or CSV, then upload that.");
  }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return { kind: "pdf", data: buf.toString("base64") };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: "image", mediaType: "image/jpeg", data: buf.toString("base64") };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return { kind: "image", mediaType: "image/png", data: buf.toString("base64") };
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return { kind: "image", mediaType: "image/gif", data: buf.toString("base64") };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return { kind: "image", mediaType: "image/webp", data: buf.toString("base64") };
  }
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") {
    throw new ImportFileError("Forge couldn't read that photo's format (HEIC). Take a screenshot of it, or set the camera to Most Compatible, and upload that instead.");
  }
  if (looksLikeText(buf)) {
    const rows = parseCsv(buf.toString("utf8"));
    if (rows.length === 0 || rows.every((r) => r.every((c) => c === ""))) {
      throw new ImportFileError("That file has nothing in it Forge can read. Check it is the right file.");
    }
    const text = gridToText([{ name: fileName || "Sheet", rows }]);
    return { kind: "text", format: "csv", ...capText(text, "csv") };
  }
  throw new ImportFileError("Forge can't read that kind of file. Upload an Excel file (.xlsx), a CSV, a PDF or a photo of the program.");
}

// ---------------------------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------------------------

export const IMPORT_TOOL: { name: string; description: string; input_schema: Record<string, unknown> } = {
  name: "report_imported_program",
  description: "Reports the training program found in the coach's file, row by row, exactly as written.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The program's name if the source gives one." },
      note: {
        type: "string",
        description: "Only if something was illegible or ambiguous: one or two plain sentences to the coach saying what.",
      },
      days: {
        type: "array",
        description: "Every training day in the source, in the source's order.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "The day's heading as written, e.g. 'Day 1 - Lower' or 'Monday'." },
            order: { type: "integer", description: "1 for the first day, 2 for the next, following the source." },
            date: { type: "string", description: "YYYY-MM-DD, only if the source gives a date for this day." },
            isRestDay: { type: "boolean", description: "True only if the source marks the day as rest or off." },
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nameAsWritten: { type: "string", description: "The exercise name exactly as the source writes it." },
                  libraryName: {
                    type: "string",
                    description: "The one name from the exercise library list that is clearly the same exercise, if there is one. Leave out if unsure.",
                  },
                  sets: { type: "integer" },
                  reps: { type: "string", description: "As written: '5', '8-10', '30s', 'AMRAP', '5/5' for each side." },
                  load: { type: "string", description: "A load as written: '135', '60 kg', 'BW', 'RPE 8'." },
                  percent1RM: { type: "number", description: "A percentage of a one-rep max, e.g. 75 for 75%." },
                  restSeconds: { type: "integer", description: "Rest between sets in seconds (90 for 1:30 or 90s)." },
                  tempo: { type: "string", description: "Tempo as written, e.g. '3-1-1'." },
                  notes: { type: "string", description: "Any other instruction on this row, as written." },
                  supersetGroup: {
                    type: "string",
                    description: "Rows done back to back as a superset or circuit share one token (A1 and A2 share 'A'). Leave out otherwise.",
                  },
                },
                required: ["nameAsWritten"],
              },
            },
          },
          required: ["exercises"],
        },
      },
      notPlaced: {
        type: "array",
        items: { type: "string" },
        description: "Any text in the source that looks like part of the program but that you could not place as a day or an exercise row, quoted as written.",
      },
    },
    required: ["days"],
  },
};

const SYSTEM_PROMPT = [
  "You read a strength coach's training program from a spreadsheet, a PDF or a photo (often a whiteboard or a handwritten sheet) and report it through the tool, exactly as written.",
  "Rules:",
  "1. Transcribe; never program. Do not add, remove, reorder or improve anything. Do not invent sets, reps or loads that are not shown: leave a field out when the source does not give it.",
  "2. Report EVERY exercise row you can see, including ones you cannot identify. Write the name exactly as the source does in nameAsWritten.",
  "3. Only fill libraryName with a name copied from the library list when it is clearly the same exercise. If unsure, leave it out; the coach will choose.",
  "4. Spreadsheets arrive as lines 'R<row>: cell | cell | ...'. Read the column headings to know which column is sets, reps, load, rest and so on. A week laid out across columns is several days.",
  "5. '3x5' is 3 sets of 5. '75%' or '@75%' is percent1RM 75. 'A1/A2' or a bracket marks a superset. '1:30' rest is 90 seconds.",
  "6. Anything that looks like part of the program and that you cannot place goes in notPlaced, quoted. Nothing on the page may be silently dropped.",
].join("\n");

export type ImportModel = (source: ImportSource, libraryNames: string[]) => Promise<RawImportDraft | null>;

const defaultImportModel: ImportModel = async (source, libraryNames) => {
  const library = `Exercise library (names to choose libraryName from):\n${libraryNames.join("\n")}`;
  const options = { feature: "program-import", maxTokens: 12000 };
  if (source.kind === "text") {
    const prompt = `${library}\n\nThe coach's ${source.format === "xlsx" ? "Excel workbook" : "CSV file"}:\n${source.text}`;
    return askClaudeStructured<RawImportDraft>(SYSTEM_PROMPT, prompt, IMPORT_TOOL, options);
  }
  const what = source.kind === "pdf" ? "PDF" : "photo";
  const file = source.kind === "pdf"
    ? { kind: "pdf" as const, data: source.data }
    : { kind: "image" as const, mediaType: source.mediaType, data: source.data };
  return askClaudeFileStructured<RawImportDraft>(
    SYSTEM_PROMPT,
    `${library}\n\nRead the training program in the coach's ${what} above.`,
    file,
    IMPORT_TOOL,
    options,
  );
};

let importModel: ImportModel = defaultImportModel;
let aiAvailable = () => aiEnabled;

/** Tests have no AI key: they hand in a fake model (and say the AI is available). */
export function setProgramImportModelForTests(model: ImportModel | null): void {
  importModel = model ?? defaultImportModel;
  aiAvailable = model ? () => true : () => aiEnabled;
}

// What the model's tool input must look like before it is trusted. Lenient on purpose about
// types a model gets slightly wrong (a number sent as a string), strict about the shape.
const looseNumber = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number().finite()).nullish();
const rawDraftSchema = z.object({
  name: z.string().nullish(),
  note: z.string().nullish(),
  notPlaced: z.array(z.string()).nullish(),
  days: z.array(
    z.object({
      label: z.string().nullish(),
      order: looseNumber,
      date: z.string().nullish(),
      isRestDay: z.boolean().nullish(),
      exercises: z
        .array(
          z.object({
            nameAsWritten: z.string(),
            libraryName: z.string().nullish(),
            sets: looseNumber,
            reps: z.union([z.string(), z.number()]).transform(String).nullish(),
            load: z.union([z.string(), z.number()]).transform(String).nullish(),
            percent1RM: looseNumber,
            restSeconds: looseNumber,
            tempo: z.string().nullish(),
            notes: z.string().nullish(),
            supersetGroup: z.string().nullish(),
          }),
        )
        .nullish(),
    }),
  ),
});

export type ImportResult =
  | { ok: true; draft: ImportDraft & { sourceNotice: string | null; library: LibraryExercise[] } }
  | { ok: false; status: number; message: string };

const NOTHING_FOUND =
  "Forge couldn't find a training program in that file. Check it is the right file; for a photo, try a closer, straighter shot in good light.";

/** The whole import for one file and one reader's library. Returns a draft or a refusal sentence. */
export async function draftProgramFromUpload(
  buf: Buffer,
  fileName: string,
  library: LibraryExercise[],
): Promise<ImportResult> {
  let source: ImportSource;
  try {
    source = identifyUpload(buf, fileName);
  } catch (err) {
    if (err instanceof ImportFileError) return { ok: false, status: 422, message: err.sentence };
    throw err;
  }
  if (!aiAvailable()) {
    return { ok: false, status: 503, message: "Importing a program needs Forge's AI, which isn't set up on this server." };
  }
  const names = library.slice(0, MAX_LIBRARY_NAMES).map((ex) => ex.name);
  const raw = await importModel(source, names);
  const parsed = rawDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      message: "Forge couldn't read a program out of that file this time. Try again, or for a long program split it into smaller files.",
    };
  }
  const draft = buildImportDraft(parsed.data as RawImportDraft, library);
  const rowCount = draft.days.reduce((n, d) => n + d.exercises.length, 0);
  if (rowCount === 0 && draft.notPlaced.length === 0) return { ok: false, status: 422, message: NOTHING_FOUND };
  return {
    ok: true,
    draft: {
      ...draft,
      sourceNotice: source.kind === "text" ? source.notice : null,
      // The library the rows were matched against, so the review dialog's picker offers the
      // same exercises without a second request.
      library,
    },
  };
}
