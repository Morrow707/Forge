import type { Express, NextFunction, Request, Response } from "express";
import { createHmac } from "crypto";
import fs from "fs";
import path from "path";
import { computePageCatalog } from "./page-catalog";
import { z } from "zod";
import { and, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { requireRole } from "./auth";
import { storage } from "./storage";
import { DEMO_ACCOUNT_EMAILS } from "./demo-accounts";
import { featureFirstSeen, featureUsageDaily, featureUsagePaths, featureUsageSeen, type User } from "@shared/schema";
import {
  UI_INTERACTIONS,
  USAGE_DEFAULT_GROUPS,
  USAGE_GROUPS,
  USAGE_RETENTION_DAYS,
  featureUsageReport,
  isUiInteraction,
  isWriteAction,
  matchPagePattern,
  type CatalogPage,
  type PathRow,
  type UsageGroup,
  type UsageKind,
  type UsagePlatform,
} from "@shared/feature-usage";

/* WHAT PEOPLE USE, RECORDED (2026-11-12). See shared/feature-usage.ts for the questions and the
 * "why" rules.
 *
 * Counting is in memory and written once a minute, so no request waits on it and none can fail
 * because of it. Per day it writes: the page pattern, action template or interaction name; the kind
 * of account; the platform; how many uses, refused and failed; how many person-days (counted with
 * a keyed hash that changes every day, in feature_usage_seen, deleted once the day is over); which
 * page people came from, and which page an action was saved from. No account id, no path with an
 * id in it, no request body, nothing typed. A path the client reports is matched to its pattern
 * here and dropped.
 *
 * Left out on purpose: the three demo accounts (screenshots are not use), and the two usage pings
 * themselves. Admins ARE counted, as their own group, and the report leaves them out by default. */

const MINUTE_MS = 60_000;
const FLUSH_MS = MINUTE_MS;
const GROUP_CACHE_MINUTES = 10;
const GROUP_CACHE_MS = GROUP_CACHE_MINUTES * MINUTE_MS;
const KEY_CHARS = 16;
const DAY_MS = 86_400_000;
const ISO_DATE_LENGTH = 10;
const WEEK = 7;
const FOUR_WEEKS = 28;
const QUARTER = 90;
const PERIODS = [WEEK, FOUR_WEEKS, QUARTER] as const;
const PERIODS_BACK_FOR_COMPARISON = 2;
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_CLIENT_ERROR = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVER_ERROR = 500;
const PAGE_PING = "/api/usage/page";
const INTERACTION_PING = "/api/usage/interaction";
const PINGS = new Set([PAGE_PING, INTERACTION_PING]);
const PATH_MAX = 300;
const NAME_MAX = 120;
const DEMO_EMAILS = new Set<string>(DEMO_ACCOUNT_EMAILS);
/** Not a feature: one row per person-day signed in, per kind of account, so the report can say
 * whether anybody a page is for was even here. */
const VISIT_KIND = "visit";
const VISIT_FEATURE = "signed in";
const PLATFORM_BY_HEADER: Record<string, UsagePlatform> = { ios: "iPhone app", android: "Android app" };

type CountKind = UsageKind | typeof VISIT_KIND;
type Bucket = { uses: number; refused: number; failed: number; people: Set<string> };
let buffer = new Map<string, Bucket>();
let pathBuffer = new Map<string, number>();
let appRef: Express | null = null;
let catalogRecorded = false;
const groupCache = new Map<number, { group: UsageGroup; until: number }>();

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, ISO_DATE_LENGTH);

/** A keyed hash of the account id that changes every day: counts a person once a day, joins to
 * nothing on any other day, and maps back to nobody. */
function personKey(userId: number, day: string): string {
  return createHmac("sha256", `${process.env.SESSION_SECRET ?? "forge"}:feature-usage:${day}`).update(String(userId)).digest("hex").slice(0, KEY_CHARS);
}

function platformOf(req: Request): UsagePlatform {
  const header = req.headers["x-forge-platform"];
  return PLATFORM_BY_HEADER[typeof header === "string" ? header.toLowerCase() : ""] ?? "Website";
}

