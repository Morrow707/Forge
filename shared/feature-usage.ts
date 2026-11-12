/* WHAT PEOPLE USE IN FORGE (2026-11-12). Scott: "we have so many things in the app, so many
 * features, so many tools, what if some of them aren't being used, can't be used, cant even be
 * seen? how would we know? ... no information obviously i don't care who is using it, but what are
 * people using? what are people using the most? what are people using the least?"
 *
 * Three questions, three signals, all counts:
 *   - USED: how often each page was opened and each action was done, by kind of account.
 *   - CAN'T BE USED: an action people try that the server refuses or fails most of the time.
 *   - CAN'T BE SEEN: a page nothing in the code links to, and a page or action nobody opened.
 * A page is stored as its route pattern (/coach/roster/:athleteId), an action as its route template
 * (POST /api/hardy/ask), so nothing recorded names a person, a team or a record.
 *
 * Pure: no database, no clock. server/feature-usage.ts records and reads; the admin page draws. */

export const USAGE_GROUPS = ["Signed out", "Coaches", "Coached athletes", "Free Agents", "Guardians", "Admins"] as const;
export type UsageGroup = (typeof USAGE_GROUPS)[number];
export const USAGE_KINDS = ["page", "action"] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

/** The report's default view leaves Admins out: Scott and the calibration sessions are admins, and
 * their testing would otherwise read as everybody's habit. */
export const USAGE_DEFAULT_GROUPS: readonly UsageGroup[] = USAGE_GROUPS.filter((g) => g !== "Admins");

/** An action is called hard to use when at least this share of its tries were refused or failed... */
export const HARD_TO_USE_SHARE = 0.5;
/** ...over at least this many tries, so one refused tap does not condemn a feature. */
export const HARD_TO_USE_MIN_TRIES = 5;

export type CatalogPage = { path: string; linked: boolean };

/** Every page the app routes, read off App.tsx's <Route path="..."> declarations. */
export function pagePathsFromAppSource(appSource: string): string[] {
  // `<Route path="/coach/roster/:athleteId">` -> "/coach/roster/:athleteId".
  // https://regex101.com/?regex=%3CRoute%5Cs%2Bpath%3D%22(%5B%5E%22%5D%2B)%22&testString=%3CRoute%20path%3D%22%2Fcoach%2Froster%2F%3AathleteId%22%3E
  const paths = Array.from(appSource.matchAll(/<Route\s+path="([^"]+)"/g), (m) => m[1]);
  return Array.from(new Set(paths));
}

