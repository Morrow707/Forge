/** VENDOR ADAPTERS for device integrations (2026-11-21). One shape per vendor -- validate the
 * credentials, list the vendor's athletes, fetch readings since a cursor -- so the sync job
 * (server/device-integrations.ts) never branches on a vendor's name.
 *
 * Every network call goes through the `fetch` handed in, so a test drives the real adapter with a
 * fake vendor and no network.
 *
 * WHAT EACH ONE DOES TODAY:
 *   - Hawkin Dynamics: real. Built against connect.hawkindynamics.com/api: the Integration Key is
 *     a refresh token exchanged at GET /api/token (Bearer) for a one-hour access token; athletes
 *     at GET /api/v1/athletes; tests at GET /api/v1 with syncFrom/syncTo (Unix seconds), whose
 *     response carries `data` and `lastSyncTime`. The cursor is that lastSyncTime.
 *   - GymAware: real. Built against the GymAware Cloud API integration guide: HTTP Basic with the
 *     Account ID as user and the API token as password; GET /api/athletes and GET /api/reps, both
 *     a newline-separated stream of JSON objects; /api/reps takes a start/end window of "recorded"
 *     time in epoch seconds (a month at most per request). The cursor is the last window's end.
 *   - VALD, Perch, Catapult: complete in shape and report "awaiting partner access". They make
 *     no network call and never pretend to sync. */
import {
  AWAITING_PARTNER_ACCESS,
  type ConnectableVendor,
  type MetricKind,
  type VendorAthlete,
} from "@shared/device-integrations";

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export type VendorReading = {
  vendorReadingId: string;
  vendorAthleteId: string;
  /** The athlete's name as the reading carries it, so an athlete missing from the vendor's list
   *  still reaches the coach's unmatched list. */
  vendorAthleteName: string | null;
  recordedAt: Date;
  metricKind: MetricKind;
  exerciseName: string | null;
  raw: Record<string, unknown>;
};

export type FetchResult = { readings: VendorReading[]; nextCursor: string | null };

export type ValidateResult = { ok: true } | { ok: false; status: "error" | "awaiting_partner_access"; message: string };

export interface DeviceAdapter {
  vendor: ConnectableVendor;
  /** Whether the adapter can pull today. False means "awaiting partner access". */
  live: boolean;
  validate(credentials: Record<string, string>): Promise<ValidateResult>;
  listAthletes(credentials: Record<string, string>): Promise<VendorAthlete[]>;
  /** Readings recorded since `cursor` (or since `lookbackStart` when there is no cursor). */
  fetchReadingsSince(credentials: Record<string, string>, cursor: string | null, lookbackStart: Date): Promise<FetchResult>;
}

/** A vendor refused or failed. Its message is shown to the coach on the connection's card. */
export class DeviceVendorError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
    this.name = "DeviceVendorError";
  }
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const MS_PER_SECOND = 1000;
const NEWLINE = "\n";

function vendorFailure(vendorName: string, status: number): DeviceVendorError {
  const refused = status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN;
  return new DeviceVendorError(
    refused
      ? `${vendorName} refused the key (HTTP ${status}). Check it was copied in full and has not been revoked.`
      : `${vendorName} answered HTTP ${status}. Forge will try again on the next sync.`,
    status,
  );
}

async function getText(fetchFn: FetchLike, vendorName: string, url: string, headers: Record<string, string>): Promise<string> {
  const res = await fetchFn(url, { method: "GET", headers });
  if (!res.ok) throw vendorFailure(vendorName, res.status);
  return res.text();
}

async function getJson(fetchFn: FetchLike, vendorName: string, url: string, headers: Record<string, string>): Promise<unknown> {
  const text = await getText(fetchFn, vendorName, url, headers);
  try {
    return JSON.parse(text);
  } catch {
    throw new DeviceVendorError(`${vendorName} sent something that was not JSON.`, null);
  }
}

