/* DEVICE INTEGRATIONS, the server half (2026-11-21). The rules are in
 * shared/device-integrations.ts, the vendors in server/device-adapters.ts, the camera pairing in
 * shared/device-camera-pairing.ts. This file reads and writes the three device tables and owns
 * the routes.
 *
 * WHO MAY DO WHAT
 *   - Connect or disconnect a device: the PRIMARY coach (requirePrimaryCoach's rule:
 *     getEffectiveCoachIds puts the primary first). A connection belongs to the program, stored
 *     against the primary's id whichever coach is signed in.
 *   - See the devices page, press Sync now, link an unmatched athlete, upload a CSV: any coach on
 *     the program, and only for athletes in their own scope (athleteIsInCoachScope / ...Ids).
 *   - Read an athlete's device readings: a coach with that athlete in scope.
 *   - Admin: connection health (never a credential) and the calibration pairing export.
 *
 * CONSENT. A reading is stored only for an athlete who has not turned tracking off AND has a
 * video and biometric consent on file -- the gate the camera's capture data already has. For
 * anybody else nothing is stored, and the coach is told which of the two it is.
 *
 * Credentials are encrypted at rest with server/field-encryption.ts and never leave the server. */
import type { Express, Request } from "express";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { requireRole } from "./auth";
import { storage } from "./storage";
import { decryptFieldStrict, encryptField } from "./field-encryption";
import { adapterFor, DeviceVendorError, type FetchLike, type VendorReading } from "./device-adapters";
import {
  deviceAthleteLinks,
  deviceConnections,
  deviceReadings,
  exercises,
  users,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import {
  CONNECTABLE_VENDORS,
  CONSENT_REFUSAL_SENTENCE,
  VENDORS,
  csvRowKey,
  csvRowsFor,
  deviceConsentRefusal,
  guessCsvMapping,
  isConnectableVendor,
  matchVendorAthlete,
  parseCsv,
  readingDeviceName,
  readingNumbers,
  CSV_FIELDS,
  type ConnectableVendor,
  type CsvMapping,
  type CsvPreviewRow,
  type DeviceConsentRefusal,
  type MatchCandidate,
  type VendorAthlete,
} from "@shared/device-integrations";
import {
  DEFAULT_PAIRING_WINDOW_MINUTES,
  pairCameraSetsWithDeviceReadings,
  type CameraSetForPairing,
  type DeviceReadingForPairing,
} from "@shared/device-camera-pairing";

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const HTTP = { ok: OK, created: CREATED, noContent: NO_CONTENT, badRequest: BAD_REQUEST, forbidden: FORBIDDEN, notFound: NOT_FOUND } as const;
const DEVICE_NAME_MAX = 80;
const CREDENTIAL_MAX = 2000;
const HOUR_DIGITS = 2;
const DAY_MS = 86_400_000;
/** How far back a first sync, or a sync after an athlete was linked, reaches. */
export const LOOKBACK_DAYS = 30;
const MAX_CSV_CHARS = 5_000_000;
const PREVIEW_ROWS = 200;
const READINGS_PER_ATHLETE = 200;
const DEFAULT_CALIBRATION_DAYS = 14;
const MAX_CALIBRATION_DAYS = 90;
const MAX_WINDOW_MINUTES = 240;
const MAX_REP_OFFSET = 5;
const ISO_DATE_LENGTH = 10;
const NOON_HOUR = 12;
const ERROR_MAX = 500;

function currentUser(req: Request) {
  return req.user as { id: number; role: "coach" | "athlete" | "admin" | "guardian" };
}

// ---------------------------------------------------------------------------------------------
// The network, injectable so a test drives the real adapters against a fake vendor.

let deviceFetch: FetchLike = (url, init) => fetch(url, init);

/** Only for tests: replace the network the adapters see. */
export function setDeviceFetchForTests(fn: FetchLike | null): void {
  deviceFetch = fn ?? ((url, init) => fetch(url, init));
}

// ---------------------------------------------------------------------------------------------
// Credentials

export function sealCredentials(credentials: Record<string, string>): string {
  return encryptField(JSON.stringify(credentials));
}

export function openCredentials(sealed: string): Record<string, string> {
  const parsed: unknown = JSON.parse(decryptFieldStrict(sealed));
  return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
}

// ---------------------------------------------------------------------------------------------
// Who the program's athletes are, and whether a reading may be kept for them.

async function primaryOf(coachId: number): Promise<number> {
  return storage.getPrimaryCoachId(coachId);
}

async function isPrimaryCoach(coachId: number): Promise<boolean> {
  return (await storage.getEffectiveCoachIds(coachId))[0] === coachId;
}

async function candidatesFor(athleteIds: number[]): Promise<MatchCandidate[]> {
  if (athleteIds.length === 0) return [];
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(inArray(users.id, athleteIds), eq(users.role, "athlete")));
}

