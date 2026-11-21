/* eslint-disable ts-patterns/no-loop-statements, ts-patterns/require-regex-example, ts-patterns/no-magic-numbers, ts-patterns/no-nested-ternary -- a byte-level ZIP and XML reader written in this repo's own style (loops, inline regexes, the ZIP spec's fixed header offsets); every rule here is pinned by spreadsheet-reader.test.ts against real files */
/**
 * READING A COACH'S SPREADSHEET WITHOUT A SPREADSHEET LIBRARY.
 *
 * "Import a program" (server/program-import.ts) takes a CSV or an Excel .xlsx. No npm package
 * is added for it, so both are read here by hand:
 *
 *   - CSV: RFC 4180 quoting (a quoted field may hold commas, newlines and "" for a quote), a
 *     byte-order mark dropped, and the delimiter guessed between comma, semicolon and tab, since
 *     a sheet saved from Excel in much of Europe uses semicolons and a copy-paste out of Google
 *     Sheets is tab-separated.
 *   - XLSX: an .xlsx is a ZIP of XML. `readZipEntries` walks the ZIP's central directory and
 *     inflates each entry with Node's own zlib (deflate is the only compression Excel writes;
 *     "stored" is handled too). `readXlsx` then reads the workbook's sheet list, the shared
 *     strings, the number formats that make a cell a date or a percentage, and each sheet's
 *     cells into a 2D grid of text.
 *
 * Every failure is a `SpreadsheetReadError` carrying a sentence a coach can act on ("That's an
 * older Excel file..."), never a stack trace, and the caller shows that sentence as it is.
 *
 * Bounded on purpose: a ZIP's declared sizes are checked before anything is inflated and the
 * inflate itself is capped (`maxOutputLength`), so a small file that unpacks to gigabytes is
 * refused rather than read.
 */
import { inflateRawSync } from "node:zlib";

export class SpreadsheetReadError extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "SpreadsheetReadError";
  }
}

export type SheetGrid = { name: string; rows: string[][] };

/** The most a workbook may unpack to, all entries together. A training program is kilobytes. */
export const MAX_UNPACKED_BYTES = 40 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------

function guessDelimiter(text: string): string {
  // Count each candidate outside quotes on the first few lines; the most frequent wins, comma
  // on a tie because it is what the format is named for.
  const sample = text.slice(0, 4000);
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of sample) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  let best = ",";
  for (const d of [";", "\t"]) if (counts[d] > counts[best]) best = d;
  return best;
}

/** CSV text to rows of cells. Blank trailing rows are dropped; blank rows in the middle are kept
 * (a blank row is often what separates one day from the next on a coach's sheet). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = guessDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const trimmed = rows.map((r) => r.map((c) => c.trim()));
  while (trimmed.length && trimmed[trimmed.length - 1].every((c) => c === "")) trimmed.pop();
  return trimmed;
}

// ---------------------------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Every file in a ZIP, by name, inflated. Throws a SpreadsheetReadError on anything it cannot
 * read rather than returning half a workbook. */