function str(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// ---------------------------------------------------------------------------------------------
// Hawkin Dynamics

export const HAWKIN_HOSTS: Record<string, string> = {
  americas: "https://cloud.hawkindynamics.com",
  europe: "https://eu.cloud.hawkindynamics.com",
  apac: "https://apac.cloud.hawkindynamics.com",
};

function hawkinHost(credentials: Record<string, string>): string {
  const region = (credentials.region ?? "").trim().toLowerCase();
  return HAWKIN_HOSTS[region] ?? HAWKIN_HOSTS.americas;
}

const HAWKIN = "Hawkin Dynamics";

async function hawkinAccessToken(fetchFn: FetchLike, credentials: Record<string, string>): Promise<string> {
  const key = (credentials.integrationKey ?? "").trim();
  if (!key) throw new DeviceVendorError("Paste the Hawkin Integration Key.", null);
  const body = asRecord(await getJson(fetchFn, HAWKIN, `${hawkinHost(credentials)}/api/token`, { Authorization: `Bearer ${key}` }));
  const token = str(body.access_token);
  if (!token) throw new DeviceVendorError("Hawkin did not return an access token for that key.", null);
  return token;
}

/** A Hawkin test's metric kind, from its test type's name. */
export function hawkinMetricKind(testTypeName: string | null): MetricKind {
  return (testTypeName ?? "").toLowerCase().includes("countermovement") ? "countermovement_jump" : "force_plate_test";
}

/** The athlete's email, where the Hawkin profile carries one under `external` (an integration's
 *  own fields) or at the top level. */
function hawkinEmail(athlete: Record<string, unknown>): string | null {
  const external = asRecord(athlete.external);
  return str(athlete.email) ?? str(external.email) ?? str(external.Email) ?? null;
}

const HAWKIN_PAGE_LIMIT = 50;

export function hawkinAdapter(fetchFn: FetchLike): DeviceAdapter {
  return {
    vendor: "hawkin",
    live: true,
    async validate(credentials) {
      try {
        await hawkinAccessToken(fetchFn, credentials);
        return { ok: true };
      } catch (err) {
        return { ok: false, status: "error", message: err instanceof Error ? err.message : String(err) };
      }
    },
    async listAthletes(credentials) {
      const token = await hawkinAccessToken(fetchFn, credentials);
      const body = asRecord(
        await getJson(fetchFn, HAWKIN, `${hawkinHost(credentials)}/api/v1/athletes?includeInactive=true`, {
          Authorization: `Bearer ${token}`,
        }),
      );
      const data = Array.isArray(body.data) ? body.data : [];
      return data
        .map(asRecord)
        .map((a) => ({ vendorAthleteId: str(a.id) ?? "", name: str(a.name), email: hawkinEmail(a) }))
        .filter((a) => a.vendorAthleteId !== "");
    },
    async fetchReadingsSince(credentials, cursor, lookbackStart) {
      const token = await hawkinAccessToken(fetchFn, credentials);
      const syncFrom = cursor ?? String(Math.floor(lookbackStart.getTime() / MS_PER_SECOND));
      const host = hawkinHost(credentials);
      const pages = await hawkinPages(fetchFn, `${host}/api/v1?syncFrom=${encodeURIComponent(syncFrom)}&paginate=true`, token);
      const readings = pages.flatMap((page) =>
        page.data.map(asRecord).flatMap((test): VendorReading[] => {
          const id = str(test.id);
          const athlete = asRecord(test.athlete);
          const athleteId = str(athlete.id) ?? str(test.athleteId);
          const seconds = typeof test.timestamp === "number" ? test.timestamp : Number(str(test.timestamp));
          if (!id || !athleteId || !Number.isFinite(seconds)) return [];
          const testType = asRecord(test.testType);
          const testTypeName = str(testType.name);
          return [
            {
              vendorReadingId: id,
              vendorAthleteId: athleteId,
              vendorAthleteName: str(athlete.name),
              recordedAt: new Date(seconds * MS_PER_SECOND),
              metricKind: hawkinMetricKind(testTypeName),
              exerciseName: testTypeName,
              raw: test,
            },
          ];
        }),
      );
      const lastSync = pages.map((p) => p.lastSyncTime).filter((t): t is string => t !== null).pop() ?? null;
      return { readings, nextCursor: lastSync ?? cursor };
    },
  };
}

type HawkinPage = { data: unknown[]; lastSyncTime: string | null; nextCursor: string | null };

async function hawkinPages(fetchFn: FetchLike, firstUrl: string, token: string, depth = 0): Promise<HawkinPage[]> {
  const body = asRecord(await getJson(fetchFn, HAWKIN, firstUrl, { Authorization: `Bearer ${token}` }));
  const page: HawkinPage = {
    data: Array.isArray(body.data) ? body.data : [],
    lastSyncTime: str(body.lastSyncTime),
    nextCursor: body.hasMore === true ? str(body.nextCursor) : null,
  };
  if (!page.nextCursor || depth + 1 >= HAWKIN_PAGE_LIMIT) return [page];
  const base = firstUrl.split("&cursor=")[0];
  return [page, ...(await hawkinPages(fetchFn, `${base}&cursor=${encodeURIComponent(page.nextCursor)}`, token, depth + 1))];
}

// ---------------------------------------------------------------------------------------------
// GymAware

export const GYMAWARE_HOST = "https://cloud.gymaware.com";
const GYMAWARE = "GymAware";
/** /api/reps takes at most a month per request. */
const SECONDS_PER_DAY = 86_400;
const GYMAWARE_WINDOW_DAYS = 30;
const GYMAWARE_WINDOW_SECONDS = GYMAWARE_WINDOW_DAYS * SECONDS_PER_DAY;

function basicAuth(credentials: Record<string, string>): Record<string, string> {
  const accountId = (credentials.accountId ?? "").trim();
  const token = (credentials.token ?? "").trim();
  if (!accountId || !token) throw new DeviceVendorError("Enter both the GymAware Account ID and the API Token.", null);
  return { Authorization: `Basic ${Buffer.from(`${accountId}:${token}`).toString("base64")}` };
}

/** GymAware's GET endpoints answer a newline-separated stream of JSON objects. A line that is
 *  not JSON is skipped rather than failing the whole stream. */
export function parseJsonLines(text: string): Record<string, unknown>[] {
  return text
    .split(NEWLINE)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const v: unknown = JSON.parse(line);
        return Array.isArray(v) ? v.map(asRecord) : [asRecord(v)];
      } catch {
        return [];
      }
    });
}

