import type { Express, NextFunction, Request, Response } from "express";
import { createHmac } from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { and, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { requireRole } from "./auth";
import { storage } from "./storage";
import { DEMO_ACCOUNT_EMAILS } from "./demo-accounts";
import { featureUsageDaily, featureUsageSeen, type User } from "@shared/schema";
import {
  USAGE_DEFAULT_GROUPS,
  USAGE_GROUPS,
  featureUsageReport,
  matchPagePattern,
  pageCatalogFromSource,
  type CatalogPage,
  type UsageGroup,
  type UsageKind,
} from "@shared/feature-usage";

/* WHAT PEOPLE USE, RECORDED (2026-11-12). See shared/feature-usage.ts for the questions.
 *
 * Counting is in memory and written once a minute, so no request waits on it and no request can
 * fail because of it. What is written per day is: the page pattern or action template, the kind of
 * account, how many uses, how many the server refused or failed, and how many different people --
 * the last counted with a keyed hash that changes every day (feature_usage_seen), deleted once the
 * day is over. No account id, no path with an id in it, no request body, nothing typed.
 *
 * Left out on purpose: the three demo accounts (screenshots are not use), and the page ping itself.
 * Admins ARE counted, as their own group, and the report leaves them out by default. */

const FLUSH_MS = 60_000; // one write a minute
const MINUTE_MS = 60_000;
const GROUP_CACHE_MINUTES = 10;
const GROUP_CACHE_MS = GROUP_CACHE_MINUTES * MINUTE_MS;
const KEY_CHARS = 16;
const DAY_MS = 86_400_000;
const WEEK = 7;
const FOUR_WEEKS = 28;
const QUARTER = 90;
const PERIODS = [WEEK, FOUR_WEEKS, QUARTER] as const;
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const PERIODS_BACK_FOR_COMPARISON = 2;
const HTTP_UNAUTHORIZED = 401;
const HTTP_CLIENT_ERROR = 400;
const HTTP_SERVER_ERROR = 500;
const PAGE_PING = "/api/usage/page";
const PATH_MAX = 300;
const DEMO_EMAILS = new Set<string>(DEMO_ACCOUNT_EMAILS);

type Bucket = { uses: number; refused: number; failed: number; people: Set<string> };
let buffer = new Map<string, Bucket>();
const groupCache = new Map<number, { group: UsageGroup; until: number }>();

const ISO_DATE_LENGTH = 10;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, ISO_DATE_LENGTH);

/** A keyed hash of the account id that changes every day: counts a person once a day, joins to
 * nothing on any other day, and maps back to nobody. */
function personKey(userId: number, day: string): string {
  return createHmac("sha256", `${process.env.SESSION_SECRET ?? "forge"}:feature-usage:${day}`).update(String(userId)).digest("hex").slice(0, KEY_CHARS);
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

/** Adds one use to the in-memory day. Never throws: counting must not break anything. */
export async function countUse(kind: UsageKind, feature: string, user: User | undefined, status: number, now = Date.now()): Promise<void> {
  try {
    if (user && DEMO_EMAILS.has(user.email)) return;
    const day = isoDay(now);
    const group = await groupOf(user, now);
    const key = JSON.stringify([day, kind, feature, group]);
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

/** Writes the buffered minute. Exported so a test can wait on it. */
export async function flushFeatureUsage(now = Date.now()): Promise<void> {
  const pending = buffer;
  buffer = new Map();
  if (pending.size === 0) return;
  try {
    await db.transaction(async (tx) => {
      const entries = Array.from(pending.entries());
      await entries.reduce(async (prev, [key, b]) => {
        await prev;
        const [day, kind, feature, userGroup] = JSON.parse(key) as [string, UsageKind, string, UsageGroup];
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
          .values({ day, kind, feature, userGroup, uses: b.uses, refused: b.refused, failed: b.failed, people: fresh.length })
          .onConflictDoUpdate({
            target: [featureUsageDaily.day, featureUsageDaily.kind, featureUsageDaily.feature, featureUsageDaily.userGroup],
            set: {
              uses: sql`${featureUsageDaily.uses} + ${b.uses}`,
              refused: sql`${featureUsageDaily.refused} + ${b.refused}`,
              failed: sql`${featureUsageDaily.failed} + ${b.failed}`,
              people: sql`${featureUsageDaily.people} + ${fresh.length}`,
            },
          });
      }, Promise.resolve());
      // A day's person keys are only needed while that day can still be counted.
      await tx.delete(featureUsageSeen).where(lt(featureUsageSeen.day, isoDay(now - DAY_MS)));
    });
  } catch (err) {
    // A lost minute of counts is the whole cost; nothing else depends on this.
    console.warn("[feature-usage] could not write the counts:", err instanceof Error ? err.message : err);
  }
}

/** Every action the server answers, read off the router itself, so a route added next year is in
 * the report (at zero) the day it exists. */
function actionCatalog(app: Express): string[] {
  type Layer = { route?: { path: string | string[]; methods: Record<string, boolean> } };
  const stack: Layer[] = (app as unknown as { _router?: { stack: Layer[] } })._router?.stack ?? [];
  const actions = stack.flatMap((layer) => {
    if (!layer.route) return [];
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    const methods = Object.keys(layer.route.methods).filter((m) => m !== "_all");
    return paths.filter((p) => typeof p === "string" && p.startsWith("/api/") && p !== PAGE_PING).flatMap((p) => methods.map((m) => `${m.toUpperCase()} ${p}`));
  });
  return Array.from(new Set(actions)).sort();
}

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name.startsWith("__") ? [] : sourceFiles(full);
    // A source file and not a test: "app-shell.tsx" yes, "a.test.ts" / "b.itest.ts" / "c.json" no.
    // https://regex101.com/?regex=%5C.(ts%7Ctsx)%24&testString=app-shell.tsx
    const isSource = /\.(ts|tsx)$/.test(entry.name) && !/\.(test|itest)\.tsx?$/.test(entry.name);
    return isSource ? [full] : [];
  });
}