async function groupOf(user: User | undefined, now: number): Promise<UsageGroup> {
  if (!user) return "Signed out";
  if (user.role === "coach") return "Coaches";
  if (user.role === "admin") return "Admins";
  if (user.role === "guardian") return "Guardians";
  const cached = groupCache.get(user.id);
  if (cached && cached.until > now) return cached.group;
  const group: UsageGroup = (await storage.getCoachesForAthlete(user.id)).length ? "Coached athletes" : "Free Agents";
  groupCache.set(user.id, { group, until: now + GROUP_CACHE_MS });
  return group;
}

const isDemo = (user: User | undefined) => Boolean(user && DEMO_EMAILS.has(user.email));

/** Adds one use to the in-memory day. Never throws: counting must not break anything. */
export async function countUse(kind: CountKind, feature: string, user: User | undefined, status: number, platform: UsagePlatform, now = Date.now()): Promise<void> {
  try {
    if (isDemo(user)) return;
    const day = isoDay(now);
    const group = await groupOf(user, now);
    const key = JSON.stringify([day, kind, feature, group, platform]);
    const b = buffer.get(key) ?? { uses: 0, refused: 0, failed: 0, people: new Set<string>() };
    b.uses += 1;
    if (status >= HTTP_SERVER_ERROR) b.failed += 1;
    else if (status >= HTTP_CLIENT_ERROR && status !== HTTP_UNAUTHORIZED) b.refused += 1;
    if (user) b.people.add(personKey(user.id, day));
    buffer.set(key, b);
  } catch (err) {
    console.warn("[feature-usage] could not count a use:", err instanceof Error ? err.message : err);
  }
}

function countPath(kind: PathRow["kind"], page: string, other: string, user: User | undefined, now = Date.now()): void {
  if (isDemo(user)) return;
  const key = JSON.stringify([isoDay(now), kind, page, other]);
  pathBuffer.set(key, (pathBuffer.get(key) ?? 0) + 1);
}

/** Every action the server answers, read off the router itself, so a route added next year is in
 * the report (at zero) the day it exists. */
function actionCatalog(app: Express | null): string[] {
  type Layer = { route?: { path: string | string[]; methods: Record<string, boolean> } };
  const stack: Layer[] = (app as unknown as { _router?: { stack: Layer[] } } | null)?._router?.stack ?? [];
  const actions = stack.flatMap((layer) => {
    if (!layer.route) return [];
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    const methods = Object.keys(layer.route.methods).filter((m) => m !== "_all");
    return paths.filter((p) => typeof p === "string" && p.startsWith("/api/") && !PINGS.has(p)).flatMap((p) => methods.map((m) => `${m.toUpperCase()} ${p}`));
  });
  return Array.from(new Set(actions)).sort();
}

let pageCatalogCache: CatalogPage[] | null = null;
function pageCatalog(): CatalogPage[] {
  if (pageCatalogCache) return pageCatalogCache;
  const built = path.resolve(import.meta.dirname, "page-catalog.json");
  try {
    pageCatalogCache = fs.existsSync(built) ? (JSON.parse(fs.readFileSync(built, "utf8")) as CatalogPage[]) : computePageCatalog(process.cwd());
  } catch (err) {
    console.warn("[feature-usage] could not build the page list:", err instanceof Error ? err.message : err);
    pageCatalogCache = [];
  }
  return pageCatalogCache;
}
const pagePatterns = () => pageCatalog().map((p) => p.path);