/** The whole program's roster, for matching at sync time (the connection is the program's). */
async function programRoster(primaryId: number): Promise<MatchCandidate[]> {
  return candidatesFor(await storage.getStaffRosterAthleteIds(primaryId));
}

/** The athletes THIS coach may see, for the pickers and the lists. */
async function scopedRoster(coachId: number): Promise<MatchCandidate[]> {
  return candidatesFor(await storage.athleteIdsInCoachScope(coachId));
}

export async function consentRefusalFor(athleteId: number): Promise<DeviceConsentRefusal | null> {
  const [row] = await db.select({ trackingOptOut: users.trackingOptOut }).from(users).where(eq(users.id, athleteId));
  if (!row) return "tracking_off";
  return deviceConsentRefusal({
    trackingOptOut: row.trackingOptOut,
    biometricConsentOnFile: await storage.hasBiometricConsent(athleteId),
  });
}

async function consentRefusals(athleteIds: number[]): Promise<Map<number, DeviceConsentRefusal | null>> {
  const unique = Array.from(new Set(athleteIds));
  const entries = await Promise.all(unique.map(async (id) => [id, await consentRefusalFor(id)] as const));
  return new Map(entries);
}

// ---------------------------------------------------------------------------------------------
// Storing readings

type StoreInput = {
  athleteId: number;
  primaryId: number;
  connectionId: number | null;
  vendor: string;
  vendorReadingId: string;
  recordedAt: Date;
  metricKind: string;
  exerciseName: string | null;
  raw: unknown;
};

/** Writes a reading once. A second sync or a second upload of the same file inserts nothing:
 *  the unique index on (program, vendor, the vendor's id) is the idempotency. Returns whether a
 *  row was written. */
async function storeReading(r: StoreInput): Promise<boolean> {
  const inserted = await db
    .insert(deviceReadings)
    .values({
      athleteId: r.athleteId,
      coachId: r.primaryId,
      connectionId: r.connectionId,
      vendor: r.vendor,
      vendorReadingId: r.vendorReadingId,
      recordedAt: r.recordedAt,
      metricKind: r.metricKind,
      exerciseName: r.exerciseName,
      raw: r.raw,
    })
    .onConflictDoNothing({ target: [deviceReadings.coachId, deviceReadings.vendor, deviceReadings.vendorReadingId] })
    .returning({ id: deviceReadings.id });
  return inserted.length > 0;
}

export type SyncSummary = {
  status: "active" | "error" | "awaiting_partner_access";
  stored: number;
  alreadyHad: number;
  /** Readings whose device athlete is not linked to a Forge athlete yet. */
  unmatchedReadings: number;
  /** Readings not stored for a consent reason, by athlete. */
  skippedForConsent: { athleteId: number; reason: DeviceConsentRefusal; readings: number }[];
  message: string | null;
};

const emptySummary = (status: SyncSummary["status"], message: string | null): SyncSummary => ({
  status,
  stored: 0,
  alreadyHad: 0,
  unmatchedReadings: 0,
  skippedForConsent: [],
  message,
});

/** Adds the vendor's athletes it has not seen, matched by email then exact name. A link the coach
 *  made, or one already matched, is never overwritten. */
async function refreshLinks(connectionId: number, vendorAthletes: VendorAthlete[], roster: MatchCandidate[]) {
  const existing = await db.select().from(deviceAthleteLinks).where(eq(deviceAthleteLinks.connectionId, connectionId));
  const known = new Map(existing.map((l) => [l.vendorAthleteId, l]));
  await Promise.all(
    vendorAthletes.map(async (va) => {
      const link = known.get(va.vendorAthleteId);
      if (link?.athleteId) return;
      const match = matchVendorAthlete(va, roster);
      if (link) {
        if (match) {
          await db
            .update(deviceAthleteLinks)
            .set({ athleteId: match.athleteId, matchedBy: match.matchedBy, vendorAthleteName: va.name, updatedAt: new Date() })
            .where(eq(deviceAthleteLinks.id, link.id));
        }
        return;
      }
      await db
        .insert(deviceAthleteLinks)
        .values({
          connectionId,
          vendorAthleteId: va.vendorAthleteId,
          vendorAthleteName: va.name,
          athleteId: match?.athleteId ?? null,
          matchedBy: match?.matchedBy ?? null,
        })
        .onConflictDoNothing();
    }),
  );
  return db.select().from(deviceAthleteLinks).where(eq(deviceAthleteLinks.connectionId, connectionId));
}