export function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const unreadable = new SpreadsheetReadError(
    "Forge couldn't open that Excel file. It may be damaged or password-protected. Open it in Excel and save it again as .xlsx or CSV, then upload that.",
  );
  if (buf.length < 22) throw unreadable;
  // The end-of-central-directory record sits in the last 22 bytes plus up to 64KB of comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw unreadable;
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || cdOffset === 0xffffffff) {
    // ZIP64. Excel never writes it for a file this size; a workbook that needs it is not a program.
    throw new SpreadsheetReadError("That Excel file is too large to import. Save just the program's sheet as its own file and upload that.");
  }
  const entries = new Map<string, Buffer>();
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIGNATURE) throw unreadable;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;

    if (flags & 0x1) {
      throw new SpreadsheetReadError("That Excel file is password-protected. Remove the password in Excel, save it, and upload it again.");
    }
    total += uncompressedSize;
    if (total > MAX_UNPACKED_BYTES) {
      throw new SpreadsheetReadError("That Excel file is too large to import. Save just the program's sheet as its own file and upload that.");
    }
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw unreadable;
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = buf.subarray(dataStart, dataStart + compressedSize);
    if (data.length !== compressedSize) throw unreadable;
    if (name.endsWith("/")) continue; // a directory entry
    if (method === 0) {
      entries.set(name, Buffer.from(data));
    } else if (method === 8) {
      try {
        entries.set(name, inflateRawSync(data, { maxOutputLength: Math.max(1, uncompressedSize) }));
      } catch {
        throw unreadable;
      }
    } else {
      throw unreadable;
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------------------------

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`));
  return m ? decodeXml(m[1]) : undefined;
}

/** All the text runs inside one <si> or <is>, joined: a rich-text cell is several <r><t> runs. */
function textRuns(xml: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  // Phonetic runs (<rPh>) are a reading aid for East Asian text, not the cell's content.
  const withoutPhonetic = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, "");
  while ((m = re.exec(withoutPhonetic))) out += m[1] != null ? decodeXml(m[1]) : "";
  return out;
}

function readSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] != null ? textRuns(m[1]) : "");
  return out;
}

type CellFormat = "date" | "percent" | "plain";

// Excel's built-in date and time formats, by id. Anything else is a custom format read below.
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);
const BUILTIN_PERCENT_FORMATS = new Set([9, 10]);

function formatOfCode(code: string): CellFormat {
  // Strip quoted literals, escaped characters and [colour]/[locale] sections before looking.
  const bare = code.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "");
  if (bare.includes("%")) return "percent";
  // "m" alone is a month or a minute; only a d or a y makes it a date. "General" holds neither.
  if (/[dy]/i.test(bare.replace(/General/gi, ""))) return "date";
  return "plain";
}

/** Style index (the `s` on a cell) to what kind of number it shows. */
function readCellFormats(xml: string | undefined): CellFormat[] {
  if (!xml) return [];
  const custom = new Map<number, CellFormat>();
  const numFmtRe = /<numFmt\s[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = numFmtRe.exec(xml))) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode") ?? "";
    custom.set(id, formatOfCode(code));
  }
  const xfsBlock = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!xfsBlock) return [];
  const out: CellFormat[] = [];
  const xfRe = /<xf\s[^>]*?\/?>/g;
  while ((m = xfRe.exec(xfsBlock[1]))) {
    const id = Number(attr(m[0], "numFmtId") ?? 0);
    if (custom.has(id)) out.push(custom.get(id)!);
    else if (BUILTIN_DATE_FORMATS.has(id)) out.push("date");
    else if (BUILTIN_PERCENT_FORMATS.has(id)) out.push("percent");
    else out.push("plain");
  }
  return out;
}

/** "AB" -> 27 (0-based 27 is column AB). */
function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** An Excel serial day number to YYYY-MM-DD (the 1900 date system, which every modern file uses). */
export function excelSerialToIsoDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function formatNumber(raw: string, format: CellFormat): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (format === "date" && n > 0 && n < 2958466) {
    return Number.isInteger(n) ? excelSerialToIsoDate(n) : excelSerialToIsoDate(Math.floor(n));
  }
  if (format === "percent") {
    return `${Math.round(n * 10000) / 100}%`;
  }
  // Floating-point noise from Excel's binary storage ("0.30000000000000004") is not the coach's.
  return String(Math.round(n * 1e9) / 1e9);
}

function readSheet(xml: string, shared: string[], formats: CellFormat[]): string[][] {
  const grid: string[][] = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let rm: RegExpExecArray | null;
  let nextRow = 0;
  while ((rm = rowRe.exec(xml))) {
    const rowAttr = rm[1] ?? "";
    const rIndex = attr(rowAttr, "r");
    const rowIdx = rIndex ? Number(rIndex) - 1 : nextRow;
    nextRow = rowIdx + 1;
    const body = rm[2] ?? "";
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let nextCol = 0;
    while ((cm = cellRe.exec(body))) {
      const cAttr = cm[1];
      const inner = cm[2] ?? "";
      const ref = attr(cAttr, "r");
      const col = ref ? columnIndex(ref.replace(/\d+/g, "")) : nextCol;
      nextCol = col + 1;
      const type = attr(cAttr, "t");
      const style = Number(attr(cAttr, "s") ?? 0);
      const v = inner.match(/<v>([\s\S]*?)<\/v>/);
      let text = "";
      if (type === "s") {
        text = v ? (shared[Number(v[1])] ?? "") : "";
      } else if (type === "inlineStr") {
        const is = inner.match(/<is>([\s\S]*?)<\/is>/);
        text = is ? textRuns(is[1]) : "";
      } else if (type === "str") {
        text = v ? decodeXml(v[1]) : "";
      } else if (type === "b") {
        text = v ? (v[1] === "1" ? "TRUE" : "FALSE") : "";
      } else if (type === "e") {
        text = v ? decodeXml(v[1]) : "";
      } else {
        text = v ? formatNumber(decodeXml(v[1]), formats[style] ?? "plain") : "";
      }
      while (cells.length < col) cells.push("");
      cells[col] = text.trim();
    }
    while (grid.length < rowIdx) grid.push([]);
    grid[rowIdx] = cells;
  }
  while (grid.length && grid[grid.length - 1].every((c) => c === "")) grid.pop();
  return grid;
}

function resolveTarget(target: string): string {
  // Relationship targets are relative to xl/ ("worksheets/sheet1.xml") or absolute ("/xl/...").
  if (target.startsWith("/")) return target.slice(1);
  const parts = `xl/${target}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== ".") out.push(part);
  }
  return out.join("/");
}

