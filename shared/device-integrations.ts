/** DEVICE INTEGRATIONS, the rules (2026-11-21). A coach connects a force plate or a velocity
 * device and its readings flow into Forge; a device with no API is a CSV upload.
 *
 * What lives here is pure so the server, the client and `npm test` share one copy:
 *   - the vendor list and what each one needs from the coach;
 *   - athlete matching (email first, then an EXACT name; anything else is left for the coach);
 *   - the CSV parser and column mapping;
 *   - the numbers a reading carries, DERIVED FROM ITS RAW PAYLOAD ON READ. Nothing stores a
 *     derived number (the Anvil's rule): a better reading of a vendor's payload later moves every
 *     past reading, and a raw row replays.
 *
 * A device number is the DEVICE's number. It is labelled with the device's name and never with
 * the camera's accuracy caveat, because it is not a camera number. */

export const DEVICE_VENDORS = ["hawkin", "gymaware", "vald", "perch", "catapult", "csv"] as const;
export type DeviceVendor = (typeof DEVICE_VENDORS)[number];

/** Vendors connected with credentials (everything but the CSV upload). */
export const CONNECTABLE_VENDORS = ["hawkin", "gymaware", "vald", "perch", "catapult"] as const;
export type ConnectableVendor = (typeof CONNECTABLE_VENDORS)[number];

export type DeviceCredentialField = { key: string; label: string; secret: boolean; help: string };

export type VendorInfo = {
  vendor: DeviceVendor;
  /** What the coach and every label call it. */
  name: string;
  /** What it measures, in a few words. */
  measures: string;
  /** True when Forge can pull from it today. False is "awaiting partner access": the adapter is
   *  built and never pretends to sync. */
  syncsToday: boolean;
  /** Where the coach finds the key, in one sentence. */
  whereToFindIt: string;
  fields: DeviceCredentialField[];
};

export const AWAITING_PARTNER_ACCESS =
  "Forge has applied to this company for partner access. Until they grant it nothing syncs from here; export a CSV from the device and upload it below instead.";

export const VENDORS: Record<DeviceVendor, VendorInfo> = {
  hawkin: {
    vendor: "hawkin",
    name: "Hawkin Dynamics",
    measures: "force plate jumps and tests",
    syncsToday: true,
    whereToFindIt: "An organization admin creates an Integration Key in the Hawkin cloud under Settings, Integrations.",
    fields: [
      { key: "integrationKey", label: "Integration Key", secret: true, help: "The long-lived key Hawkin shows once when it is created." },
      { key: "region", label: "Region (americas, europe or apac)", secret: false, help: "Leave blank for the Americas." },
    ],
  },
  gymaware: {
    vendor: "gymaware",
    name: "GymAware",
    measures: "bar velocity, power and rep data",
    syncsToday: true,
    whereToFindIt: "Needs the Premium Cloud licence. In GymAware Cloud, Settings, Tokens: create a token and note the Account ID shown there.",
    fields: [
      { key: "accountId", label: "Account ID", secret: false, help: "Shown on the GymAware Cloud tokens page." },
      { key: "token", label: "API Token", secret: true, help: "Create one token for Forge and use it nowhere else." },
    ],
  },
  vald: {
    vendor: "vald",
    name: "VALD ForceDecks",
    measures: "force plate jumps and tests",
    syncsToday: false,
    whereToFindIt: "VALD issues a client id, client secret and organization id to approved partners.",
    fields: [
      { key: "clientId", label: "Client ID", secret: false, help: "From VALD." },
      { key: "clientSecret", label: "Client Secret", secret: true, help: "From VALD." },
      { key: "organizationId", label: "Organization ID", secret: false, help: "From VALD." },
    ],
  },
  perch: {
    vendor: "perch",
    name: "Perch",
    measures: "bar velocity and power",
    syncsToday: false,
    whereToFindIt: "Perch (now part of Catapult) issues an API key on request.",
    fields: [{ key: "apiKey", label: "API Key", secret: true, help: "From Perch." }],
  },
  catapult: {
    vendor: "catapult",
    name: "Catapult OpenField",
    measures: "GPS and athlete load",
    syncsToday: false,
    whereToFindIt: "Catapult issues OpenField API credentials on request.",
    fields: [{ key: "apiToken", label: "API Token", secret: true, help: "From Catapult." }],
  },
  csv: {
    vendor: "csv",
    name: "CSV upload",
    measures: "any device that exports a spreadsheet (OVR Velocity, Vitruve, Perch and others)",
    syncsToday: true,
    whereToFindIt: "Export the session from the device's app as a CSV.",
    fields: [],
  },
};

