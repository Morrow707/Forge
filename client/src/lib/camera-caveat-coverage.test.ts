import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY SURFACE THAT SHOWS A CAMERA-DERIVED NUMBER SAYS IT IS NOT TRUSTWORTHY YET.
 *
 * The disclosure itself has been careful from the start -- one copy module, three lengths, a
 * considered rule about which surfaces may be dismissed. What was missing was any check that it
 * had actually been PUT everywhere, and a surface got missed: the coach leaderboard ranks a whole
 * roster by camera-timed sprint and carried no warning at all.
 *
 * That is the one it could least afford to miss. A chart is one athlete's trend, read by a coach
 * who knows that athlete. A leaderboard is a comparative claim about people -- it puts names in
 * an order, and an order invites a decision about who runs with the ones. Camera timing has not
 * been validated against a stopwatch, so the gaps between adjacent rows may be entirely
 * measurement.
 *
 * THIS SCANS RATHER THAN HOLDING A LIST, for the reason the tracker-dialog scan already
 * establishes in CLAUDE.md: a hand-written list is a list of the surfaces somebody remembered,
 * and the next one will not be on it.
 */

const PAGES_DIR = join(__dirname, "..", "pages");

/** Terms that only appear on a page because a camera-derived number is being shown.
 *
 * THE FIRST FIVE WERE THE BAR AND THE JUMP ONLY, AND THAT CERTIFIED THE WHOLE SKILLS SIDE AS
 * COVERED WITHOUT LOOKING AT IT (2026-10-30). The skills half of the camera is 216 of the 270
 * filmable things -- sprints and mechanics -- and it names none of those five fields, so a surface
 * showing camera-timed sprint speed and hip-shoulder separation could never match. The sprint and
 * mechanics fields are listed below.
 *
 * A LIST IS STILL THE WEAK PART OF THIS FILE AND IT IS WORTH SAYING SO RATHER THAN IMPLYING
 * COVERAGE. The right shape is to derive these from a declaration -- shared/schema.ts already
 * exports CAMERA_DERIVED_SET_COLUMNS for the strength side, classified column by column with a
 * test that fails on an unclassified one -- and skill_session_logs has no equivalent. Until it
 * does, a camera field added to that table is invisible here. That is the next thing to build,
 * not something this file currently guards.
 */
const CAMERA_METRIC_TERMS = [
  // bar and jump
  "peakVelocityMps",
  "meanVelocityMps",
  "jumpHeightCm",
  "barPathDeviation",
  "camera-timed",
  // sprint and mechanics -- the skills side
  "peakWristSpeedMps",
  "hipShoulderSeparationDeg",
  "armSlotDeg",
  "elbowExtensionDeg",
  "kneeBendDepthDeg",
  "hipRotationDeg",
  "weightTransfer",
];

/** Pages that mention a camera metric for a reason other than displaying one to a reader.
 *
 * Each entry needs a reason, and the reason has to be "no reader sees a number here" -- never
 * "this one is fine" or "too small to matter". A page that shows a number and argues its way onto
 * this list is the exact failure the file exists to prevent.
 */
const NOT_A_READING_SURFACE: Record<string, string> = {
  "workout.tsx":
    "shows numbers AND carries the caveat -- listed only because the check below finds it anyway",
  "pricing.tsx": "a price list describing what the tier buys; carries the permanent caveat",
  "landing.tsx": "marketing copy naming the feature, no athlete's numbers on it",
  "delete-account.tsx": "explains what deletion keeps; no numbers rendered",
  "signup.tsx": "consent copy about what gets collected; no numbers rendered",
  "av-preview-test.tsx":
    "a developer harness under pages/dev for driving the native preview by hand -- it has no route " +
    "in App.tsx and no reader but whoever is debugging the capture pipeline",
  "movement-knowledge.tsx":
    "an admin editing movement-profile THRESHOLDS (max allowed bar-path deviation). The number " +
    "on screen is a limit somebody is setting, not a measurement of an athlete -- a caveat " +
    "saying 'this reading is inaccurate' would be describing the wrong thing entirely.",
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );
}

const pagesShowingCameraMetrics = walk(PAGES_DIR).filter((file) => {
  const src = readFileSync(file, "utf8");
  return CAMERA_METRIC_TERMS.some((term) => src.includes(term));
});