/** Writes the buffered minute. Exported so a test can wait on it. */
export async function flushFeatureUsage(now = Date.now()): Promise<void> {
  const pending = buffer;
  const pendingPaths = pathBuffer;
  buffer = new Map();
  pathBuffer = new Map();
  try {
    await db.transaction(async (tx) => {
      // The day each feature first existed, recorded once per running server.
      if (!catalogRecorded) {
        const today = isoDay(now);
        const catalog = [
          ...pageCatalog().map((p) => ({ kind: "page", feature: p.path })),
          ...actionCatalog(appRef).map((a) => ({ kind: "action", feature: a })),
          ...UI_INTERACTIONS.map((i) => ({ kind: "interaction", feature: i })),
        ];
        if (catalog.length) await tx.insert(featureFirstSeen).values(catalog.map((c) => ({ ...c, firstSeen: today }))).onConflictDoNothing();
        catalogRecorded = true;
      }
      await Array.from(pending.entries()).reduce(async (prev, [key, b]) => {
        await prev;
        const [day, kind, feature, userGroup, platform] = JSON.parse(key) as [string, string, string, string, string];
        const people = Array.from(b.people);
        const fresh = people.length
          ? await tx
              .insert(featureUsageSeen)
              .values(people.map((personKey) => ({ day, kind, feature, userGroup, personKey })))
              .onConflictDoNothing()
              .returning({ personKey: featureUsageSeen.personKey })
          : [];
        await tx
          .insert(featureUsageDaily)
          .values({ day, kind, feature, userGroup, platform, uses: b.uses, refused: b.refused, failed: b.failed, people: fresh.length })
          .onConflictDoUpdate({
            target: [featureUsageDaily.day, featureUsageDaily.kind, featureUsageDaily.feature, featureUsageDaily.userGroup, featureUsageDaily.platform],
            set: {
              uses: sql`${featureUsageDaily.uses} + ${b.uses}`,
              refused: sql`${featureUsageDaily.refused} + ${b.refused}`,
              failed: sql`${featureUsageDaily.failed} + ${b.failed}`,
              people: sql`${featureUsageDaily.people} + ${fresh.length}`,
            },
          });
      }, Promise.resolve());
      await Array.from(pendingPaths.entries()).reduce(async (prev, [key, uses]) => {
        await prev;
        const [day, kind, page, other] = JSON.parse(key) as [string, string, string, string];
        await tx
          .insert(featureUsagePaths)
          .values({ day, kind, page, other, uses })
          .onConflictDoUpdate({ target: [featureUsagePaths.day, featureUsagePaths.kind, featureUsagePaths.page, featureUsagePaths.other], set: { uses: sql`${featureUsagePaths.uses} + ${uses}` } });
      }, Promise.resolve());
      // A day's person keys are only needed while that day can still be counted; counts are kept
      // for 13 months and then deleted.
      const oldest = isoDay(now - USAGE_RETENTION_DAYS * DAY_MS);
      await tx.delete(featureUsageSeen).where(lt(featureUsageSeen.day, isoDay(now - DAY_MS)));
      await tx.delete(featureUsageDaily).where(lt(featureUsageDaily.day, oldest));
      await tx.delete(featureUsagePaths).where(lt(featureUsagePaths.day, oldest));
    });
  } catch (err) {
    // A lost minute of counts is the whole cost; nothing else depends on this.
    console.warn("[feature-usage] could not write the counts:", err instanceof Error ? err.message : err);
  }
}

/** Counts every API request by its route template once the response has gone, the signed-in
 * person-day, and -- for a write -- which page it was saved from (the X-Forge-Page header). */
export function recordFeatureUsage(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith("/api/") && !PINGS.has(req.path)) {
    res.on("finish", () => {
      const template = req.route?.path;
      if (typeof template !== "string") return; // nothing answered it: a 404, not a feature
      const user = req.user as User | undefined;
      const platform = platformOf(req);
      const action = `${req.method} ${req.baseUrl}${template}`;
      void countUse("action", action, user, res.statusCode, platform);
      if (user) void countUse(VISIT_KIND, VISIT_FEATURE, user, HTTP_OK, platform);
      const onPage = req.headers["x-forge-page"];
      if (isWriteAction(action) && res.statusCode < HTTP_CLIENT_ERROR && typeof onPage === "string") {
        const page = matchPagePattern(onPage.slice(0, PATH_MAX), pagePatterns());
        if (page) countPath("done-on", page, action, user);
      }
    });
  }
  next();
}

const pagePingSchema = z.object({ path: z.string().min(1).max(PATH_MAX), from: z.string().max(PATH_MAX).nullish() });
const interactionPingSchema = z.object({ name: z.string().min(1).max(NAME_MAX) });
const reportQuerySchema = z.object({
  days: z.coerce.number().refine((d) => (PERIODS as readonly number[]).includes(d)).default(PERIODS[1]),
  groups: z.string().optional(),
});

/** Puts the counter in front of every route. It must come before ANY route is registered: Express
 * runs in order, so a route registered first (the sign-in routes in setupAuth, the payment webhooks
 * in index.ts) answers without the counter ever seeing it, and reads as "never done" forever.
 * index.ts calls this first thing and routes.ts again before setupAuth (the test harness builds its
 * app without index.ts); the flag stops a request being counted twice. The pings and the report
 * are registered separately, by registerFeatureUsage, after the session exists. */
export function mountFeatureUsageCounter(app: Express): void {
  if (app.locals.featureUsageCounterMounted) return;
  app.locals.featureUsageCounterMounted = true;
  app.use(recordFeatureUsage);
}