/** Every sheet in an .xlsx, in workbook order, as a grid of cell text. */
export function readXlsx(buf: Buffer): SheetGrid[] {
  const entries = readZipEntries(buf);
  const text = (name: string) => entries.get(name)?.toString("utf8");
  const workbook = text("xl/workbook.xml");
  if (!workbook) {
    throw new SpreadsheetReadError(
      "That file is a ZIP but not an Excel workbook Forge can read. Save it from Excel as .xlsx or CSV and upload that.",
    );
  }
  const rels = new Map<string, string>();
  const relsXml = text("xl/_rels/workbook.xml.rels") ?? "";
  const relRe = /<Relationship\s[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(relsXml))) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) rels.set(id, resolveTarget(target));
  }
  const shared = readSharedStrings(text("xl/sharedStrings.xml"));
  const formats = readCellFormats(text("xl/styles.xml"));
  const sheets: SheetGrid[] = [];
  const sheetRe = /<sheet\s[^>]*>/g;
  let index = 0;
  while ((m = sheetRe.exec(workbook))) {
    index++;
    const name = attr(m[0], "name") ?? `Sheet ${index}`;
    const relId = attr(m[0], "r:id");
    const path = (relId && rels.get(relId)) || `xl/worksheets/sheet${index}.xml`;
    const xml = text(path);
    if (!xml) continue; // a chart sheet or a sheet the file names and does not hold
    sheets.push({ name, rows: readSheet(xml, shared, formats) });
  }
  if (sheets.length === 0) {
    throw new SpreadsheetReadError("That Excel file has no sheets Forge can read. Save it again as .xlsx or CSV and upload that.");
  }
  return sheets;
}

/** A grid as plain text for the model: one line per row, cells separated by " | ", the row
 * number in front so a note about "row 14" can be traced back to the coach's own sheet. */
export function gridToText(sheets: SheetGrid[]): string {
  const out: string[] = [];
  for (const sheet of sheets) {
    if (sheets.length > 1) out.push(`=== Sheet: ${sheet.name} ===`);
    sheet.rows.forEach((row, i) => {
      if (row.every((c) => c === "")) {
        out.push(`R${i + 1}:`);
        return;
      }
      // Trailing empty cells carry nothing.
      let end = row.length;
      while (end > 0 && row[end - 1] === "") end--;
      out.push(`R${i + 1}: ${row.slice(0, end).join(" | ")}`);
    });
  }
  return out.join("\n");
}
