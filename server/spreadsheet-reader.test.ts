/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-loop-statements, ts-patterns/require-regex-example -- test fixtures are literal byte layouts and expected cells */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import {
  SpreadsheetReadError,
  excelSerialToIsoDate,
  gridToText,
  parseCsv,
  readXlsx,
  readZipEntries,
} from "./spreadsheet-reader";

const FIXTURES = path.join(__dirname, "__fixtures__", "program-import");

/** A minimal ZIP writer, so a test can build a workbook byte by byte and know exactly what is in
 * it. `stored` entries are written uncompressed, the rest deflated, which covers both methods. */
function buildZip(files: { name: string; data: string; stored?: boolean; encrypted?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.from(f.data, "utf8");
    const body = f.stored ? raw : deflateRawSync(raw);
    const name = Buffer.from(f.name, "utf8");
    const flags = f.encrypted ? 1 : 0;
    const method = f.stored ? 0 : 8;
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function handBuiltWorkbook(): Buffer {
  return buildZip([
    {
      name: "xl/workbook.xml",
      data: `<workbook xmlns:r="r"><sheets><sheet name="Lower &amp; Upper" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      stored: true,
    },
    {
      name: "xl/sharedStrings.xml",
      data: `<sst><si><t>Exercise</t></si><si><t>Sets</t></si><si><r><t>Back </t></r><r><t xml:space="preserve">Squat</t></r></si><si><t>Pause &amp; hold &lt;2s&gt;</t></si></sst>`,
    },
    {
      name: "xl/styles.xml",
      data: `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="9"/><xf numFmtId="164"/></cellXfs></styleSheet>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data:
        `<worksheet><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Load</t></is></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>5</v></c><c r="D2" s="1"><v>0.75</v></c><c r="E2" s="2"><v>46349</v></c></row>` +
        `<row r="4"><c r="A4" t="str"><v>Bench</v></c><c r="C4" t="s"><v>3</v></c><c r="F4" t="b"><v>1</v></c><c r="G4"><v>0.30000000000000004</v></c></row>` +
        `</sheetData></worksheet>`,
    },
  ]);
}

describe("parseCsv", () => {
  it("reads quoted fields with commas, newlines and doubled quotes", () => {
    const rows = parseCsv(`Exercise,Sets,Notes\r\n"Squat, back",5,"Belt ""on""\ntop set"\nRDL,3,\n`);
    expect(rows).toEqual([
      ["Exercise", "Sets", "Notes"],
      ["Squat, back", "5", 'Belt "on"\ntop set'],
      ["RDL", "3", ""],
    ]);
  });

  it("drops a byte-order mark and guesses a semicolon or tab delimiter", () => {
    expect(parseCsv("﻿Exercise;Sets\nSquat;5")).toEqual([["Exercise", "Sets"], ["Squat", "5"]]);
    expect(parseCsv("Exercise\tSets\nSquat\t5")).toEqual([["Exercise", "Sets"], ["Squat", "5"]]);
  });

  it("keeps a blank row in the middle (it separates days) and drops blank rows at the end", () => {
    expect(parseCsv("Day 1\n\nDay 2\n\n\n")).toEqual([["Day 1"], [""], ["Day 2"]]);
  });
});

describe("readXlsx on a workbook built byte by byte", () => {
  const sheets = readXlsx(handBuiltWorkbook());

  it("reads shared strings, rich-text runs, inline strings, entities and the sheet name", () => {
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Lower & Upper");
    expect(sheets[0].rows[0]).toEqual(["Exercise", "Sets", "", "Load"]);
    expect(sheets[0].rows[1][0]).toBe("Back Squat");
    expect(sheets[0].rows[3][2]).toBe("Pause & hold <2s>");
  });

  it("formats a percentage cell as a percentage and a date cell as a date", () => {
    expect(sheets[0].rows[1][3]).toBe("75%");
    expect(sheets[0].rows[1][4]).toBe(excelSerialToIsoDate(46349));
    expect(excelSerialToIsoDate(46349)).toBe("2026-11-23");
  });

  it("places cells by their reference, keeps a skipped row blank, and cleans float noise", () => {
    expect(sheets[0].rows[2]).toEqual([]);
    expect(sheets[0].rows[3]).toEqual(["Bench", "", "Pause & hold <2s>", "", "", "TRUE", "0.3"]);
  });

  it("renders the grid with row numbers for the model", () => {
    const text = gridToText(sheets);
    expect(text.split("\n")[0]).toBe("R1: Exercise | Sets |  | Load");
    expect(text).toContain("R3:");
    expect(text).toContain("R4: Bench |  | Pause & hold <2s> |  |  | TRUE | 0.3");
  });
});

describe("readXlsx on real files", () => {
  for (const file of ["openpyxl-program.xlsx", "libreoffice-program.xlsx"]) {
    it(`reads ${file}`, () => {
      const sheets = readXlsx(readFileSync(path.join(FIXTURES, file)));
      expect(sheets.map((s) => s.name)).toEqual(["Week 1", "Notes"]);
      const rows = sheets[0].rows;
      expect(rows[0]).toEqual(["Day", "Date", "Exercise", "Sets", "Reps", "Load", "Rest", "Tempo", "Notes"]);
      expect(rows[1].slice(0, 6)).toEqual(["Day 1 - Lower", "2026-11-23", "Back Squat", "5", "5", "75%"]);
      expect(rows[1][6]).toBe("3:00");
      expect(rows[3][2]).toBe("Bulgrian Split Squat");
      expect(rows[3][4]).toBe("8 each");
      expect(rows[6][2]).toBe("Bench Press");
      expect(rows[6][5]).toBe("80%");
      expect(rows[6][8]).toBe('Pause & "touch"');
      expect(sheets[1].rows[0][0]).toBe("Deload every 4th week");
    });
  }
});

describe("refusals are sentences", () => {
  it("a file that is not a ZIP", () => {
    expect(() => readZipEntries(Buffer.from("not a zip at all, just some text"))).toThrow(SpreadsheetReadError);
  });

  it("a password-protected entry says so", () => {
    const zip = buildZip([{ name: "xl/workbook.xml", data: "<workbook/>", encrypted: true }]);
    expect(() => readZipEntries(zip)).toThrow(/password/);
  });

  it("a ZIP that is not a workbook", () => {
    const zip = buildZip([{ name: "word/document.xml", data: "<doc/>" }]);
    expect(() => readXlsx(zip)).toThrow(/not an Excel workbook/);
  });

  it("an entry whose declared size is a zip bomb is refused before it is inflated", () => {
    const zip = buildZip([{ name: "xl/workbook.xml", data: "<workbook/>" }]);
    // Rewrite the central directory's uncompressed size to 2GB.
    const cd = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(0x7fffffff, cd + 24);
    expect(() => readZipEntries(zip)).toThrow(/too large/);
  });

  it("a truncated file", () => {
    const zip = handBuiltWorkbook();
    expect(() => readXlsx(zip.subarray(0, zip.length - 40))).toThrow(SpreadsheetReadError);
  });
});