async function storeVendorReadings(
  readings: VendorReading[],
  links: Map<string, number | null>,
  ctx: { primaryId: number; connectionId: number; vendor: string },
): Promise<Omit<SyncSummary, "status" | "message">> {
  const linked = readings.filter((r) => links.get(r.vendorAthleteId));
  const refusals = await consentRefusals(linked.map((r) => links.get(r.vendorAthleteId) as number));
  const allowed = linked.filter((r) => !refusals.get(links.get(r.vendorAthleteId) as number));
  const written = await Promise.all(
    allowed.map((r) =>
      storeReading({
        athleteId: links.get(r.vendorAthleteId) as number,
        primaryId: ctx.primaryId,
        connectionId: ctx.connectionId,
        vendor: ctx.vendor,
        vendorReadingId: r.vendorReadingId,
        recordedAt: r.recordedAt,
        metricKind: r.metricKind,
        exerciseName: r.exerciseName,
        raw: r.raw,
      }),
    ),
  );
  const skipped = linked
    .map((r) => links.get(r.vendorAthleteId) as number)
    .reduce<Map<number, number>>((m, id) => (refusals.get(id) ? m.set(id, (m.get(id) ?? 0) + 1) : m), new Map());
  return {
    stored: written.filter(Boolean).length,
    alreadyHad: written.filter((w) => !w).length,
    unmatchedReadings: readings.length - linked.length,
    skippedForConsent: Array.from(skipped.entries()).map(([athleteId, count]) => ({
      athleteId,
      reason: refusals.get(athleteId) as DeviceConsentRefusal,
      readings: count,
    })),
  };
}

function errorMessage(err: unknown): string {
  const raw = err instanceof DeviceVendorError || err instanceof Error ? err.message : String(err);
  return raw.slice(0, ERROR_MAX);
}

/** Pulls one connection. Never throws: a failure is recorded on the connection and returned. */
export async function syncConnection(connectionId: number, now: Date = new Date()): Promise<SyncSummary> {
  const [conn] = await db.select().from(deviceConnections).where(eq(deviceConnections.id, connectionId));
  if (!conn) return emptySummary("error", "That connection no longer exists.");
  if (!isConnectableVendor(conn.vendor)) return emptySummary("error", "Unknown device.");
  const adapter = adapterFor(conn.vendor, deviceFetch);
  if (!adapter.live) {
    const validation = await adapter.validate({});
    const message = validation.ok ? null : validation.message;
    await db
      .update(deviceConnections)
      .set({ status: "awaiting_partner_access", lastError: message, updatedAt: now })
      .where(eq(deviceConnections.id, conn.id));
    return emptySummary("awaiting_partner_access", message);
  }
  try {
    const credentials = openCredentials(conn.credentials);
    const roster = await programRoster(conn.coachId);
    const listed = await adapter.listAthletes(credentials);
    const lookbackStart = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
    const { readings, nextCursor } = await adapter.fetchReadingsSince(credentials, conn.syncCursor, lookbackStart);
    const listedIds = new Set(listed.map((a) => a.vendorAthleteId));
    const fromReadings = Array.from(
      new Map(
        readings
          .filter((r) => !listedIds.has(r.vendorAthleteId))
          .map((r) => [r.vendorAthleteId, { vendorAthleteId: r.vendorAthleteId, name: r.vendorAthleteName, email: null }]),
      ).values(),
    );
    const links = await refreshLinks(conn.id, [...listed, ...fromReadings], roster);
    const linkMap = new Map(links.map((l) => [l.vendorAthleteId, l.athleteId]));
    const result = await storeVendorReadings(readings, linkMap, { primaryId: conn.coachId, connectionId: conn.id, vendor: conn.vendor });
    await db
      .update(deviceConnections)
      .set({ status: "active", syncCursor: nextCursor, lastSyncedAt: now, lastError: null, updatedAt: now })
      .where(eq(deviceConnections.id, conn.id));
    return { status: "active", message: null, ...result };
  } catch (err) {
    const message = errorMessage(err);
    await db
      .update(deviceConnections)
      .set({ status: "error", lastError: message, updatedAt: now })
      .where(eq(deviceConnections.id, conn.id));
    return emptySummary("error", message);
  }
}

