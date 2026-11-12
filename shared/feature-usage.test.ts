import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ATHLETE_PAGE_TABS,
  UI_INTERACTIONS,
  USAGE_FLOOR,
  featureUsageReport,
  matchPagePattern,
  pageCatalogFromSource,
  pageIsLinked,
  pageLabel,
  pagePathsFromAppSource,
  whyItReads,
  type UsageRow,
} from "./feature-usage";

/* The rules behind "What People Use" (2026-11-12): what a page is counted as, when a page reads as
 * unlinked, the likeliest reason for a number, and the floor that keeps a small group's numbers
 * from reading as one person's. Plus two ratchets that hold the named interactions to the app. */

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const TODAY = "2026-11-12";
const LONG_AGO = "2026-01-01";
const YESTERDAY = "2026-11-11";
const PEOPLE_HERE = 10;
const MORE_THAN_A_HUNDRED_PAGES = 100;
const TRIES = 10;
const REFUSED_MOST = 7;
const OPENED = 12;
const BUSY = 40;
const SAVED = 3;
const WEEK = 7;
const COACH_USES = 30;
const COACH_PEOPLE = 12;
const SOME_USES = 9;
const TWO = 2;
const ONE = 1;
const SIX = 6;

function clientFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return clientFiles(full);
    // A source file, not a test: "app-shell.tsx" yes, "a.test.ts" no.
    // https://regex101.com/?regex=%5C.tsx%3F%24&testString=app-shell.tsx
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const why = (over: Partial<Parameters<typeof whyItReads>[0]>) =>
  whyItReads({ kind: "page", feature: "/x", uses: 0, refused: 0, failed: 0, linked: true, doneOn: 0, firstSeen: LONG_AGO, retired: false, topCameFrom: null, audienceActive: PEOPLE_HERE, today: TODAY, isBusiest: false, ...over });

describe("what a page is counted as", () => {
  it("reads every <Route path> off App.tsx", () => {
    const paths = pagePathsFromAppSource(read("client/src/App.tsx"));
    expect(paths).toContain("/coach/roster/:athleteId");
    expect(paths).toContain("/admin/feature-usage");
    expect(paths.length).toBeGreaterThan(MORE_THAN_A_HUNDRED_PAGES);
  });

  it("matches a real path to its pattern, the more specific pattern winning, and never keeps the id", () => {
    const patterns = ["/athlete/classes/:id", "/athlete/classes/review", "/coach/roster/:athleteId", "/"];
    expect(matchPagePattern("/athlete/classes/review", patterns)).toBe("/athlete/classes/review");
    expect(matchPagePattern("/athlete/classes/42", patterns)).toBe("/athlete/classes/:id");
    expect(matchPagePattern("/coach/roster/917?tab=goals", patterns)).toBe("/coach/roster/:athleteId");
    expect(matchPagePattern("/", patterns)).toBe("/");
    expect(matchPagePattern("/nowhere", patterns)).toBeNull();
  });

  it("labels a pattern in words", () => {
    expect(pageLabel("/coach/roster/:athleteId")).toBe("Coach › Roster › (one athlete)");
    expect(pageLabel("/athlete/day/:assignmentId/:programDayId/:date")).toBe("Athlete › Day › (one assignment) › (one program day) › (one date)");
    expect(pageLabel("/")).toBe("Home");
    expect(pageLabel("/admin/ai-spend")).toBe("Admin › AI spend");
    expect(pageLabel("/admin/classes/:id")).toBe("Admin › Classes › (one item)");
  });
});

describe("whether anything links to a page", () => {
  it("finds an exact link, and not a longer path that starts the same", () => {
    expect(pageIsLinked("/coach/branding", ['<Link href="/coach/branding">'])).toBe(true);
    expect(pageIsLinked("/coach/branding", ['<Link href="/coach/branding-old">'])).toBe(false);
  });

  it("finds a link built with an id, and one built after an origin", () => {
    expect(pageIsLinked("/coach/roster/:athleteId", ["navigate(`/coach/roster/${id}`)"])).toBe(true);
    expect(pageIsLinked("/claim/:code", ["const url = `${window.location.origin}/claim/${code}`"])).toBe(true);
  });

  it("counts a list page's items as linked when the list is", () => {
    const all = ["/coach/programs", "/coach/programs/:id"];
    expect(pageCatalogFromSource(all.map((p) => `<Route path="${p}">`).join("\n"), ['href="/coach/programs"'])).toEqual([
      { path: "/coach/programs", linked: true },
      { path: "/coach/programs/:id", linked: true },
    ]);
    expect(pageCatalogFromSource(all.map((p) => `<Route path="${p}">`).join("\n"), [])[1].linked).toBe(false);
  });
});