export function registerFeatureUsage(app: Express): void {
  appRef = app;
  mountFeatureUsageCounter(app);
  const timer = setInterval(() => void flushFeatureUsage(), FLUSH_MS);
  timer.unref();

  // The client says which page it is on and which it came from; only pages the app actually
  // routes are counted, and only as their patterns. The paths themselves are dropped here.
  app.post(PAGE_PING, async (req, res) => {
    const parsed = pagePingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP_CLIENT_ERROR).json({ message: "A page path is required." });
    const user = req.user as User | undefined;
    const page = matchPagePattern(parsed.data.path, pagePatterns());
    if (page) {
      await countUse("page", page, user, HTTP_OK, platformOf(req));
      const from = parsed.data.from ? matchPagePattern(parsed.data.from, pagePatterns()) : null;
      if (from && from !== page) countPath("came-from", page, from, user);
    }
    res.status(HTTP_NO_CONTENT).end();
  });

  // A tab, panel or dialog from the fixed list in shared/feature-usage.ts; any other name is refused.
  app.post(INTERACTION_PING, async (req, res) => {
    const parsed = interactionPingSchema.safeParse(req.body);
    if (!parsed.success || !isUiInteraction(parsed.data.name)) return res.status(HTTP_CLIENT_ERROR).json({ message: "Unknown interaction." });
    await countUse("interaction", parsed.data.name, req.user as User | undefined, HTTP_OK, platformOf(req));
    res.status(HTTP_NO_CONTENT).end();
  });

  app.get("/api/admin/feature-usage", requireRole("admin"), async (req, res) => {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(HTTP_CLIENT_ERROR).json({ message: "Pick 7, 28 or 90 days." });
    await flushFeatureUsage();
    const { days } = parsed.data;
    const asked = (parsed.data.groups ?? "").split(",").filter((g): g is UsageGroup => (USAGE_GROUPS as readonly string[]).includes(g));
    const groups = asked.length ? asked : [...USAGE_DEFAULT_GROUPS];
    const now = Date.now();
    const today = isoDay(now);
    const from = isoDay(now - (days - 1) * DAY_MS);
    const priorFrom = isoDay(now - (PERIODS_BACK_FOR_COMPARISON * days - 1) * DAY_MS);
    const d = featureUsageDaily;
    const cols = { kind: d.kind, feature: d.feature, platform: d.platform, uses: d.uses, refused: d.refused, failed: d.failed, people: d.people };
    const inGroups = inArray(d.userGroup, groups);
    const notVisit = ne(d.kind, VISIT_KIND);
    const [current, prior, paths, activity, seen, [first]] = await Promise.all([
      db.select(cols).from(d).where(and(gte(d.day, from), inGroups, notVisit)),
      db.select(cols).from(d).where(and(gte(d.day, priorFrom), lt(d.day, from), inGroups, notVisit)),
      db
        .select({ kind: featureUsagePaths.kind, page: featureUsagePaths.page, other: featureUsagePaths.other, uses: sql<number>`sum(${featureUsagePaths.uses})::int` })
        .from(featureUsagePaths)
        .where(gte(featureUsagePaths.day, from))
        .groupBy(featureUsagePaths.kind, featureUsagePaths.page, featureUsagePaths.other),
      db
        .select({ userGroup: d.userGroup, personDays: sql<number>`sum(${d.people})::int` })
        .from(d)
        .where(and(gte(d.day, from), inGroups, sql`${d.kind} = ${VISIT_KIND}`))
        .groupBy(d.userGroup),
      db.select().from(featureFirstSeen),
      db.select({ since: sql<string | null>`min(${d.day})` }).from(d),
    ]);
    const asRows = (rows: typeof current) => rows.map((r) => ({ ...r, kind: r.kind as UsageKind, platform: r.platform as UsagePlatform }));
    res.json(
      featureUsageReport({
        days,
        groups,
        today,
        countingSince: first?.since ?? null,
        pages: pageCatalog(),
        actions: actionCatalog(app),
        now: asRows(current),
        before: asRows(prior),
        paths: paths.map((p) => ({ ...p, kind: p.kind as PathRow["kind"] })),
        activity: activity.map((a) => ({ userGroup: a.userGroup as UsageGroup, personDays: a.personDays })),
        firstSeen: new Map(seen.map((s) => [`${s.kind}\u0000${s.feature}`, s.firstSeen])),
      }),
    );
  });
}