/** Every connection that can pull, one after another. Never throws. */
export async function syncAllConnections(): Promise<{ connections: number; stored: number; failed: number }> {
  const rows = await db.select({ id: deviceConnections.id, vendor: deviceConnections.vendor }).from(deviceConnections);
  const live = rows.filter((r) => isConnectableVendor(r.vendor) && VENDORS[r.vendor].syncsToday);
  const results = await live.reduce<Promise<SyncSummary[]>>(
    async (acc, r) => [...(await acc), await syncConnection(r.id)],
    Promise.resolve([]),
  );
  return {
    connections: results.length,
    stored: results.reduce((n, r) => n + r.stored, 0),
    failed: results.filter((r) => r.status === "error").length,
  };
}

// ---------------------------------------------------------------------------------------------
// CSV

const csvBodySchema = z.object({
  csv: z.string().min(1).max(MAX_CSV_CHARS),
  mapping: z.record(z.string(), z.string()).optional(),
  loadUnit: z.enum(["lb", "kg"]).default("lb"),
  heightUnit: z.enum(["cm", "in", "m"]).default("cm"),
  deviceName: z.string().trim().max(DEVICE_NAME_MAX).default(""),
  /** The coach's pick for a row that did not match, by row number. */
  athleteForRow: z.record(z.string(), z.number().int().positive()).optional(),
});

function cleanMapping(raw: Record<string, string> | undefined, headers: string[]): CsvMapping {
  if (!raw) return guessCsvMapping(headers);
  return Object.fromEntries(
    Object.entries(raw).filter(([field, header]) => (CSV_FIELDS as readonly string[]).includes(field) && headers.includes(header)),
  ) as CsvMapping;
}

type CsvRowPlan = CsvPreviewRow & {
  athleteId: number | null;
  athleteDisplayName: string | null;
  matchedBy: "email" | "name" | "coach" | null;
  consentRefusal: DeviceConsentRefusal | null;
  consentSentence: string | null;
};

async function planCsv(coachId: number, body: z.infer<typeof csvBodySchema>) {
  const parsed = parseCsv(body.csv);
  const headers = (parsed[0] ?? []).map((h) => h.trim());
  const mapping = cleanMapping(body.mapping, headers);
  const { rows, truncated } = csvRowsFor(parsed, mapping, {
    loadUnit: body.loadUnit,
    heightUnit: body.heightUnit,
    deviceName: body.deviceName,
  });
  const roster = await scopedRoster(coachId);
  const rosterIds = new Set(roster.map((r) => r.id));
  const chosen = body.athleteForRow ?? {};
  const matched = rows.map((row) => {
    const pick = chosen[String(row.rowNumber)];
    if (pick && rosterIds.has(pick)) return { row, athleteId: pick, matchedBy: "coach" as const };
    const m = matchVendorAthlete({ vendorAthleteId: "", name: row.athleteName, email: row.athleteEmail }, roster);
    return { row, athleteId: m?.athleteId ?? null, matchedBy: m?.matchedBy ?? null };
  });
  const refusals = await consentRefusals(matched.flatMap((m) => (m.athleteId ? [m.athleteId] : [])));
  const names = new Map(roster.map((r) => [r.id, r.name]));
  const plan: CsvRowPlan[] = matched.map(({ row, athleteId, matchedBy }) => {
    const refusal = athleteId ? (refusals.get(athleteId) ?? null) : null;
    return {
      ...row,
      athleteId,
      athleteDisplayName: athleteId ? (names.get(athleteId) ?? null) : null,
      matchedBy,
      consentRefusal: refusal,
      consentSentence: refusal ? CONSENT_REFUSAL_SENTENCE[refusal] : null,
    };
  });
  return { headers, mapping, plan, truncated, roster };
}

// ---------------------------------------------------------------------------------------------
// Reads