export function isDeviceVendor(v: unknown): v is DeviceVendor {
  return typeof v === "string" && (DEVICE_VENDORS as readonly string[]).includes(v);
}

export function isConnectableVendor(v: unknown): v is ConnectableVendor {
  return typeof v === "string" && (CONNECTABLE_VENDORS as readonly string[]).includes(v);
}

/** What a reading is. A string column, not a pgEnum, so a new kind is not a migration. */
export const METRIC_KINDS = ["countermovement_jump", "force_plate_test", "bar_velocity_set", "csv_row"] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

// ---------------------------------------------------------------------------------------------
// Consent. Device readings are biometric data about athletes who may be minors, so they are gated
// exactly where the camera's capture data is gated: the athlete has not turned tracking off, and
// a biometric release is on file (given by the athlete, or by a guardian for a minor).

export type DeviceConsentRefusal = "tracking_off" | "no_biometric_consent";

export function deviceConsentRefusal(input: { trackingOptOut: boolean; biometricConsentOnFile: boolean }): DeviceConsentRefusal | null {
  if (input.trackingOptOut) return "tracking_off";
  if (!input.biometricConsentOnFile) return "no_biometric_consent";
  return null;
}

export const CONSENT_REFUSAL_SENTENCE: Record<DeviceConsentRefusal, string> = {
  tracking_off: "This athlete has turned tracking off, so Forge stores no device readings for them.",
  no_biometric_consent:
    "No video and biometric consent is on file for this athlete, so Forge stores no device readings for them until it is given.",
};

// ---------------------------------------------------------------------------------------------
// Matching a device's athlete to a Forge athlete. Email first, then an exact name (case and
// spacing aside). Two Forge athletes with the same name match neither: a guess would put one
// person's numbers on another, so the coach picks.

export type MatchCandidate = { id: number; name: string; email: string | null };
export type VendorAthlete = { vendorAthleteId: string; name: string | null; email: string | null };
export type MatchResult = { athleteId: number; matchedBy: "email" | "name" } | null;

/** Lower-cased with runs of whitespace folded to one space, so "  Jordan   Reyes " and
 *  "jordan reyes" are the same name and "Jordan Reye" is not. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? "").normalize("NFKC").trim().split(" ").filter(Boolean).join(" ").toLowerCase();
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function matchVendorAthlete(vendorAthlete: VendorAthlete, roster: readonly MatchCandidate[]): MatchResult {
  const email = normalizeEmail(vendorAthlete.email);
  if (email) {
    const byEmail = roster.filter((r) => normalizeEmail(r.email) === email);
    if (byEmail.length === 1) return { athleteId: byEmail[0].id, matchedBy: "email" };
  }
  const name = normalizeName(vendorAthlete.name);
  if (!name) return null;
  const byName = roster.filter((r) => normalizeName(r.name) === name);
  if (byName.length === 1) return { athleteId: byName[0].id, matchedBy: "name" };
  return null;
}

// ---------------------------------------------------------------------------------------------
// CSV. A hand-written RFC 4180 reader: quoted fields, doubled quotes, commas and newlines inside
// quotes, CRLF. No dependency (CLAUDE.md: a new npm package is how an audit goes red).

export const CSV_MAX_ROWS = 5000;

type CsvState = { rows: string[][]; row: string[]; field: string; quoted: boolean; justClosed: boolean };

const QUOTE = '"';
const COMMA = ",";
const NEWLINE = "\n";
const BYTE_ORDER_MARK = "\uFEFF";

/** One character of the scan. A quote opens a quoted field only at its start; inside one, a
 *  doubled quote is a literal quote (`"a ""b"" c"` reads `a "b" c`). */