/** The pages the app routes and whether anything links to each. Built at build time into
 * dist/page-catalog.json (scripts/generate-page-catalog.ts); read from source where that file is
 * absent (development and the tests), through the same function. */
export function computePageCatalog(root: string): CatalogPage[] {
  const appFile = path.join(root, "client/src/App.tsx");
  const others = ["client/src", "shared", "server"].flatMap((d) => sourceFiles(path.join(root, d))).filter((f) => f !== appFile);
  return pageCatalogFromSource(fs.readFileSync(appFile, "utf8"), others.map((f) => fs.readFileSync(f, "utf8")));
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

/** Counts every API request by its route template once the response has gone. */
export function recordFeatureUsage(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith("/api/") && req.path !== PAGE_PING) {
    res.on("finish", () => {
      const template = req.route?.path;
      if (typeof template !== "string") return; // nothing answered it: a 404, not a feature
      void countUse("action", `${req.method} ${req.baseUrl}${template}`, req.user as User | undefined, res.statusCode);
    });
  }
  next();
}

const pagePingSchema = z.object({ path: z.string().min(1).max(PATH_MAX) });
const reportQuerySchema = z.object({
  days: z.coerce.number().refine((d) => (PERIODS as readonly number[]).includes(d)).default(PERIODS[1]),
  groups: z.string().optional(),
});

export function registerFeatureUsage(app: Express): void {
  app.use(recordFeatureUsage);
  const timer = setInterval(() => void flushFeatureUsage(), FLUSH_MS);
  timer.unref();

  // The client says which page it is on; only a page the app actually routes is counted, and only
  // as its pattern. The path itself is matched here and never stored.
  app.post(PAGE_PING, async (req, res) => {
    const parsed = pagePingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP_CLIENT_ERROR).json({ message: "A page path is required." });
    const pattern = matchPagePattern(parsed.data.path, pageCatalog().map((p) => p.path));
    if (pattern) await countUse("page", pattern, req.user as User | undefined, HTTP_OK);
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
    const from = isoDay(now - (days - 1) * DAY_MS);
    const priorFrom = isoDay(now - (PERIODS_BACK_FOR_COMPARISON * days - 1) * DAY_MS);
    const cols = { kind: featureUsageDaily.kind, feature: featureUsageDaily.feature, uses: featureUsageDaily.uses, refused: featureUsageDaily.refused, failed: featureUsageDaily.failed, people: featureUsageDaily.people };
    const [current, prior, [first]] = await Promise.all([
      db.select(cols).from(featureUsageDaily).where(and(gte(featureUsageDaily.day, from), inArray(featureUsageDaily.userGroup, groups))),
      db.select(cols).from(featureUsageDaily).where(and(gte(featureUsageDaily.day, priorFrom), lt(featureUsageDaily.day, from), inArray(featureUsageDaily.userGroup, groups))),
      db.select({ since: sql<string | null>`min(${featureUsageDaily.day})` }).from(featureUsageDaily),
    ]);
    const asRows = (rows: typeof current) => rows.map((r) => ({ ...r, kind: r.kind as UsageKind }));
    res.json(
      featureUsageReport({
        days,
        groups,
        countingSince: first?.since ?? null,
        pages: pageCatalog(),
        actions: actionCatalog(app),
        now: asRows(current),
        before: asRows(prior),
      }),
    );
  });
}