function connectionView(c: typeof deviceConnections.$inferSelect) {
  const info = isConnectableVendor(c.vendor) ? VENDORS[c.vendor] : null;
  return {
    id: c.id,
    vendor: c.vendor,
    name: info?.name ?? c.vendor,
    status: c.status,
    lastSyncedAt: c.lastSyncedAt,
    lastError: c.lastError,
    createdAt: c.createdAt,
  };
}

export async function readingsForAthlete(primaryId: number, athleteId: number) {
  const rows = await db
    .select()
    .from(deviceReadings)
    .where(and(eq(deviceReadings.athleteId, athleteId), eq(deviceReadings.coachId, primaryId)))
    .orderBy(desc(deviceReadings.recordedAt))
    .limit(READINGS_PER_ATHLETE);
  return rows.map((r) => ({
    id: r.id,
    vendor: r.vendor,
    deviceName: readingDeviceName(r.vendor, r.raw),
    recordedAt: r.recordedAt,
    metricKind: r.metricKind,
    exerciseName: r.exerciseName,
    numbers: readingNumbers(r.vendor, r.raw),
  }));
}

// ---------------------------------------------------------------------------------------------
// The calibration pairing (admin). Records and changes no camera number.

type RepRow = { meanVelocityMps?: unknown; peakVelocityMps?: unknown; romCm?: unknown };
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function calibrationPairs(opts: { days: number; windowMinutes: number; deviceRepOffset: number }) {
  const since = new Date(Date.now() - opts.days * DAY_MS);
  const sinceIso = since.toISOString().slice(0, ISO_DATE_LENGTH);
  const sets = await db
    .select({
      setId: workoutSetEntries.id,
      athleteId: workoutLogs.athleteId,
      date: workoutLogs.date,
      completedAt: workoutLogs.completedAt,
      videoUploadedAt: workoutSetEntries.videoUploadedAt,
      exerciseName: exercises.name,
      meanVelocityMps: workoutSetEntries.meanVelocityMps,
      peakVelocityMps: workoutSetEntries.peakVelocityMps,
      romCm: workoutSetEntries.romCm,
      repBreakdown: workoutSetEntries.repBreakdown,
      setNumber: workoutSetEntries.setNumber,
      side: workoutSetEntries.side,
    })
    .from(workoutSetEntries)
    .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .leftJoin(exercises, eq(workoutLogEntries.exerciseId, exercises.id))
    .where(and(isNotNull(workoutSetEntries.meanVelocityMps), gte(workoutLogs.date, sinceIso)));
  const readings = await db
    .select()
    .from(deviceReadings)
    .where(and(eq(deviceReadings.metricKind, "bar_velocity_set"), gte(deviceReadings.recordedAt, new Date(since.getTime() - DAY_MS))));

  const cameraSets: CameraSetForPairing[] = sets.map((s) => {
    const clock = s.videoUploadedAt ?? s.completedAt;
    const dateOnly = new Date(`${s.date}T${String(NOON_HOUR).padStart(HOUR_DIGITS, "0")}:00:00Z`);
    const reps = Array.isArray(s.repBreakdown) ? (s.repBreakdown as RepRow[]) : [];
    return {
      setId: s.setId,
      athleteId: s.athleteId,
      exerciseName: s.exerciseName,
      performedAt: clock ?? dateOnly,
      timeBasis: clock ? "clock" : "date_only",
      meanVelocityMps: s.meanVelocityMps,
      peakVelocityMps: s.peakVelocityMps,
      romCm: s.romCm,
      reps: reps.map((r) => ({
        meanVelocityMps: numOrNull(r.meanVelocityMps),
        peakVelocityMps: numOrNull(r.peakVelocityMps),
        romCm: numOrNull(r.romCm),
      })),
    };
  });
  const deviceSets: DeviceReadingForPairing[] = readings.map((r) => {
    const n = readingNumbers(r.vendor, r.raw);
    return {
      readingId: r.id,
      athleteId: r.athleteId,
      deviceName: readingDeviceName(r.vendor, r.raw),
      exerciseName: r.exerciseName,
      recordedAt: r.recordedAt,
      meanVelocityMps: n.meanVelocityMps,
      peakVelocityMps: n.peakVelocityMps,
      romCm: null,
      reps: n.repNumbers,
    };
  });
  const pairs = pairCameraSetsWithDeviceReadings(cameraSets, deviceSets, {
    windowMinutes: opts.windowMinutes,
    deviceRepOffset: opts.deviceRepOffset,
  });
  // An admin analytics surface carries no id that resolves to a person (CLAUDE.md, "Athlete data
  // leaving the platform"): athletes are "Athlete 1", "Athlete 2" within this one response.
  const labels = new Map(Array.from(new Set(pairs.map((p) => p.athleteId))).map((id, i) => [id, `Athlete ${i + 1}`]));
  const setMeta = new Map(sets.map((s) => [s.setId, { setNumber: s.setNumber, side: s.side, date: s.date }]));
  return {
    windowMinutes: opts.windowMinutes,
    deviceRepOffset: opts.deviceRepOffset,
    cameraSetsConsidered: cameraSets.length,
    deviceReadingsConsidered: deviceSets.length,
    pairs: pairs.map(({ athleteId, ...p }) => ({ athlete: labels.get(athleteId), ...setMeta.get(p.setId), ...p })),
    note: "Records only. No camera number, constant or FITTED_OVERRIDES entry reads this.",
  };
}