function csvStep(s: CsvState, ch: string): CsvState {
  if (s.quoted) {
    if (ch !== QUOTE) return { ...s, field: s.field + ch };
    return { ...s, quoted: false, justClosed: true };
  }
  if (ch === QUOTE && s.justClosed) return { ...s, field: s.field + QUOTE, quoted: true, justClosed: false };
  if (ch === QUOTE && s.field === "") return { ...s, quoted: true, justClosed: false };
  if (ch === COMMA) return { ...s, row: [...s.row, s.field], field: "", justClosed: false };
  if (ch === NEWLINE) return { rows: [...s.rows, [...s.row, s.field]], row: [], field: "", quoted: false, justClosed: false };
  return { ...s, field: s.field + ch, justClosed: false };
}

export function parseCsv(text: string): string[][] {
  const unix = text.split("\r\n").join(NEWLINE).split("\r").join(NEWLINE);
  const src = unix.startsWith(BYTE_ORDER_MARK) ? unix.slice(1) : unix;
  const end = Array.from(src).reduce(csvStep, { rows: [], row: [], field: "", quoted: false, justClosed: false });
  const rows = end.field !== "" || end.row.length > 0 ? [...end.rows, [...end.row, end.field]] : end.rows;
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** The fields a coach can map a column onto. */
export const CSV_FIELDS = [
  "athlete",
  "email",
  "date",
  "exercise",
  "load",
  "meanVelocity",
  "peakVelocity",
  "power",
  "reps",
  "jumpHeight",
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
export type CsvMapping = Partial<Record<CsvField, string>>;
export type LoadUnit = "lb" | "kg";
/** Jump height as the device exports it. */
export type HeightUnit = "cm" | "in" | "m";

export const CSV_FIELD_LABELS: Record<CsvField, string> = {
  athlete: "Athlete name",
  email: "Athlete email",
  date: "Date / time",
  exercise: "Exercise",
  load: "Load",
  meanVelocity: "Mean velocity (m/s)",
  peakVelocity: "Peak velocity (m/s)",
  power: "Power (W)",
  reps: "Reps",
  jumpHeight: "Jump height",
};

/** A header reduced to its letters and digits, lower case: "Mean Velocity (m/s)" -> "meanvelocityms". */
export function flatKey(key: string): string {
  return Array.from(key.toLowerCase())
    .filter((c) => (c >= "a" && c <= "z") || (c >= "0" && c <= "9"))
    .join("");
}

/** For each field, flattened header fragments that identify it, most specific first. */
const CSV_FIELD_HINTS: readonly (readonly [CsvField, readonly string[]])[] = [
  ["email", ["email", "mail"]],
  ["meanVelocity", ["meanvel", "avgvel", "averagevel", "averagemeanvel"]],
  ["peakVelocity", ["peakvel", "maxvel", "averagepeakvel"]],
  ["jumpHeight", ["jumpheight", "height"]],
  ["power", ["power", "watt"]],
  ["reps", ["reps", "repcount", "repetitions", "rep"]],
  ["date", ["timestamp", "datetime", "date", "time", "recorded"]],
  ["exercise", ["exercise", "movement", "activity", "lift"]],
  ["load", ["load", "weight", "mass"]],
  ["athlete", ["athletename", "athlete", "fullname", "name", "player", "user"]],
];

/** A first guess at the mapping from the header names. The coach confirms it on the preview;
 *  a guess is never imported unseen. Each header is used once. */
export function guessCsvMapping(headers: readonly string[]): CsvMapping {
  return CSV_FIELD_HINTS.reduce<{ mapping: CsvMapping; used: string[] }>(
    (acc, [field, hints]) => {
      const header = hints
        .map((hint) => headers.find((h) => !acc.used.includes(h) && flatKey(h).includes(hint)))
        .find((h): h is string => h !== undefined);
      return header ? { mapping: { ...acc.mapping, [field]: header }, used: [...acc.used, header] } : acc;
    },
    { mapping: {}, used: [] },
  ).mapping;
}

const NUMBER_CHARS = "0123456789.-";

/** A number as a spreadsheet writes it: "0.82", " 1,240 ", "0.82 m/s". Empty or unreadable is
 *  null, never zero -- a zero is a measurement. */
export function readNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const chars = Array.from(raw.split(",").join("").trim());
  const startAt = chars.findIndex((c) => NUMBER_CHARS.includes(c));
  if (startAt < 0) return null;
  const rest = chars.slice(startAt);
  const stopAt = rest.findIndex((c, i) => !NUMBER_CHARS.includes(c) || (c === "-" && i > 0));
  const text = (stopAt < 0 ? rest : rest.slice(0, stopAt)).join("");
  if (text === "" || text === "-" || text === ".") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const EPOCH_SECONDS_MAX_DIGITS = 10;
const EPOCH_MIN_DIGITS = 9;
const EPOCH_MAX_DIGITS = 13;
const MS_PER_SECOND = 1000;
const NOON_HOUR = 12;
const CENTURY = 2000;
const SHORT_YEAR_DIGITS = 2;
const DATE_PARTS = 3;

function allDigits(s: string): boolean {
  return s.length > 0 && Array.from(s).every((c) => c >= "0" && c <= "9");
}

/** "11/20/2026", "11/20/26 2:03 PM", "11/20/2026 14:03:09" -- the US export format OVR and
 *  Vitruve write. Anything else is null and goes to the ISO reader. */
function readUsDate(s: string): Date | null {
  const [datePart, timePart = "", meridiem = ""] = s.split(" ").filter(Boolean);
  const parts = (datePart ?? "").split("/");
  if (parts.length !== DATE_PARTS || !parts.every(allDigits)) return null;
  const [month, day, yearText] = parts;
  const year = Number(yearText.length === SHORT_YEAR_DIGITS ? CENTURY + Number(yearText) : yearText);
  const [hourText = "0", minuteText = "0", secondText = "0"] = timePart ? timePart.split(":") : [];
  const hour12 = Number(hourText);
  const pm = meridiem.toLowerCase() === "pm";
  const am = meridiem.toLowerCase() === "am";
  const hourOnTheClock = hour12 === NOON_HOUR ? 0 : hour12;
  const hour = pm || am ? hourOnTheClock + (pm ? NOON_HOUR : 0) : hour12;
  const d = new Date(year, Number(month) - 1, Number(day), hour, Number(minuteText), Number(secondText));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A date as a device exports it: ISO, "2026-11-20 14:03", the US format above, or epoch
 *  seconds or milliseconds. Unreadable is null. */
export function readDate(raw: string | null | undefined): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (allDigits(s) && s.length >= EPOCH_MIN_DIGITS && s.length <= EPOCH_MAX_DIGITS) {
    const n = Number(s);
    return new Date(s.length <= EPOCH_SECONDS_MAX_DIGITS ? n * MS_PER_SECOND : n);
  }
  if (s.includes("/")) return readUsDate(s);
  const d = new Date(s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type CsvRowRaw = {
  /** The row exactly as the file had it, keyed by header. */
  columns: Record<string, string>;
  mapping: CsvMapping;
  loadUnit: LoadUnit;
  heightUnit: HeightUnit;
  /** What the coach named the device ("OVR Velocity", "Vitruve"), for the label. */
  deviceName: string;
};

export type CsvPreviewRow = {
  /** The line in the file, counting the header as line 1, so a coach can find it. */
  rowNumber: number;
  athleteName: string | null;
  athleteEmail: string | null;
  recordedAt: string | null;
  exerciseName: string | null;
  raw: CsvRowRaw;
  problem: string | null;
};

const FIRST_DATA_LINE = 2;

/** Every data row of the file, mapped, with what is wrong with it said rather than dropped. */
export function csvRowsFor(
  rows: readonly string[][],
  mapping: CsvMapping,
  opts: { loadUnit: LoadUnit; heightUnit: HeightUnit; deviceName: string },
): { headers: string[]; rows: CsvPreviewRow[]; truncated: boolean } {
  const [headerRow = [], ...data] = rows;
  const headers = headerRow.map((h) => h.trim());
  const out = data.slice(0, CSV_MAX_ROWS).map((cells, i): CsvPreviewRow => {
    const columns = Object.fromEntries(headers.map((h, j) => [h, (cells[j] ?? "").trim()]));
    const get = (f: CsvField) => {
      const header = mapping[f];
      return header ? (columns[header] ?? "") : "";
    };
    const athleteName = get("athlete") || null;
    const athleteEmail = get("email") || null;
    const date = readDate(get("date"));
    const raw: CsvRowRaw = { columns, mapping, loadUnit: opts.loadUnit, heightUnit: opts.heightUnit, deviceName: opts.deviceName };
    const anyNumber = Object.values(csvReadingNumbers(raw)).some((v) => typeof v === "number");
    const problems = [
      !athleteName && !athleteEmail ? "no athlete name or email" : null,
      !mapping.date ? "no date column mapped" : null,
      mapping.date && !date ? `the date "${get("date")}" could not be read` : null,
      !anyNumber ? "no number in the mapped columns" : null,
    ].filter((p): p is string => p !== null);
    return {
      rowNumber: i + FIRST_DATA_LINE,
      athleteName,
      athleteEmail,
      recordedAt: date ? date.toISOString() : null,
      exerciseName: get("exercise") || null,
      raw,
      problem: problems.length ? problems.join("; ") : null,
    };
  });
  return { headers, rows: out, truncated: data.length > CSV_MAX_ROWS };
}

// FNV-1a over 32 bits, twice with different offsets for 64 bits of key: stable on the server and
// the client, no crypto import.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX = 16;

function fnv(s: string, offset: number): number {
  return Array.from(s).reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), FNV_PRIME) >>> 0, offset);
}

/** A stable id for a CSV row so a second upload of the same file imports nothing new. */
export function csvRowKey(athleteId: number, row: CsvPreviewRow): string {
  const cols = Object.keys(row.raw.columns)
    .sort()
    .map((k) => `${k}=${row.raw.columns[k]}`)
    .join("|");
  const s = `${athleteId}|${cols}`;
  return `${athleteId}-${fnv(s, FNV_OFFSET).toString(HEX)}${fnv(s, FNV_PRIME).toString(HEX)}`;
}

// ---------------------------------------------------------------------------------------------
// The numbers a reading carries, computed from its raw payload. Every field may be null: a
// device that did not measure a thing is not a device that measured zero.

export type RepNumbers = { meanVelocityMps: number | null; peakVelocityMps: number | null; romCm: number | null };

export type ReadingNumbers = {
  meanVelocityMps: number | null;
  peakVelocityMps: number | null;
  powerW: number | null;
  loadKg: number | null;
  reps: number | null;
  jumpHeightCm: number | null;
  /** Per rep, where the device reports reps. */
  repNumbers: RepNumbers[];
};

const LB_PER_KG = 2.20462;
const CM_PER_IN = 2.54;
const CM_PER_M = 100;

const EMPTY: ReadingNumbers = {
  meanVelocityMps: null,
  peakVelocityMps: null,
  powerW: null,
  loadKg: null,
  reps: null,
  jumpHeightCm: null,
  repNumbers: [],
};

const CM_PER_HEIGHT_UNIT: Record<HeightUnit, number> = { cm: 1, in: CM_PER_IN, m: CM_PER_M };

export function csvReadingNumbers(raw: CsvRowRaw): ReadingNumbers {
  const get = (f: CsvField) => {
    const header = raw.mapping[f];
    return header ? readNumber(raw.columns[header]) : null;
  };
  const load = get("load");
  const height = get("jumpHeight");
  return {
    ...EMPTY,
    meanVelocityMps: get("meanVelocity"),
    peakVelocityMps: get("peakVelocity"),
    powerW: get("power"),
    loadKg: load == null || raw.loadUnit !== "lb" ? load : load / LB_PER_KG,
    reps: get("reps"),
    jumpHeightCm: height == null ? null : height * CM_PER_HEIGHT_UNIT[raw.heightUnit],
  };
}

/** The first number among an object's keys whose flattened name equals (or, with `prefix`,
 *  starts with) one of `names`, tried in order. Vendors label metrics "Jump Height(m)",
 *  "meanVelocity", "Mean Velocity". */
function findNumber(obj: unknown, names: readonly string[], prefix = false): number | null {
  if (!obj || typeof obj !== "object") return null;
  const entries = Object.entries(obj as Record<string, unknown>).map(([k, v]) => [flatKey(k), v] as const);
  return (
    names
      .map((name) => entries.filter(([k]) => (prefix ? k.startsWith(name) : k === name)).map(([, v]) => readNumber(v)))
      .flat()
      .find((n): n is number => n !== null) ?? null
  );
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

const timesOrNull = (v: number | null, factor: number) => (v == null ? null : v * factor);

/** Hawkin returns metrics as flat fields ("Jump Height(m)") or, with nestMetrics, a `metrics`
 *  array of { header, value }. */
export function hawkinReadingNumbers(raw: Record<string, unknown>): ReadingNumbers {
  const nested = Array.isArray(raw.metrics) ? (raw.metrics as { header?: string; name?: string; value?: unknown }[]) : null;
  const metrics = nested ? Object.fromEntries(nested.map((m) => [m.header ?? m.name ?? "", m.value])) : raw;
  return {
    ...EMPTY,
    jumpHeightCm: timesOrNull(findNumber(metrics, ["jumpheightm", "jumpheight"], true), CM_PER_M),
    powerW: findNumber(metrics, ["peakpropulsivepower", "peakpower"], true),
    peakVelocityMps: findNumber(metrics, ["peakpropulsivevelocity", "peakvelocity"], true),
    meanVelocityMps: findNumber(metrics, ["avgpropulsivevelocity", "meanpropulsivevelocity"], true),
  };
}

/** GymAware's /api/reps set: summary fields where present, and a `reps` array whose keys are the
 *  analysis labels (meanVelocity, peakVelocity, ...). Distances are metres. */
export function gymawareReadingNumbers(raw: Record<string, unknown>): ReadingNumbers {
  const reps = Array.isArray(raw.reps) ? (raw.reps as Record<string, unknown>[]) : [];
  const repNumbers: RepNumbers[] = reps.map((r) => ({
    meanVelocityMps: findNumber(r, ["meanvelocity"]),
    peakVelocityMps: findNumber(r, ["peakvelocity"]),
    romCm: timesOrNull(findNumber(r, ["distance", "rangeofmotion", "rom", "displacement"]), CM_PER_M),
  }));
  return {
    ...EMPTY,
    meanVelocityMps: findNumber(raw, ["averagemeanvelocity"]) ?? average(repNumbers.map((r) => r.meanVelocityMps)),
    peakVelocityMps: findNumber(raw, ["averagepeakvelocity"]) ?? average(repNumbers.map((r) => r.peakVelocityMps)),
    powerW: findNumber(raw, ["averagemeanpower"]) ?? average(reps.map((r) => findNumber(r, ["meanpower"]))),
    loadKg: findNumber(raw, ["barweight"]),
    reps: findNumber(raw, ["repcount"]) ?? (reps.length || null),
    jumpHeightCm: timesOrNull(findNumber(raw, ["height"]), CM_PER_M),
    repNumbers,
  };
}

const READERS: Record<string, (raw: Record<string, unknown>) => ReadingNumbers> = {
  csv: (raw) => csvReadingNumbers(raw as unknown as CsvRowRaw),
  hawkin: hawkinReadingNumbers,
  gymaware: gymawareReadingNumbers,
};

/** One entry point: what the reading says, read off what the device sent. */
export function readingNumbers(vendor: string, raw: unknown): ReadingNumbers {
  const reader = READERS[vendor];
  if (!reader || !raw || typeof raw !== "object") return { ...EMPTY };
  return reader(raw as Record<string, unknown>);
}

/** The label a reading wears: the device's own name. */
export function readingDeviceName(vendor: string, raw: unknown): string {
  const named = vendor === "csv" && raw && typeof raw === "object" ? (raw as CsvRowRaw).deviceName : null;
  if (typeof named === "string" && named.trim()) return named.trim();
  return isDeviceVendor(vendor) ? VENDORS[vendor].name : vendor;
}