describe("the camera-accuracy caveat reaches every surface that shows a camera number", () => {
  it("finds some surfaces at all, so a broken scan cannot pass silently", () => {
    // The scan is only worth anything if it is still matching. A refactor that renames every
    // metric field would otherwise turn this whole file into a green no-op.
    expect(pagesShowingCameraMetrics.length).toBeGreaterThan(1);
  });

  it.each(pagesShowingCameraMetrics.map((f) => [f.split("/pages/")[1], f]))(
    "%s carries the caveat",
    (label, file) => {
      const base = (label as string).split("/").pop()!;
      if (base in NOT_A_READING_SURFACE) return;
      expect(readFileSync(file as string, "utf8")).toContain("CameraMetricCaveat");
    },
  );

  it("warns the coach leaderboard permanently, not dismissibly", () => {
    // The dismissal flag is SHARED across every dismissible instance, so a coach who cleared it
    // once on their own workout screen weeks ago would never see it here -- on the surface that
    // needed it most. A dismissible caveat on this page would have been a no-op for exactly the
    // coaches who use the app the most.
    const src = readFileSync(join(PAGES_DIR, "coach", "leaderboard.tsx"), "utf8");
    expect(src).toContain("<CameraMetricCaveat");
    expect(src).not.toMatch(/<CameraMetricCaveat[^>]*dismissible/);
  });
});


/**
 * A TAB IS ITS OWN SURFACE, AND A CAVEAT IN THE TAB NEXT DOOR IS NOT ON SCREEN.
 *
 * Found 2026-10-30 while answering "what do the coach's reports look like". /coach/analytics has a
 * CameraMetricCaveat and it sits INSIDE `<TabsContent value="performance">`, so the Skills tab --
 * where every number is a camera-timed sprint split or a mechanics angle -- carried no warning at
 * all, and neither did Team Trends, where three of the metrics can be written by
 * recordCameraTimedCombineResult with no provenance column to say which.
 *
 * THE SCAN ABOVE COULD NOT SEE IT TWICE OVER: it walks client/src/pages, and the numbers are
 * rendered by SkillsTrendsPanel in client/src/components; and its term list was bar-and-jump only.
 * Widening the WALK to components is the obvious third fix and is deliberately NOT done here,
 * because it would red the fifteen tracker dialogs at once and that is a real decision with a real
 * argument on both sides: the page hosting a tracker dialog carries the caveat, but a modal covers
 * the page it opens over, so a coach reading a number in a freshly-closed capture dialog may never
 * have had it on screen. Fifteen files and a camera-surface judgement is Scott's call, not a
 * side-effect of this file. Named here so it is not mistaken for covered.
 *
 * What IS enforced is the rule that catches this class on the page where it happened: every tab
 * that renders a camera number, directly or through a component this page imports, carries its own
 * caveat. Tabs are bounded by matching their own closing tag, never a character window.
 */
const ANALYTICS_PAGE = join(PAGES_DIR, "coach", "analytics.tsx");

/** Every `<TabsContent value="x">...</TabsContent>` span, by tag matching. */
function tabSpans(src: string): Array<{ value: string; body: string }> {
  const out: Array<{ value: string; body: string }> = [];
  const open = /<TabsContent value="([^"]+)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(src))) {
    const from = m.index + m[0].length;
    let depth = 1;
    let i = from;
    while (i < src.length && depth > 0) {
      const nextOpen = src.indexOf("<TabsContent", i);
      const nextClose = src.indexOf("</TabsContent>", i);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth++;
        i = nextOpen + 12;
      } else {
        depth--;
        if (depth === 0) {
          out.push({ value: m[1], body: src.slice(from, nextClose) });
          break;
        }
        i = nextClose + 14;
      }
    }
  }
  return out;
}

/** The local files this page imports, by the identifier it imports them as. */
function importedFiles(src: string, pageDir: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
    const spec = m[2];
    if (!spec.startsWith("@/") && !spec.startsWith(".")) continue;
    const rel = spec.startsWith("@/")
      ? join(__dirname, "..", spec.slice(2))
      : join(pageDir, spec);
    for (const name of m[1].split(",")) {
      const id = name.trim().split(/\s+as\s+/).pop()!.trim();
      if (id) map[id] = `${rel}.tsx`;
    }
  }
  return map;
}