// ---------------------------------------------------------------------------------------------
// Routes

const connectSchema = z.object({
  vendor: z.enum(CONNECTABLE_VENDORS),
  credentials: z.record(z.string(), z.string().trim().max(CREDENTIAL_MAX)),
});

const linkSchema = z.object({ athleteId: z.number().int().positive().nullable() });

const idParam = (req: Request) => {
  const n = Number(req.params.id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** A connection, only if it belongs to the program whose primary coach is `primaryId`. */
async function connectionInProgram(primaryId: number, connectionId: number) {
  const [conn] = await db
    .select()
    .from(deviceConnections)
    .where(and(eq(deviceConnections.id, connectionId), eq(deviceConnections.coachId, primaryId)));
  return conn ?? null;
}

const NOT_PRIMARY = "Only the head coach connects or disconnects a device for the program.";

export function registerDeviceIntegrationRoutes(app: Express): void {
  app.get("/api/coach/devices", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const primaryId = await primaryOf(user.id);
    const connections = await db.select().from(deviceConnections).where(eq(deviceConnections.coachId, primaryId));
    const roster = await scopedRoster(user.id);
    const inScope = new Set(roster.map((r) => r.id));
    const names = new Map(roster.map((r) => [r.id, r.name]));
    const links = connections.length
      ? await db.select().from(deviceAthleteLinks).where(inArray(deviceAthleteLinks.connectionId, connections.map((c) => c.id)))
      : [];
    const linked = links.filter((l) => l.athleteId && inScope.has(l.athleteId));
    const refusals = await consentRefusals(linked.map((l) => l.athleteId as number));
    const vendorOf = new Map(connections.map((c) => [c.id, c.vendor]));
    res.json({
      canManage: await isPrimaryCoach(user.id),
      vendors: Object.values(VENDORS),
      connections: connections.map(connectionView),
      unmatched: links
        .filter((l) => !l.athleteId)
        .map((l) => ({ linkId: l.id, connectionId: l.connectionId, vendor: vendorOf.get(l.connectionId), vendorAthleteName: l.vendorAthleteName })),
      linked: linked.map((l) => {
        const refusal = refusals.get(l.athleteId as number) ?? null;
        return {
          linkId: l.id,
          connectionId: l.connectionId,
          vendor: vendorOf.get(l.connectionId),
          vendorAthleteName: l.vendorAthleteName,
          athleteId: l.athleteId,
          athleteName: names.get(l.athleteId as number) ?? null,
          matchedBy: l.matchedBy,
          consentSentence: refusal ? CONSENT_REFUSAL_SENTENCE[refusal] : null,
        };
      }),
      roster: roster.map((r) => ({ id: r.id, name: r.name })),
    });
  });

  app.post("/api/coach/devices/connections", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    if (!(await isPrimaryCoach(user.id))) return res.status(HTTP.forbidden).json({ message: NOT_PRIMARY });
    const parsed = connectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message ?? "Invalid device." });
    const vendor: ConnectableVendor = parsed.data.vendor;
    const credentials = Object.fromEntries(
      VENDORS[vendor].fields.map((f) => [f.key, parsed.data.credentials[f.key] ?? ""] as const),
    );
    const adapter = adapterFor(vendor, deviceFetch);
    const validation = await adapter.validate(credentials);
    if (!validation.ok && validation.status === "error") return res.status(HTTP.badRequest).json({ message: validation.message });
    const status = validation.ok ? "active" : "awaiting_partner_access";
    const sealed = sealCredentials(credentials);
    const [conn] = await db
      .insert(deviceConnections)
      .values({ coachId: user.id, vendor, credentials: sealed, status, createdByUserId: user.id })
      .onConflictDoUpdate({
        target: [deviceConnections.coachId, deviceConnections.vendor],
        set: { credentials: sealed, status, lastError: null, syncCursor: null, updatedAt: new Date() },
      })
      .returning();
    const sync = await syncConnection(conn.id);
    res.status(HTTP.created).json({ connection: connectionView({ ...conn, status: sync.status }), sync });
  });

  app.delete("/api/coach/devices/connections/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    if (!(await isPrimaryCoach(user.id))) return res.status(HTTP.forbidden).json({ message: NOT_PRIMARY });
    const id = idParam(req);
    const programId = (await storage.getEffectiveCoachIds(user.id))[0];
    const conn = id ? await connectionInProgram(programId, id) : null;
    if (!conn) return res.status(HTTP.notFound).json({ message: "Connection not found" });
    // Readings already stored stay (connection_id goes null); disconnecting stops new ones.
    await db.delete(deviceConnections).where(eq(deviceConnections.id, conn.id));
    res.status(HTTP.noContent).end();
  });

  app.post("/api/coach/devices/connections/:id/sync", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = idParam(req);
    const programId = (await storage.getEffectiveCoachIds(user.id))[0];
    const conn = id ? await connectionInProgram(programId, id) : null;
    if (!conn) return res.status(HTTP.notFound).json({ message: "Connection not found" });
    res.json(await syncConnection(conn.id));
  });

  app.put("/api/coach/devices/links/:id", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const id = idParam(req);
    const parsed = linkSchema.safeParse(req.body);
    if (!id || !parsed.success) return res.status(HTTP.badRequest).json({ message: "Pick an athlete." });
    const primaryId = (await storage.getEffectiveCoachIds(user.id))[0];
    const [link] = await db
      .select({ link: deviceAthleteLinks, connCoach: deviceConnections.coachId })
      .from(deviceAthleteLinks)
      .innerJoin(deviceConnections, eq(deviceAthleteLinks.connectionId, deviceConnections.id))
      .where(eq(deviceAthleteLinks.id, id));
    if (!link || link.connCoach !== primaryId) return res.status(HTTP.notFound).json({ message: "Not found" });
    if (link.link.athleteId && !(await storage.athleteIsInCoachScope(user.id, link.link.athleteId))) {
      return res.status(HTTP.notFound).json({ message: "Not found" });
    }
    const athleteId = parsed.data.athleteId;
    if (athleteId !== null) {
      const inScope = (await scopedRoster(user.id)).some((r) => r.id === athleteId);
      if (!inScope) return res.status(HTTP.notFound).json({ message: "Athlete not found" });
    }
    await db
      .update(deviceAthleteLinks)
      .set({ athleteId, matchedBy: athleteId === null ? null : "coach", updatedAt: new Date() })
      .where(eq(deviceAthleteLinks.id, id));
    // The readings for a newly linked athlete were skipped when they arrived; the next sync reads
    // the lookback window again. Already-stored readings are not written twice (the unique index).
    await db.update(deviceConnections).set({ syncCursor: null, updatedAt: new Date() }).where(eq(deviceConnections.id, link.link.connectionId));
    res.json({ ok: true });
  });

  app.post("/api/coach/devices/csv/preview", requireRole("coach"), async (req, res) => {
    const parsed = csvBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: "Upload a CSV file (5 MB at most)." });
    const { headers, mapping, plan, truncated } = await planCsv(currentUser(req).id, parsed.data);
    res.json({
      headers,
      mapping,
      truncated,
      totals: {
        rows: plan.length,
        ready: plan.filter((r) => r.athleteId && !r.problem && !r.consentRefusal).length,
        unmatched: plan.filter((r) => !r.athleteId).length,
        problems: plan.filter((r) => r.problem).length,
        consent: plan.filter((r) => r.consentRefusal).length,
      },
      rows: plan.slice(0, PREVIEW_ROWS).map(({ raw, ...row }) => ({ ...row, numbers: readingNumbers("csv", raw) })),
      unmatchedRows: plan.filter((r) => !r.athleteId).map((r) => ({ rowNumber: r.rowNumber, athleteName: r.athleteName, athleteEmail: r.athleteEmail })),
    });
  });

  app.post("/api/coach/devices/csv/import", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = csvBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: "Upload a CSV file (5 MB at most)." });
    if (!parsed.data.mapping?.date) return res.status(HTTP.badRequest).json({ message: "Map the date column before importing." });
    const primaryId = await primaryOf(user.id);
    const { plan } = await planCsv(user.id, parsed.data);
    const ready = plan.filter((r) => r.athleteId && !r.problem && !r.consentRefusal && r.recordedAt);
    const written = await Promise.all(
      ready.map((r) =>
        storeReading({
          athleteId: r.athleteId as number,
          primaryId,
          connectionId: null,
          vendor: "csv",
          vendorReadingId: csvRowKey(r.athleteId as number, r),
          recordedAt: new Date(r.recordedAt as string),
          metricKind: "csv_row",
          exerciseName: r.exerciseName,
          raw: r.raw,
        }),
      ),
    );
    res.json({
      imported: written.filter(Boolean).length,
      alreadyHad: written.filter((w) => !w).length,
      notImported: plan
        .filter((r) => !ready.includes(r))
        .map((r) => ({
          rowNumber: r.rowNumber,
          athleteName: r.athleteName,
          why: r.consentSentence ?? r.problem ?? "No Forge athlete matched this row. Pick one and import again.",
        })),
    });
  });

  app.get("/api/coach/roster/:athleteId/device-readings", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = Number(req.params.athleteId);
    if (!Number.isInteger(athleteId) || !(await storage.athleteIsInCoachScope(user.id, athleteId))) {
      return res.status(HTTP.notFound).json({ message: "Athlete not found" });
    }
    const refusal = await consentRefusalFor(athleteId);
    res.json({
      readings: await readingsForAthlete(await primaryOf(user.id), athleteId),
      consentSentence: refusal ? CONSENT_REFUSAL_SENTENCE[refusal] : null,
    });
  });

  app.get("/api/admin/device-connections", requireRole("admin"), async (_req, res) => {
    const rows = await db
      .select({
        id: deviceConnections.id,
        vendor: deviceConnections.vendor,
        status: deviceConnections.status,
        lastSyncedAt: deviceConnections.lastSyncedAt,
        lastError: deviceConnections.lastError,
        createdAt: deviceConnections.createdAt,
      })
      .from(deviceConnections)
      .orderBy(desc(deviceConnections.updatedAt));
    const readingCounts = await db
      .select({ connectionId: deviceReadings.connectionId, n: sql<number>`count(*)::int` })
      .from(deviceReadings)
      .where(isNotNull(deviceReadings.connectionId))
      .groupBy(deviceReadings.connectionId);
    const unmatchedCounts = await db
      .select({ connectionId: deviceAthleteLinks.connectionId, n: sql<number>`count(*)::int` })
      .from(deviceAthleteLinks)
      .where(isNull(deviceAthleteLinks.athleteId))
      .groupBy(deviceAthleteLinks.connectionId);
    const readingsBy = new Map(readingCounts.map((r) => [r.connectionId, r.n]));
    const unmatchedBy = new Map(unmatchedCounts.map((r) => [r.connectionId, r.n]));
    res.json({
      connections: rows.map((r) => ({
        ...r,
        name: isConnectableVendor(r.vendor) ? VENDORS[r.vendor].name : r.vendor,
        readings: readingsBy.get(r.id) ?? 0,
        unmatched: unmatchedBy.get(r.id) ?? 0,
      })),
    });
  });

  app.get("/api/admin/device-calibration/pairs", requireRole("admin"), async (req, res) => {
    const clamp = (v: unknown, fallback: number, max: number, min = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    res.json(
      await calibrationPairs({
        days: clamp(req.query.days, DEFAULT_CALIBRATION_DAYS, MAX_CALIBRATION_DAYS, 1),
        windowMinutes: clamp(req.query.windowMinutes, DEFAULT_PAIRING_WINDOW_MINUTES, MAX_WINDOW_MINUTES, 1),
        deviceRepOffset: Math.round(clamp(req.query.deviceRepOffset, 0, MAX_REP_OFFSET)),
      }),
    );
  });
}
