import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");

const storage = read("server/storage.ts");
const routes = read("server/routes.ts");
const dialog = read("client/src/components/muscle-history-dialog.tsx");
const card = read("client/src/components/strength-profile-card.tsx");
const picker = read("client/src/components/muscle-filter-map.tsx");
const bank = read("client/src/pages/exercise-bank.tsx");

/**
 * The muscle-group history has to be drawn from the SAME population as the percentile it sits
 * under. If it ever widened to coach-created exercises, tapping a muscle could show a lift
 * heavier than the one the score was computed from, and the score would read as broken rather
 * than as scoped. Scott, 2026-09-21: "only forge specific exercises, not coach created
 * exercises."
 */
describe("muscle-group history", () => {
  const query = storage.slice(
    storage.indexOf("async getMuscleGroupHistoryForAthlete("),
    storage.indexOf("WHERE THIS ATHLETE SITS AMONG PEERS"),
  );

  it("exists", () => {
    expect(query.length).toBeGreaterThan(200);
  });

  it("enforces Forge-official exercises in the SQL, not at a call site", () => {
    expect(query).toContain("e.is_forge_official = true");
  });

  it("reads hand-logged weight and reps only -- never a camera-derived column", () => {
    expect(query).toContain("wse.weight_lbs IS NOT NULL");
    expect(query).toContain("wse.reps_count IS NOT NULL");
    for (const cameraColumn of ["peak_velocity", "bar_path", "jump_height", "tracking_diagnostics"]) {
      expect(query).not.toContain(cameraColumn);
    }
  });

  it("scopes to the athlete whose history was asked for", () => {
    expect(query).toContain("wl.athlete_id = ${athleteId}");
  });

  it("is reachable by the athlete and, roster-scoped, by their coach", () => {
    expect(routes).toContain('app.get("/api/athlete/muscle-history"');
    expect(routes).toContain('app.get("/api/coach/roster/:athleteId/muscle-history"');
    const coachRoute = routes.slice(
      routes.indexOf('app.get("/api/coach/roster/:athleteId/muscle-history"'),
    );
    // Same resolver every other per-athlete coach route uses, so per-team narrowing applies.
    expect(coachRoute.slice(0, 700)).toContain("getRosterAthleteForCoach");
  });

  it("says the Forge-only rule on screen, so an absent lift reads as a rule", () => {
    expect(dialog).toMatch(/Forge exercises only/i);
    expect(dialog).toMatch(/coach created|coach created|created/i);
  });
});

/**
 * The map is the control, not a picture. It is clickable in two places and they are different
 * jobs: in the picker a tap FILTERS exercises, in the profile a tap opens what was lifted.
 */
describe("the body map is clickable everywhere it is drawn as a control", () => {
  it("opens the history from the profile card's expanded map", () => {
    const expanded = card.slice(card.indexOf('<BodyMap\n                      view={view}'));
    expect(expanded).toContain("onSelect={setHistoryGroup}");
    expect(card).toContain("MuscleHistoryDialog");
  });

  it("reaches groups the figure does not draw, through the scored list", () => {
    // Several scorable groups have no drawn region. A map-only entry point would make their
    // history unreachable, which is worse than not offering it at all.
    expect(card).toContain("onClick={() => setHistoryGroup(g.group)}");
  });

  it("still filters exercises from the picker's map", () => {
    expect(picker).toContain("onSelect={onToggle}");
  });

  it("derives the history URL from the profile URL rather than a second prop", () => {
    expect(card).toContain('fetchUrl.replace(/strength-profile$/, "muscle-history")');
  });
});


/**
 * THE UNIT IS THE READER'S. Scott, 2026-09-21: "if they want to see kg let them see kilos, even
 * if the other athletes put it in lbs." The stored comparison column is always pounds, so this
 * is a display concern -- and the one number that must never be touched is a set already in the
 * unit being asked for, because that is the figure the athlete typed.
 */
describe("weight is shown in the reader's unit", () => {
  it("carries the as-logged weight and its unit beside the normalised one", () => {
    const query = storage.slice(
      storage.indexOf("async getMuscleGroupHistoryForAthlete("),
      storage.indexOf("WHERE THIS ATHLETE SITS AMONG PEERS"),
    );
    expect(query).toContain("wse.weight AS logged_weight");
    expect(query).toContain("wse.weight_unit_at_log AS logged_unit");
  });

  it("does not convert a set already in the unit asked for", () => {
    expect(dialog).toContain("r.loggedUnit === unit");
    expect(dialog).toContain("? r.loggedWeight");
  });

  it("defaults to the reader's own preference rather than pounds", () => {
    expect(dialog).toContain('user?.preferredWeightUnit ?? "lbs"');
  });
});

describe("the date window", () => {
  it("is an inclusive floor the server applies, not a client-side slice", () => {
    const query = storage.slice(
      storage.indexOf("async getMuscleGroupHistoryForAthlete("),
      storage.indexOf("WHERE THIS ATHLETE SITS AMONG PEERS"),
    );
    expect(query).toContain("AND wl.date >= ${opts.sinceDate}");
    expect(routes).toContain("sinceDate: parsed.data.since");
  });

  it("offers a way back to everything, so a window can never look like an empty history", () => {
    expect(dialog).toContain('"All time"');
    expect(dialog).toContain("Try All time");
  });
});

describe("an empty history offers somewhere to go", () => {
  it("links into the library filtered to this muscle", () => {
    expect(dialog).toContain("Find Forge exercises for this");
    expect(dialog).toContain("?muscle=");
  });

  it("opens the library the READER can open, not always the athlete's", () => {
    expect(dialog).toContain('fetchUrl.startsWith("/api/coach")');
  });

  it("seeds the library filter in the initialiser, never in an effect", () => {
    // An effect would also fire on a later render and stamp the URL's group back over a
    // filter the reader has since changed.
    expect(bank).toContain('new URLSearchParams(window.location.search).get("muscle")');
    expect(bank).not.toMatch(/useEffect\([^)]*muscle/);
  });
});