describe("the likeliest reason a number reads the way it does", () => {
  it("a new feature is too new to judge", () => expect(why({ firstSeen: YESTERDAY })).toContain("too new"));
  it("a zero with nothing linking to it says so", () => expect(why({ linked: false })).toContain("Nothing in the app links here"));
  it("a zero whose people were not here says so", () => expect(why({ audienceActive: 0 })).toContain("Nobody it's for"));
  it("a linked zero whose people were here is hard to find or not wanted", () => expect(why({})).toContain("hard to find"));
  it("mostly refused means people want it and can't use it", () => expect(why({ kind: "action", uses: TRIES, refused: REFUSED_MOST })).toContain("can't use it"));
  it("opened but never saved from is named", () => expect(why({ uses: OPENED, doneOn: 0 })).toContain("nothing was saved"));
  it("a busy page says where people come from", () => expect(why({ uses: BUSY, doneOn: SAVED, isBusiest: true, topCameFrom: "Coach" })).toBe("Most people arrive from Coach."));
});

describe("the report", () => {
  const row = (feature: string, uses: number, people: number): UsageRow => ({ kind: "page", feature, platform: "Website", uses, refused: 0, failed: 0, people });
  const base = {
    days: WEEK,
    today: TODAY,
    countingSince: LONG_AGO,
    pages: [
      { path: "/coach", linked: true },
      { path: "/coach/branding", linked: true },
      { path: "/admin/old", linked: false },
    ],
    actions: ["GET /api/coach/roster"],
    before: [],
    paths: [],
    firstSeen: new Map<string, string>(),
  };

  it("lists everything in the app, the zeros included, busiest first", () => {
    const r = featureUsageReport({ ...base, groups: ["Coaches", "Free Agents"], now: [row("/coach", COACH_USES, COACH_PEOPLE)], activity: [{ userGroup: "Coaches", personDays: COACH_PEOPLE }] });
    const pages = r.entries.filter((e) => e.kind === "page");
    expect(pages.map((e) => [e.feature, e.uses])).toEqual([["/coach", COACH_USES], ["/admin/old", 0], ["/coach/branding", 0]]);
    expect(r.entries.filter((e) => e.kind === "interaction")).toHaveLength(UI_INTERACTIONS.length);
    expect(r.pagesUsed).toBe(1);
  });

  it("looking at one kind of account, hides a number with fewer than the floor behind it, and never hides a zero", () => {
    const fewer = USAGE_FLOOR - 1;
    const r = featureUsageReport({ ...base, groups: ["Guardians"], now: [row("/coach", SOME_USES, fewer)], activity: [{ userGroup: "Guardians", personDays: fewer }] });
    const coach = r.entries.find((e) => e.feature === "/coach")!;
    expect(coach.uses).toBeNull();
    expect(coach.people).toBeNull();
    expect(r.entries.find((e) => e.feature === "/coach/branding")!.uses).toBe(0);
    expect(r.activity).toEqual([{ userGroup: "Guardians", personDays: null }]);
  });

  it("does not hide anything in the mixed view", () => {
    const r = featureUsageReport({ ...base, groups: ["Coaches", "Free Agents"], now: [row("/coach", TWO, ONE)], activity: [] });
    expect(r.entries.find((e) => e.feature === "/coach")!.uses).toBe(TWO);
  });

  it("keeps something no longer in the app, marked removed", () => {
    const r = featureUsageReport({ ...base, groups: ["Coaches"], now: [row("/coach/gone", SIX, SIX)], activity: [] });
    expect(r.entries.find((e) => e.feature === "/coach/gone")).toMatchObject({ retired: true });
  });
});

describe("the named interactions stay matched to the app", () => {
  it("the coach athlete page's tabs are exactly the tabs that page draws, with its own labels", () => {
    const page = read("client/src/pages/coach/athlete-detail.tsx");
    // `<TabsTrigger value="goals">Goals</TabsTrigger>` -> ["goals", "Goals"]; a TabsContent no.
    // https://regex101.com/?regex=%3CTabsTrigger%20value%3D%22(%5B%5E%22%5D%2B)%22%3E(%5B%5E%3C%5D%2B)%3C&testString=%3CTabsTrigger%20value%3D%22goals%22%3EGoals%3C%2FTabsTrigger%3E
    const drawn = Object.fromEntries(Array.from(page.matchAll(/<TabsTrigger value="([^"]+)">([^<]+)</g), (m) => [m[1], m[2]]));
    expect(drawn).toEqual(ATHLETE_PAGE_TABS);
  });

  it("every single named interaction is counted somewhere in the app, so none sits at zero by construction", () => {
    const client = clientFiles(join(ROOT, "client/src")).map((f) => readFileSync(f, "utf8")).join("\n");
    const singles = UI_INTERACTIONS.filter((n) => !n.startsWith("Coach athlete page:"));
    singles.forEach((name) => expect(client, name).toContain(`countInteraction("${name}")`));
    expect(client).toContain("athleteTabInteraction(tab)");
  });
});