/** Comments off before deciding whether a tab SHOWS a camera number. Caught on the first run of
 *  this scan: the Team Trends tab came back "in scope" because the comment this commit added to it
 *  contains the words "camera-timed", which is one of the terms being looked for. Prose satisfying
 *  a scan is the half CLAUDE.md calls worse, because nothing announces it -- the rule looked like
 *  it was working and was reading its own explanation. */
function stripComments(s: string): string {
  return s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "");
}

describe("on /coach/analytics, a tab that shows a camera number carries its own caveat", () => {
  const raw = readFileSync(ANALYTICS_PAGE, "utf8");
  const src = stripComments(raw);
  const tabs = tabSpans(src);
  const imports = importedFiles(raw, join(PAGES_DIR, "coach"));

  const namesCameraMetric = (text: string) =>
    CAMERA_METRIC_TERMS.some((t) => text.includes(t));

  /** The tab's markup plus the source of every component it reaches, following BOTH the page's
   *  imports and the components declared in this same file.
   *
   *  THE LOCAL HOP IS THE ONE THAT MATTERS AND THE FIRST DRAFT MISSED IT. The chain to the actual
   *  camera numbers is TabsContent -> SkillsTab (declared in analytics.tsx) -> SkillsTrendsPanel
   *  (imported from components/), so a scan that followed imports alone found nothing in the tab
   *  that had the bug and reported it as out of scope -- a green pass on exactly the defect. */
  const subtree = (body: string) => {
    const seen = new Set<string>();
    let text = body;
    const queue = [...new Set([...body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]))];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      let add = "";
      const file = imports[id];
      if (file) {
        try {
          add = stripComments(readFileSync(file, "utf8"));
        } catch {
          /* not a file on disk -- fall through to the local lookup */
        }
      }
      if (!add) {
        // Declared in this same file: its own function body.
        //
        // PAREN-MATCH THE SIGNATURE FIRST. "The next `{` after the name" lands on the DESTRUCTURING
        // PATTERN of `function SkillsTab({ roster, rosterFailed, athleteId, ... })`, and what comes
        // back is a parameter list: no component names in it, so the chain to SkillsTrendsPanel
        // broke and the tab with the bug reported itself out of scope -- a green pass on exactly
        // the defect. Third time in one session, and CLAUDE.md already records it twice.
        const decl = new RegExp(`function ${id}\\(`).exec(src);
        if (decl) {
          let depth = 0;
          let afterParams = -1;
          const paren = src.indexOf("(", decl.index);
          for (let i = paren; i < src.length; i++) {
            if (src[i] === "(") depth++;
            else if (src[i] === ")") {
              depth--;
              if (depth === 0) {
                afterParams = i + 1;
                break;
              }
            }
          }
          const open = afterParams < 0 ? -1 : src.indexOf("{", afterParams);
          if (open >= 0) {
            depth = 0;
            for (let i = open; i < src.length; i++) {
              if (src[i] === "{") depth++;
              else if (src[i] === "}") {
                depth--;
                if (depth === 0) {
                  add = src.slice(open, i + 1);
                  break;
                }
              }
            }
          }
        }
      }
      if (!add) continue;
      text += add;
      for (const m of add.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
        if (!seen.has(m[1])) queue.push(m[1]);
      }
    }
    return text;
  };

  it("finds the tabs at all, so a renamed component cannot empty this scan", () => {
    expect(tabs.map((t) => t.value).sort()).toEqual([
      "classes",
      "performance",
      "skills",
      "trends",
      "videos",
    ]);
    expect(Object.keys(imports).length).toBeGreaterThan(5);
  });

  it.each(tabs.map((t) => [t.value, t] as const))("the %s tab", (_value, tab) => {
    if (!namesCameraMetric(subtree(tab.body))) return;
    expect(tab.body).toContain("CameraMetricCaveat");
  });

  it("at least two tabs are actually in scope, or the rule is checking nothing", () => {
    const inScope = tabs.filter((t) => namesCameraMetric(subtree(t.body))).map((t) => t.value);
    expect(inScope).toContain("skills");
    expect(inScope.length).toBeGreaterThanOrEqual(2);
  });
});
