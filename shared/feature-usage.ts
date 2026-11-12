/* WHAT PEOPLE USE IN FORGE (2026-11-12). Scott: "we have so many things in the app, so many
 * features, so many tools, what if some of them aren't being used, can't be used, cant even be
 * seen? how would we know? ... no information obviously i don't care who is using it, but what are
 * people using? what are people using the most? what are people using the least?" And then: "what
 * are people using the least, why? ... what are people using the most? why? ... i don't want to see
 * who is doing the looking, just what they are looking at."
 *
 * Counts only. A page is stored as its route pattern (/coach/roster/:athleteId), an action as its
 * route template (POST /api/hardy/ask), an interaction as a name from UI_INTERACTIONS below, so
 * nothing recorded names a person, a team or a record. For each one the report says WHY it reads
 * the way it does, from five signals:
 *   - nothing in the code links to the page;
 *   - nobody it is for used the app in the period;
 *   - people tried and were refused or the server failed (a plan wall, a permission, an error);
 *   - the page was opened but nothing was ever saved or changed from it;
 *   - it is too new to judge;
 * and for the busiest pages, which pages people came from.
 *
 * Pure: no database, no clock. server/feature-usage.ts records and reads; the admin page draws. */

export const USAGE_GROUPS = ["Signed out", "Coaches", "Coached athletes", "Free Agents", "Guardians", "Admins"] as const;
export type UsageGroup = (typeof USAGE_GROUPS)[number];
export const USAGE_KINDS = ["page", "action", "interaction"] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];
export const USAGE_PLATFORMS = ["iPhone app", "Android app", "Website"] as const;
export type UsagePlatform = (typeof USAGE_PLATFORMS)[number];

/** The report's default view leaves Admins out: Scott and the calibration sessions are admins, and
 * their testing would otherwise read as everybody's habit. */
export const USAGE_DEFAULT_GROUPS: readonly UsageGroup[] = USAGE_GROUPS.filter((g) => g !== "Admins");

/** THE FLOOR. Looking at one kind of account, a number with fewer than this many person-days
 * behind it reads "fewer than 5" instead of the count, so a small group (three guardians) cannot
 * be read as what one particular person did. Zero is always shown: the zeros are the point. */
export const USAGE_FLOOR = 5;
/** An action is called hard to use when at least this share of its tries were refused or failed... */
export const HARD_TO_USE_SHARE = 0.5;
/** ...over at least this many tries, so one refused tap does not condemn a feature. */
export const HARD_TO_USE_MIN_TRIES = 5;
/** Anything that first appeared fewer days ago than this is too new to judge. */
export const TOO_NEW_DAYS = 7;
/** How many "came from" pages the report keeps for a page. */
export const CAME_FROM_SHOWN = 3;
/** Counts older than this are deleted (13 months). */
export const USAGE_RETENTION_DAYS = 400;

/** THE NAMED THINGS INSIDE A PAGE worth counting: tabs, panels and dialogs that change nothing on
 * the server, so neither the page count nor the action count would see them. A fixed list on
 * purpose -- the server refuses any other name, and every entry shows in the report at zero until
 * somebody uses it. Add one here and call countInteraction with it. */
export const ATHLETE_PAGE_TABS = {
  metrics: "Body Metrics",
  testing: "Testing History",
  "bar-speed": "Bar Speed",
  rom: "Goniometer",
  "movement-screen": "Movement Screen",
  weakness: "Weakness Report",
  goals: "Goals",
  skills: "Skill Clips",
  trophies: "Trophies",
  nutrition: "Nutrition",
  chat: "AI Chat",
} as const;
type AthleteTabInteraction = `Coach athlete page: ${(typeof ATHLETE_PAGE_TABS)[keyof typeof ATHLETE_PAGE_TABS]} tab`;
const athleteTabName = (label: string) => `Coach athlete page: ${label} tab` as AthleteTabInteraction;
const SINGLE_INTERACTIONS = ["Hardy: opened", "Bar Speed: zone editor opened", "Strength profile: body map tapped", "Classes: flashcard flipped"] as const;
export type UiInteraction = (typeof SINGLE_INTERACTIONS)[number] | AthleteTabInteraction;
export const UI_INTERACTIONS: readonly UiInteraction[] = [...SINGLE_INTERACTIONS, ...Object.values(ATHLETE_PAGE_TABS).map(athleteTabName)];
/** The interaction for a tab on the coach's athlete page, or null for a tab not on the list. */
export function athleteTabInteraction(tabValue: string): UiInteraction | null {
  const label = (ATHLETE_PAGE_TABS as Record<string, string>)[tabValue];
  return label ? athleteTabName(label) : null;
}
export function isUiInteraction(name: string): name is UiInteraction {
  return (UI_INTERACTIONS as readonly string[]).includes(name);
}