function windows(fromSeconds: number, toSeconds: number): [number, number][] {
  if (fromSeconds >= toSeconds) return [];
  const end = Math.min(toSeconds, fromSeconds + GYMAWARE_WINDOW_SECONDS);
  return [[fromSeconds, end], ...windows(end, toSeconds)];
}

export function gymawareAdapter(fetchFn: FetchLike, now: () => Date = () => new Date()): DeviceAdapter {
  return {
    vendor: "gymaware",
    live: true,
    async validate(credentials) {
      try {
        await getText(fetchFn, GYMAWARE, `${GYMAWARE_HOST}/api/athletes`, basicAuth(credentials));
        return { ok: true };
      } catch (err) {
        return { ok: false, status: "error", message: err instanceof Error ? err.message : String(err) };
      }
    },
    async listAthletes(credentials) {
      const rows = parseJsonLines(await getText(fetchFn, GYMAWARE, `${GYMAWARE_HOST}/api/athletes`, basicAuth(credentials)));
      return rows
        .map((a) => {
          const joined = [str(a.firstName), str(a.lastName)].filter(Boolean).join(" ");
          return { vendorAthleteId: str(a.athleteReference) ?? "", name: joined || str(a.displayName), email: str(a.email) };
        })
        .filter((a) => a.vendorAthleteId !== "");
    },
    async fetchReadingsSince(credentials, cursor, lookbackStart) {
      const headers = basicAuth(credentials);
      const from = cursor ? Number(cursor) : Math.floor(lookbackStart.getTime() / MS_PER_SECOND);
      const to = Math.floor(now().getTime() / MS_PER_SECOND);
      const spans = windows(Number.isFinite(from) ? from : to, to);
      const texts = await Promise.all(
        spans.map(([s, e]) => getText(fetchFn, GYMAWARE, `${GYMAWARE_HOST}/api/reps?start=${s}&end=${e}`, headers)),
      );
      const readings = texts
        .flatMap(parseJsonLines)
        .filter((set) => set.deleted !== true)
        .flatMap((set): VendorReading[] => {
          const id = str(set.reference);
          const athleteId = str(set.athleteReference);
          const recorded = typeof set.recorded === "number" ? set.recorded : Number(str(set.recorded));
          if (!id || !athleteId || !Number.isFinite(recorded)) return [];
          return [
            {
              vendorReadingId: id,
              vendorAthleteId: athleteId,
              vendorAthleteName: str(set.athleteName),
              recordedAt: new Date(recorded * MS_PER_SECOND),
              metricKind: "bar_velocity_set",
              exerciseName: str(set.exerciseName) ?? str(set.activityName),
              raw: set,
            },
          ];
        });
      return { readings, nextCursor: String(to) };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Vendors Forge has applied to. Complete in shape; no network call; never a pretend sync.

function awaitingPartnerAccess(vendor: ConnectableVendor): DeviceAdapter {
  return {
    vendor,
    live: false,
    async validate() {
      return { ok: false, status: "awaiting_partner_access", message: AWAITING_PARTNER_ACCESS };
    },
    async listAthletes() {
      return [];
    },
    async fetchReadingsSince() {
      return { readings: [], nextCursor: null };
    },
  };
}

export function adapterFor(vendor: ConnectableVendor, fetchFn: FetchLike): DeviceAdapter {
  const adapters: Record<ConnectableVendor, () => DeviceAdapter> = {
    hawkin: () => hawkinAdapter(fetchFn),
    gymaware: () => gymawareAdapter(fetchFn),
    vald: () => awaitingPartnerAccess("vald"),
    perch: () => awaitingPartnerAccess("perch"),
    catapult: () => awaitingPartnerAccess("catapult"),
  };
  return adapters[vendor]();
}