function escapeRegex(text: string): string {
  // Any regex metacharacter, so a path is matched literally: "." in "a.b" yes, "/" or "-" no.
  // https://regex101.com/?regex=%5B.*%2B%3F%5E%24%7B%7D()%7C%5B%5C%5D%5C%5C%5D&testString=a.b%2Fc-d
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The part of a pattern before its first parameter: "/coach/roster/:athleteId" -> "/coach/roster/". */
function staticPrefix(pattern: string): string {
  const at = pattern.indexOf("/:");
  return at === -1 ? pattern : pattern.slice(0, at + 1);
}

/** Whether any other source file names this page in a string a link could be built from. A
 * HEURISTIC, said so on the report: a link assembled from pieces (`${base}/x`) is not found, so a
 * page marked unlinked is worth checking, not proven unreachable. "/" is the app's front door. */
export function pageIsLinked(pattern: string, sources: readonly string[]): boolean {
  if (pattern === "/") return true;
  const prefix = staticPrefix(pattern);
  const exact = prefix === pattern;
  // Exact page: the path in quotes or a template, ending at the quote, a query or a hash.
  //   '"/coach/branding"' and '`/coach/branding?x`' yes; '"/coach/branding-old"' no.
  // A parameter page: its static prefix opening a string, e.g. '`/coach/roster/${id}`'.
  // https://regex101.com/?regex=%5B%22'%60%5D%2Fcoach%2Fbranding(%3F%3D%5B%22'%60%3F%23%5D)&testString=%22%2Fcoach%2Fbranding%22%20%22%2Fcoach%2Fbranding-old%22
  const re = exact ? new RegExp(`["'\`]${escapeRegex(pattern)}(?=["'\`?#])`) : new RegExp(`["'\`]${escapeRegex(prefix)}`);
  return sources.some((s) => re.test(s));
}

export function pageCatalogFromSource(appSource: string, otherSources: readonly string[]): CatalogPage[] {
  return pagePathsFromAppSource(appSource).map((path) => ({ path, linked: pageIsLinked(path, otherSources) }));
}

function segmentsOf(path: string): string[] {
  return path.split("?")[0].split("#")[0].split("/").filter(Boolean);
}

/** The route pattern a real path belongs to, or null. A pattern with more fixed segments wins, so
 * "/athlete/classes/review" is not counted as "/athlete/classes/:id". */
export function matchPagePattern(path: string, patterns: readonly string[]): string | null {
  const parts = segmentsOf(path);
  const fits = patterns.filter((p) => {
    const ps = segmentsOf(p);
    return ps.length === parts.length && ps.every((seg, i) => seg.startsWith(":") || seg === parts[i]);
  });
  const fixedCount = (p: string) => segmentsOf(p).filter((s) => !s.startsWith(":")).length;
  return fits.sort((a, b) => fixedCount(b) - fixedCount(a))[0] ?? null;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "athleteId" -> "athlete", "programDayId" -> "program day", "slug" -> "slug". */
function paramWords(name: string): string {
  const base = name.endsWith("Id") ? name.slice(0, -2) : name;
  // Each capital starts a new word: "programDay" -> "program Day"; "slug" has none.
  // https://regex101.com/?regex=(%5BA-Z%5D)&testString=programDay
  const spaced = base.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return spaced || "item";
}

/** "/coach/roster/:athleteId" -> "Coach › Roster › (one athlete)"; "/" -> "Home". */
export function pageLabel(pattern: string): string {
  const parts = segmentsOf(pattern);
  if (parts.length === 0) return "Home";
  const word = (seg: string) => (seg.startsWith(":") ? `(one ${paramWords(seg.slice(1))})` : capitalise(seg.split("-").join(" ")));
  return parts.map(word).join(" › ");
}

/** The part of the app an action belongs to: "GET /api/coach/roster" -> "coach". */
export function actionArea(action: string): string {
  const path = action.split(" ")[1] ?? "";
  return segmentsOf(path)[1] ?? "other";
}

export type UsageCounts = { uses: number; refused: number; failed: number; people: number };
export type UsageRow = UsageCounts & { kind: UsageKind; feature: string };
export type ReportEntry = UsageCounts & {
  kind: UsageKind;
  feature: string;
  label: string;
  area: string;
  before: number;
  /** Pages only: whether anything in the code was found linking to it. */
  linked: boolean | null;
  /** Recorded but no longer in the app (a removed page or route). */
  retired: boolean;
};
export type FeatureUsageReport = {
  days: number;
  groups: UsageGroup[];
  /** The first day anything was counted: a zero means "not since then", never "never". */
  countingSince: string | null;
  pagesInApp: number;
  pagesUsed: number;
  actionsInApp: number;
  actionsUsed: number;
  entries: ReportEntry[];
};

const ZERO: UsageCounts = { uses: 0, refused: 0, failed: 0, people: 0 };

function sumByFeature(rows: readonly UsageRow[]): Map<string, UsageCounts & { kind: UsageKind; feature: string }> {
  return rows.reduce((acc, r) => {
    const key = `${r.kind}\u0000${r.feature}`;
    const prev = acc.get(key) ?? { ...ZERO, kind: r.kind, feature: r.feature };
    acc.set(key, { ...prev, uses: prev.uses + r.uses, refused: prev.refused + r.refused, failed: prev.failed + r.failed, people: prev.people + r.people });
    return acc;
  }, new Map<string, UsageCounts & { kind: UsageKind; feature: string }>());
}

/** Every page and action in the app with its counts for the period, including the ones at zero --
 * the zeros are half of what this report is for. */
export function featureUsageReport(input: {
  days: number;
  groups: UsageGroup[];
  countingSince: string | null;
  pages: readonly CatalogPage[];
  actions: readonly string[];
  now: readonly UsageRow[];
  before: readonly UsageRow[];
}): FeatureUsageReport {
  const now = sumByFeature(input.now);
  const before = sumByFeature(input.before);
  const entryFor = (kind: UsageKind, feature: string, linked: boolean | null, retired: boolean): ReportEntry => {
    const key = `${kind}\u0000${feature}`;
    const c = now.get(key) ?? ZERO;
    return {
      kind,
      feature,
      label: kind === "page" ? pageLabel(feature) : feature,
      area: kind === "page" ? (segmentsOf(feature)[0] ?? "home") : actionArea(feature),
      uses: c.uses,
      refused: c.refused,
      failed: c.failed,
      people: c.people,
      before: before.get(key)?.uses ?? 0,
      linked,
      retired,
    };
  };
  const pageSet = new Set(input.pages.map((p) => p.path));
  const actionSet = new Set(input.actions);
  const known = [
    ...input.pages.map((p) => entryFor("page", p.path, p.linked, false)),
    ...input.actions.map((a) => entryFor("action", a, null, false)),
  ];
  const retired = Array.from(now.values())
    .filter((c) => !(c.kind === "page" ? pageSet : actionSet).has(c.feature))
    .map((c) => entryFor(c.kind, c.feature, null, true));
  const entries = [...known, ...retired].sort((a, b) => b.uses - a.uses || a.feature.localeCompare(b.feature));
  const used = (kind: UsageKind) => known.filter((e) => e.kind === kind && e.uses > 0).length;
  return {
    days: input.days,
    groups: input.groups,
    countingSince: input.countingSince,
    pagesInApp: input.pages.length,
    pagesUsed: used("page"),
    actionsInApp: input.actions.length,
    actionsUsed: used("action"),
    entries,
  };
}

/** Tried often enough, and refused or failed most of the time: a feature people want and cannot use. */
export function isHardToUse(e: Pick<UsageCounts, "uses" | "refused" | "failed">): boolean {
  return e.uses >= HARD_TO_USE_MIN_TRIES && (e.refused + e.failed) / e.uses >= HARD_TO_USE_SHARE;
}