/** Who a page or action is for, read off its address: /coach/... is for coaches, /athlete/... for
 * athletes of both kinds, /admin/... for admins, /guardian... for guardians, anything else for
 * everyone. Used only to ask "was anybody it is for even here?" */
export function audienceOf(kind: UsageKind, feature: string): readonly UsageGroup[] {
  const path = kind === "action" ? (feature.split(" ")[1] ?? "") : feature;
  const parts = segmentsOf(path);
  const area = kind === "action" ? parts[1] : parts[0];
  if (area === "coach") return ["Coaches"];
  if (area === "athlete") return ["Coached athletes", "Free Agents"];
  if (area === "admin") return ["Admins"];
  if (area === "guardian") return ["Guardians"];
  return USAGE_GROUPS;
}

export type CatalogPage = { path: string; linked: boolean };

/** Every page the app routes, read off App.tsx's <Route path="..."> declarations. */
export function pagePathsFromAppSource(appSource: string): string[] {
  // `<Route path="/coach/roster/:athleteId">` -> "/coach/roster/:athleteId"; `<Redirect to="/x">` no.
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
export function pageIsLinked(pattern: string, sources: readonly string[], allPages: readonly string[] = []): boolean {
  if (pattern === "/") return true;
  const prefix = staticPrefix(pattern);
  const exact = prefix === pattern;
  // A list page links its own items, usually through a base passed in as a prop
  // (`${routeBase}/${p.id}`), which no string search can see: "/coach/programs/:id" counts as
  // linked when "/coach/programs" is a page and is itself linked.
  const onlyTheLastSegmentIsAParameter = pattern.lastIndexOf("/:") === prefix.length - 1;
  if (!exact && onlyTheLastSegmentIsAParameter) {
    const parent = prefix.slice(0, -1);
    if (allPages.includes(parent) && pageIsLinked(parent, sources, allPages)) return true;
  }
  // Exact page: the path opening a string (or following a `${origin}`) and ending at a quote, a
  // query or a hash -- '"/coach/branding"', '`/coach/branding?x`' and '`${o}/coach/branding`' yes;
  // '"/coach/branding-old"' no. A parameter page: its static prefix in the same places, e.g.
  // '`/coach/roster/${id}`' or '`${window.location.origin}/claim/${code}`'.
  // https://regex101.com/?regex=%5B%22'%60%7D%5D%2Fcoach%2Fbranding(%3F%3D%5B%22'%60%3F%23%5D)&testString=%22%2Fcoach%2Fbranding%22%20%22%2Fcoach%2Fbranding-old%22
  const re = exact ? new RegExp(`["'\`}]${escapeRegex(pattern)}(?=["'\`?#])`) : new RegExp(`["'\`}]${escapeRegex(prefix)}`);
  return sources.some((s) => re.test(s));
}

export function pageCatalogFromSource(appSource: string, otherSources: readonly string[]): CatalogPage[] {
  const all = pagePathsFromAppSource(appSource);
  return all.map((path) => ({ path, linked: pageIsLinked(path, otherSources, all) }));
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

const ID_SUFFIX = "Id";
/** Words a page address spells in lower case that read wrong capitalised: "ai-spend" -> "AI spend". */
const ACRONYMS: Record<string, string> = { ai: "AI", av: "AV", pr: "PR", rom: "ROM", eula: "EULA" };
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "athleteId" -> "athlete", "programDayId" -> "program day", "slug" -> "slug". */
function paramWords(name: string): string {
  const base = name.endsWith(ID_SUFFIX) ? name.slice(0, -ID_SUFFIX.length) : name;
  // Each capital starts a new word: "programDay" -> "program Day"; "slug" has none.
  // https://regex101.com/?regex=(%5BA-Z%5D)&testString=programDay
  const spaced = base.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return spaced && spaced !== "id" ? spaced : "item";
}

/** "/coach/roster/:athleteId" -> "Coach › Roster › (one athlete)"; "/" -> "Home". */
export function pageLabel(pattern: string): string {
  const parts = segmentsOf(pattern);
  if (parts.length === 0) return "Home";
  const word = (seg: string) => (seg.startsWith(":") ? `(one ${paramWords(seg.slice(1))})` : capitalise(seg.split("-").map((w) => ACRONYMS[w] ?? w).join(" ")));
  return parts.map(word).join(" › ");
}

/** Which part of the app a page, action or interaction belongs to, for grouping the report. */
function areaOf(kind: UsageKind, feature: string): string {
  const byKind: Record<UsageKind, () => string> = {
    page: () => segmentsOf(feature)[0] ?? "home",
    action: () => actionArea(feature),
    interaction: () => "inside a page",
  };
  return byKind[kind]();
}

/** The part of the app an action belongs to: "GET /api/coach/roster" -> "coach". */
export function actionArea(action: string): string {
  const path = action.split(" ")[1] ?? "";
  return segmentsOf(path)[1] ?? "other";
}

/** A write: the kind of action that means somebody DID something on a page, not just looked. */
export function isWriteAction(action: string): boolean {
  return !action.startsWith("GET ");
}

export type UsageCounts = { uses: number; refused: number; failed: number; people: number };
export type UsageRow = UsageCounts & { kind: UsageKind; feature: string; platform: UsagePlatform };
export type PathRow = { kind: "came-from" | "done-on"; page: string; other: string; uses: number };
export type GroupActivity = { userGroup: UsageGroup; personDays: number };

export type ReportEntry = {
  kind: UsageKind;
  feature: string;
  label: string;
  area: string;
  /** null where the floor hides it; see USAGE_FLOOR. */
  uses: number | null;
  people: number | null;
  refused: number;
  failed: number;
  before: number;
  byPlatform: Partial<Record<UsagePlatform, number>>;
  /** Pages only: whether anything in the code was found linking to it. */
  linked: boolean | null;
  /** Pages only: the pages people were on just before. */
  cameFrom: { page: string; label: string; uses: number }[];
  /** Pages only: how many times something was saved or changed while on it. */
  doneOn: number | null;
  firstSeen: string | null;
  /** Recorded but no longer in the app (a removed page or route). */
  retired: boolean;
  hardToUse: boolean;
  /** The likeliest reason it reads the way it does, in a sentence. */
  why: string | null;
  /** Used only to sort: the real count, so the order is right even where the number is hidden. */
  rank: number;
};
export type FeatureUsageReport = {
  days: number;
  groups: UsageGroup[];
  /** The first day anything was counted: a zero means "not since then", never "ever". */
  countingSince: string | null;
  floor: number;
  activity: { userGroup: UsageGroup; personDays: number | null }[];
  pagesInApp: number;
  pagesUsed: number;
  actionsInApp: number;
  actionsUsed: number;
  interactionsInApp: number;
  interactionsUsed: number;
  entries: ReportEntry[];
};

const ZERO: UsageCounts = { uses: 0, refused: 0, failed: 0, people: 0 };
const keyOf = (kind: UsageKind, feature: string) => `${kind}\u0000${feature}`;
const DAY_MS = 86_400_000;
const PERCENT = 100;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

type Summed = UsageCounts & { byPlatform: Partial<Record<UsagePlatform, number>> };
function sumByFeature(rows: readonly UsageRow[]): Map<string, Summed> {
  return rows.reduce((acc, r) => {
    const key = keyOf(r.kind, r.feature);
    const prev = acc.get(key) ?? { ...ZERO, byPlatform: {} };
    acc.set(key, {
      uses: prev.uses + r.uses,
      refused: prev.refused + r.refused,
      failed: prev.failed + r.failed,
      people: prev.people + r.people,
      byPlatform: { ...prev.byPlatform, [r.platform]: (prev.byPlatform[r.platform] ?? 0) + r.uses },
    });
    return acc;
  }, new Map<string, Summed>());
}

/** The likeliest reason a number is what it is. Ordered: the first that fits is the answer. */
export function whyItReads(e: {
  kind: UsageKind;
  feature: string;
  uses: number;
  refused: number;
  failed: number;
  linked: boolean | null;
  doneOn: number | null;
  firstSeen: string | null;
  retired: boolean;
  topCameFrom: string | null;
  audienceActive: number;
  today: string;
  isBusiest: boolean;
}): string | null {
  const age = e.firstSeen ? daysBetween(e.firstSeen, e.today) : null;
  const tried = e.refused + e.failed;
  if (e.retired) return "No longer in the app; these are uses from before it was removed.";
  if (e.uses === 0 && age != null && age < TOO_NEW_DAYS) return `Added ${age} day${age === 1 ? "" : "s"} ago: too new to judge.`;
  if (e.uses === 0 && e.kind === "page" && e.linked === false) return "Nothing in the app links here, so nobody can find it.";
  if (e.uses === 0 && e.audienceActive === 0) return "Nobody it's for used the app in this period.";
  if (e.uses === 0 && e.kind === "action") return "Never done. Either the button that does it is hard to find, or nobody wants it.";
  if (e.uses === 0) return "Linked, and the people it's for were here, but nobody opened it: hard to find, or not wanted.";
  if (isHardToUse({ uses: e.uses, refused: e.refused, failed: e.failed })) {
    const share = Math.round((tried / e.uses) * PERCENT);
    const how = e.failed > e.refused ? "the server failed" : "it was refused (a plan, a permission or a check)";
    return `Tried ${e.uses} times and ${share}% of the time ${how}: people want it and can't use it.`;
  }
  if (e.kind === "page" && e.doneOn === 0) return `Opened ${e.uses} times; nothing was saved or changed from it. Fine for a page you read, a sign it's confusing for one you use.`;
  if (e.isBusiest && e.topCameFrom) return `Most people arrive from ${e.topCameFrom}.`;
  return null;
}

/** Every page, action and interaction in the app with its counts for the period, including the
 * ones at zero -- the zeros are half of what this report is for. */
export function featureUsageReport(input: {
  days: number;
  groups: UsageGroup[];
  today: string;
  countingSince: string | null;
  pages: readonly CatalogPage[];
  actions: readonly string[];
  now: readonly UsageRow[];
  before: readonly UsageRow[];
  paths: readonly PathRow[];
  activity: readonly GroupActivity[];
  firstSeen: ReadonlyMap<string, string>;
}): FeatureUsageReport {
  const now = sumByFeature(input.now);
  const before = sumByFeature(input.before);
  // The floor applies when the view is narrowed to one kind of account.
  const floored = input.groups.length === 1;
  const hide = (personDays: number) => floored && personDays > 0 && personDays < USAGE_FLOOR;
  const activeBy = new Map(input.activity.map((a) => [a.userGroup, a.personDays]));
  const cameFromBy = input.paths
    .filter((p) => p.kind === "came-from")
    .reduce((acc, p) => acc.set(p.page, [...(acc.get(p.page) ?? []), p]), new Map<string, PathRow[]>());
  const doneOnBy = input.paths
    .filter((p) => p.kind === "done-on")
    .reduce((acc, p) => acc.set(p.page, (acc.get(p.page) ?? 0) + p.uses), new Map<string, number>());
  const pageSet = new Set(input.pages.map((p) => p.path));
  const actionSet = new Set(input.actions);
  const interactionSet = new Set<string>(UI_INTERACTIONS);
  const catalogFor: Record<UsageKind, Set<string>> = { page: pageSet, action: actionSet, interaction: interactionSet };
  const inApp = (kind: UsageKind) => catalogFor[kind];

  const draft = (kind: UsageKind, feature: string, linked: boolean | null, retired: boolean) => {
    const c = now.get(keyOf(kind, feature)) ?? { ...ZERO, byPlatform: {} };
    const cameFrom = (cameFromBy.get(feature) ?? [])
      .filter(() => kind === "page")
      .sort((a, b) => b.uses - a.uses)
      .slice(0, CAME_FROM_SHOWN)
      .map((p) => ({ page: p.other, label: pageLabel(p.other), uses: p.uses }));
    return { kind, feature, linked, retired, c, cameFrom };
  };
  type Draft = ReturnType<typeof draft>;
  const drafts: Draft[] = [
    ...input.pages.map((p) => draft("page", p.path, p.linked, false)),
    ...input.actions.map((a) => draft("action", a, null, false)),
    ...UI_INTERACTIONS.map((i) => draft("interaction", i, null, false)),
    ...Array.from(now.keys())
      .map((k) => k.split("\u0000") as [UsageKind, string])
      .filter(([kind, feature]) => !inApp(kind).has(feature))
      .map(([kind, feature]) => draft(kind, feature, null, true)),
  ];
  const busiest = new Set(
    drafts
      .filter((d) => d.kind === "page")
      .sort((a, b) => b.c.uses - a.c.uses)
      .slice(0, CAME_FROM_SHOWN * CAME_FROM_SHOWN)
      .filter((d) => d.c.uses > 0)
      .map((d) => d.feature),
  );

  const entries: ReportEntry[] = drafts
    .map((d) => {
      const audienceActive = audienceOf(d.kind, d.feature)
        .filter((g) => input.groups.includes(g))
        .reduce((sum, g) => sum + (activeBy.get(g) ?? 0), 0);
      const doneOn = d.kind === "page" ? (doneOnBy.get(d.feature) ?? 0) : null;
      const firstSeen = input.firstSeen.get(keyOf(d.kind, d.feature)) ?? null;
      const hidden = hide(d.c.people);
      return {
        kind: d.kind,
        feature: d.feature,
        label: d.kind === "page" ? pageLabel(d.feature) : d.feature,
        area: areaOf(d.kind, d.feature),
        uses: hidden ? null : d.c.uses,
        people: hidden ? null : d.c.people,
        refused: hidden ? 0 : d.c.refused,
        failed: hidden ? 0 : d.c.failed,
        before: hidden ? 0 : (before.get(keyOf(d.kind, d.feature))?.uses ?? 0),
        byPlatform: hidden ? {} : d.c.byPlatform,
        linked: d.linked,
        cameFrom: hidden ? [] : d.cameFrom,
        doneOn: hidden ? null : doneOn,
        firstSeen,
        retired: d.retired,
        hardToUse: !hidden && isHardToUse(d.c),
        why: whyItReads({
          kind: d.kind,
          feature: d.feature,
          uses: d.c.uses,
          refused: d.c.refused,
          failed: d.c.failed,
          linked: d.linked,
          doneOn,
          firstSeen,
          retired: d.retired,
          topCameFrom: d.cameFrom[0]?.label ?? null,
          audienceActive,
          today: input.today,
          isBusiest: busiest.has(d.feature),
        }),
        rank: d.c.uses,
      };
    })
    .sort((a, b) => b.rank - a.rank || a.feature.localeCompare(b.feature));

  const used = (kind: UsageKind) => drafts.filter((d) => d.kind === kind && !d.retired && d.c.uses > 0).length;
  return {
    days: input.days,
    groups: input.groups,
    countingSince: input.countingSince,
    floor: USAGE_FLOOR,
    activity: input.groups.map((g) => {
      const personDays = activeBy.get(g) ?? 0;
      return { userGroup: g, personDays: hide(personDays) ? null : personDays };
    }),
    pagesInApp: input.pages.length,
    pagesUsed: used("page"),
    actionsInApp: input.actions.length,
    actionsUsed: used("action"),
    interactionsInApp: UI_INTERACTIONS.length,
    interactionsUsed: used("interaction"),
    entries,
  };
}

/** Tried often enough, and refused or failed most of the time: a feature people want and cannot use. */
export function isHardToUse(e: Pick<UsageCounts, "uses" | "refused" | "failed">): boolean {
  return e.uses >= HARD_TO_USE_MIN_TRIES && (e.refused + e.failed) / e.uses >= HARD_TO_USE_SHARE;
}
