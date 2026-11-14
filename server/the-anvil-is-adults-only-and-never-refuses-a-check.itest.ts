import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anvilChecks, coachAthletes, consentRecords } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { resetDatabase } from "./test-support/fixtures";
import {
  loginAs,
  makeLoginableUser,
  startTestServer,
  type TestClient,
  type TestServer,
} from "./test-support/http-app";
import { ANVIL_MINIMUM_AGE_YEARS } from "@shared/anvil-eligibility";
import { ANVIL_WINDOW_CLOSES_MINUTES, ANVIL_WINDOW_OPENS_MINUTES } from "@shared/anvil-window";

/**
 * THE ANVIL'S REAL ROUTES: WHO IS LET IN, AND WHAT HAPPENS TO A CHECK NOBODY WOULD TRUST.
 *
 * The pure modules are tested without a database (shared/anvil-*.test.ts, server/anvil-report.test.ts)
 * and this drives the routes, because three of the four properties worth holding are only true end
 * to end:
 *
 *  - **A MINOR IS REFUSED, and that is the counsel block rather than a setting.** Questions 15, 17,
 *    18 and 21 are open and each one changes the design; shipping to an adult prejudges none of
 *    them. A middleware named in a list could still be registered in an order that never runs, so
 *    the status an under-18 account actually meets is what gets asserted.
 *  - **A REFUSAL IS A SENTENCE AND A 403, NEVER A 402.** The client draws "See plans" off
 *    `freeAgentPaywall`, which is the wrong thing to offer somebody who is seventeen or who turned
 *    camera tracking off. A paywall and a counsel block reading alike is the failure.
 *  - **A CHECK IS NEVER REFUSED FOR WHAT IT MEASURED (Rule #1).** Three trials instead of
 *    twenty-five, every trial missed, 2,400 ms: all written, all scored, all shown with the reason
 *    the comparison is absent. The window LABELS and never gates.
 *  - **ONE ATTEMPT COUNTS, AND THE OTHERS ARE KEPT.** The first in-window check of the day, never
 *    the best and never the latest, and the retake still comes back on the week.
 */
/**
 * ELEVEN LOGINS FOR THE WHOLE FILE, AND `resetDatabase()` RUNS ONCE. `loginLimiter` allows 15
 * attempts per IP per fifteen minutes and every client here connects from 127.0.0.1, so a login
 * inside each case spends that budget and the file starts failing with 429s that read as
 * authorization bugs -- which is exactly what the first run of this file did, on twenty-one of
 * its twenty-three cases. So every actor is made and signed in ONCE, and what the cases write --
 * the checks, and the agreement rows that open the gate -- is cleared between them instead.
 *
 * The actors are split by the gate branch each one exercises rather than shared, because the
 * whole subject of this file is which of the five refusals an account meets, and one account
 * whose role, birthday and opt-out were edited between cases would make each case an assertion
 * about the previous one's cleanup.
 */
let server: TestServer;

type Actor = { user: Awaited<ReturnType<typeof makeLoginableUser>>; client: TestClient };

/** The gate's five branches, one account each, plus the coach side. */
let adult: Actor;
/** A minor ATHLETE, held by the app's own guardian gate before the Anvil's gate runs. */
let minorAthlete: Actor;
/**
 * A minor COACH, which is the account the Anvil's own age check exists for.
 *
 * The app-wide guardian gate (routes.ts, `GUARDIAN_GATE_ALLOWED_PREFIXES`) only looks at
 * `role === "athlete"`, and `signupSchema` asks a coach for a date of birth exactly as it asks an
 * athlete while nothing refuses a minor one -- `shared/roles-that-film-their-own-training.ts` calls
 * a coach "an adult account by construction", which is a CONVENTION and not an enforcement. The
 * retention sweep made the same call on 2026-10-22 for the same reason: a minor's protection is
 * the wrong place to rest on a convention.
 */
let minorCoach: Actor;
/** A coach with no date of birth at all, which `recordBiometricRelease` deliberately allows. */
let noDobCoach: Actor;
let optedOut: Actor;
let selfTrainingCoach: Actor;
let selfTrainingAdmin: Actor;
let guardian: Actor;
/** The coach whose roster the package cases read, and the three accounts on it. */
let rosterCoach: Actor;
let rostered: Actor;
let silent: Awaited<ReturnType<typeof makeLoginableUser>>;
let outsider: Awaited<ReturnType<typeof makeLoginableUser>>;

async function actor(overrides: Record<string, unknown>): Promise<Actor> {
  const user = await makeLoginableUser(overrides as never);
  return { user, client: await loginAs(server.baseUrl, user) };
}

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  adult = await actor({ role: "athlete", dateOfBirth: bornYearsAgo(27) });
  minorAthlete = await actor({
    role: "athlete",
    dateOfBirth: bornYearsAgo(ANVIL_MINIMUM_AGE_YEARS - 1),
  });
  minorCoach = await actor({
    role: "coach",
    dateOfBirth: bornYearsAgo(ANVIL_MINIMUM_AGE_YEARS - 1),
  });
  noDobCoach = await actor({ role: "coach", dateOfBirth: null });
  optedOut = await actor({ role: "athlete", dateOfBirth: bornYearsAgo(30), trackingOptOut: true });
  selfTrainingCoach = await actor({ role: "coach", dateOfBirth: bornYearsAgo(36) });
  selfTrainingAdmin = await actor({ role: "admin", dateOfBirth: bornYearsAgo(36) });
  guardian = await actor({ role: "guardian", dateOfBirth: bornYearsAgo(44) });
  rosterCoach = await actor({ role: "coach", dateOfBirth: bornYearsAgo(40) });
  rostered = await actor({ role: "athlete", dateOfBirth: bornYearsAgo(22), name: "Rostered Athlete" });
  silent = await makeLoginableUser({ role: "athlete", name: "Quiet Athlete" });
  outsider = await makeLoginableUser({ role: "athlete", name: "Somebody Else" });
  await db.insert(coachAthletes).values([
    { coachId: rosterCoach.user.id, athleteId: rostered.user.id },
    { coachId: rosterCoach.user.id, athleteId: silent.id },
  ]);
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  // Only what the cases write. The actors and the roster links survive, which is what keeps the
  // file inside the login budget.
  await db.delete(anvilChecks);
  await db.delete(consentRecords).where(eq(consentRecords.consentType, "anvil_check"));
});

const IN_WINDOW = ANVIL_WINDOW_OPENS_MINUTES + 30;
const AFTER_WINDOW = ANVIL_WINDOW_CLOSES_MINUTES + 120;
// The real day, never a typed one: /api/anvil/week reads the last seven days from the server's
// own clock, so a date written here falls out of that window a week after it is written. That
// is what turned CI red on 2026-11-14 with nothing wrong in the product.
const TODAY = new Date().toISOString().slice(0, 10);

/** An ISO date `years` ago, which is how the fixtures make somebody a given age today. */
function bornYearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const trials = (n: number, ms = 270) => Array.from({ length: n }, (_, i) => ms + (i % 5) * 4);

/** Accepts the agreement for an already-signed-in actor -- the steady state most cases are
 *  about. One request, no login, so it costs nothing against the limiter. */
async function accept(a: Actor): Promise<Actor> {
  const accepted = await a.client.post("/api/anvil/agreement");
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  expect(accepted.body.allowed).toBe(true);
  return a;
}

describe("who is let in", () => {
  it("refuses an adult who has not accepted the agreement, with a sentence", async () => {
    const { client } = adult;

    const access = await client.get("/api/anvil/access");
    expect(access.status).toBe(200);
    expect(access.body.allowed).toBe(false);
    expect(access.body.reason).toBe("needs_the_anvil_agreement");
    expect(access.body.says).toMatch(/accept the Anvil agreement/i);

    const check = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: IN_WINDOW,
      trialsMs: trials(25),
      partsRun: ["reaction_time"],
    });
    // 403 AND NOT 402: this is a refusal about who is asking, and a plan does not fix it.
    expect(check.status).toBe(403);
    expect(check.body.freeAgentPaywall).toBeUndefined();
    expect(check.body.anvilRefusal).toBe("needs_the_anvil_agreement");
  });

  it("never reaches the Anvil for a minor athlete, because the app holds them first", async () => {
    // RECORDED RATHER THAN ASSUMED, because the first version of this case asserted the Anvil's
    // own sentence and got this one. The app-wide guardian gate runs on every /api path for an
    // athlete whose account is not cleared, so a minor athlete with no linked guardian is held
    // out of the whole platform before `requireAnvilAccess` is reached. That is the gate working,
    // and it is why the case below exists: a minor COACH is not covered by it at all.
    const res = await minorAthlete.client.post("/api/anvil/agreement");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("guardian_link_required");
  });

  it("refuses a minor coach even if they tick the box, and the age is checked before the consent", async () => {
    const { client } = minorCoach;

    // ACCEPTING IS WHAT IS REFUSED, not just taking the check. Asking a seventeen-year-old to
    // agree to something Forge would then refuse to honour is worse than saying no first.
    const accept = await client.post("/api/anvil/agreement");
    expect(accept.status).toBe(403);
    expect(accept.body.message).toMatch(/adults-only/i);

    const access = await client.get("/api/anvil/access");
    expect(access.body.allowed).toBe(false);
    // The reason names the counsel block rather than the missing tick, which is what ordering
    // the age check first buys: a minor is never told to go and read an agreement.
    expect(access.body.reason).toBe("minor_pending_counsel");

    const check = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: IN_WINDOW,
      trialsMs: trials(25),
    });
    expect(check.status).toBe(403);
    expect(check.body.anvilRefusal).toBe("minor_pending_counsel");
  });

  it("refuses a coach with no date of birth rather than taking adulthood on convention", async () => {
    // `recordBiometricRelease` lets a coach film with no birthday on file, and that is right for
    // a camera consent an adult gives about their own video. It is the wrong posture here: the
    // Anvil's block is about minors as a CLASS, and an account whose age nobody can state cannot
    // be shown to be outside that class. So the Anvil asks every role for a date of birth.
    const { client } = noDobCoach;
    const access = await client.get("/api/anvil/access");
    expect(access.body.allowed).toBe(false);
    expect(access.body.reason).toBe("age_unknown");
    expect(access.body.says).toMatch(/date of birth/i);
    expect((await client.post("/api/anvil/agreement")).status).toBe(403);
  });

  it("refuses somebody who turned camera tracking off, and says that is why", async () => {
    const { client } = optedOut;
    const access = await client.get("/api/anvil/access");
    expect(access.body.reason).toBe("tracking_opted_out");
    expect(access.body.says).toMatch(/camera tracking/i);
  });

  it("lets a coach and an admin take their own, because they film their own training", async () => {
    for (const a of [selfTrainingCoach, selfTrainingAdmin]) {
      const accepted = await a.client.post("/api/anvil/agreement");
      expect(accepted.status, `${a.user.role}: ${JSON.stringify(accepted.body)}`).toBe(200);
      expect(accepted.body.allowed).toBe(true);
    }
  });

  it("refuses a guardian, who does not train through Forge", async () => {
    const { client } = guardian;
    // requireRole answers first for a role that is not on the filming set at all.
    expect((await client.get("/api/anvil/access")).status).toBe(403);
  });

  it("stops honouring the agreement once it is withdrawn, and keeps the checks", async () => {
    const { client } = await accept(adult);
    const taken = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: IN_WINDOW,
      trialsMs: trials(25),
      partsRun: ["reaction_time"],
    });
    expect(taken.status).toBe(201);

    const withdrawn = await client.post("/api/anvil/agreement/withdraw");
    expect(withdrawn.body.allowed).toBe(false);
    expect(withdrawn.body.reason).toBe("needs_the_anvil_agreement");
    expect((await client.get("/api/anvil/today?date=" + TODAY)).status).toBe(403);

    // And accepting again brings it back with the check still there -- the agreement's own
    // promise that past results stay with the account.
    expect((await client.post("/api/anvil/agreement")).body.allowed).toBe(true);
    const today = await client.get(`/api/anvil/today?date=${TODAY}`);
    expect(today.body.check.id).toBe(taken.body.check.id);
  });

  it("serves the agreement's text with its version, so a card need not carry it", async () => {
    const { client } = adult;
    const res = await client.get("/api/anvil/agreement");
    expect(res.status).toBe(200);
    expect(res.body.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.text).toMatch(/not a concussion test/i);
    expect(res.body.text).toMatch(/Not calibrated/i);
  });
});

describe("a check is never refused for what it measured", () => {
  it("keeps and scores a three-trial check instead of rejecting a short one", async () => {
    const { client } = await accept(adult);
    const res = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: IN_WINDOW,
      trialsMs: [262, 1_900, 274],
      omissions: 0,
      partsRun: ["reaction_time"],
    });
    expect(res.status).toBe(201);
    expect(res.body.check.trialsMs).toHaveLength(3);
    expect(res.body.reading.numbers.medianMs).toBe(274);
    // The COMPARISON is what a thin history withholds, never the number.
    expect(res.body.reading.comparison.kind).toBe("learning");
  });

  it("keeps a check where every trial was missed", async () => {
    const { client } = await accept(adult);
    const res = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: IN_WINDOW,
      trialsMs: [],
      omissions: 25,
      partsRun: ["reaction_time"],
    });
    expect(res.status).toBe(201);
    expect(res.body.reading.numbers.medianMs).toBeNull();
    expect(res.body.reading.numbers.omissions).toBe(25);
    // Written, scored, and readable back: a take with nothing in it is the one whose record
    // matters most, which is the camera pipeline's lesson one surface over.
    const today = await client.get(`/api/anvil/today?date=${TODAY}`);
    expect(today.body.check.omissions).toBe(25);
  });

  it("labels a check taken in the afternoon and still keeps it", async () => {
    const { client } = await accept(adult);
    const res = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: AFTER_WINDOW,
      trialsMs: trials(25),
      partsRun: ["reaction_time"],
    });
    expect(res.status).toBe(201);
    expect(res.body.check.window).toBe("late");
    expect(res.body.reading.outsideTheWindow).toBe(true);
    // IT IS NOT THE DAY'S CHECK, because it never joins a normal -- but it is on the week.
    expect(res.body.countsToday).toBe(false);
    const week = await client.get("/api/anvil/week?days=7");
    expect(week.body.days).toHaveLength(1);
    expect(week.body.days[0].counts).toBe(false);
  });

  it("takes a practice run on the athlete's own word, at any hour", async () => {
    const { client } = await accept(adult);
    const res = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: IN_WINDOW,
      practice: true,
      trialsMs: trials(25),
      partsRun: ["reaction_time"],
    });
    expect(res.body.check.window).toBe("practice");
    expect(res.body.countsToday).toBe(false);
  });

  it("decides the window itself and ignores anything the client calls it", async () => {
    const { client } = await accept(adult);
    // A client that could send its own label could call four in the afternoon in-window and put
    // it in somebody's normal. The local MINUTE is the client's to report; the rule is not.
    const res = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: AFTER_WINDOW,
      window: "in_window",
      trialsMs: trials(25),
    } as Record<string, unknown>);
    expect(res.status).toBe(201);
    expect(res.body.check.window).toBe("late");
  });

  it("refuses a malformed date, which is the one thing a check cannot do without", async () => {
    const { client } = await accept(adult);
    const res = await client.post("/api/anvil/checks", {
      date: "yesterday",
      localMinutes: IN_WINDOW,
      trialsMs: trials(25),
    });
    // 400 and not 403: the shape is wrong, which is a different thing from being refused, and
    // the only reason a check is ever turned away.
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/calendar date/i);
  });
});

describe("one attempt counts and the rest are kept", () => {
  it("counts the FIRST in-window check and keeps the later one on the week", async () => {
    const { client } = await accept(adult);
    const first = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: ANVIL_WINDOW_OPENS_MINUTES + 5,
      trialsMs: trials(25, 300),
      partsRun: ["reaction_time"],
    });
    const second = await client.post("/api/anvil/checks", {
      date: TODAY,
      localMinutes: ANVIL_WINDOW_CLOSES_MINUTES - 5,
      // Much faster, which is exactly what best-of would have rewarded.
      trialsMs: trials(25, 210),
      partsRun: ["reaction_time"],
    });
    expect(first.body.countsToday).toBe(true);
    expect(second.body.countsToday).toBe(false);

    const today = await client.get(`/api/anvil/today?date=${TODAY}`);
    expect(today.body.attemptsToday).toBe(2);
    expect(today.body.countsTodayId).toBe(first.body.check.id);
    expect(today.body.check.id).toBe(first.body.check.id);

    const week = await client.get("/api/anvil/week?days=7");
    expect(week.body.days).toHaveLength(2);
    expect(week.body.days.filter((d: { counts: boolean }) => d.counts)).toHaveLength(1);
  });

  it("answers today's question about the CLIENT's day, not the server's", async () => {
    const { client } = await accept(adult);
    await client.post("/api/anvil/checks", {
      date: "2026-11-07",
      localMinutes: IN_WINDOW,
      trialsMs: trials(25),
    });
    expect((await client.get("/api/anvil/today?date=2026-11-07")).body.attemptsToday).toBe(1);
    expect((await client.get("/api/anvil/today?date=2026-11-08")).body.attemptsToday).toBe(0);
    // And a day with nothing on it is an answer rather than an error.
    const empty = await client.get("/api/anvil/today?date=2026-11-08");
    expect(empty.status).toBe(200);
    expect(empty.body.check).toBeNull();
    expect(empty.body.reading).toBeNull();
    expect(empty.body.window.opensMinutes).toBe(ANVIL_WINDOW_OPENS_MINUTES);
  });
});

describe("the coach's package", () => {
  it("carries each athlete's days and a weekly line that asserts nothing on one witness", async () => {
    const { user: athlete, client: athleteClient } = await accept(rostered);
    const today = new Date().toISOString().slice(0, 10);
    await athleteClient.post("/api/anvil/checks", {
      date: today,
      localMinutes: IN_WINDOW,
      trialsMs: trials(25),
      sequenceBest: 6,
      tapCounts: [61, 64, 62],
      partsRun: ["reaction_time", "sequence_span", "tapping"],
    });

    const week = await rosterCoach.client.get("/api/coach/anvil/week?days=7");
    expect(week.status).toBe(200);
    expect(week.body.athletes).toHaveLength(1);
    expect(week.body.athletes[0].athleteId).toBe(athlete.id);
    expect(week.body.athletes[0].week.days).toHaveLength(1);
    // THE DAILY VIEW IS A READING AND THE WEEKLY LINE IS THE ONLY CLAIM -- and it will not make
    // one on the fast channel alone, which is Rule #4 on this surface.
    expect(week.body.athletes[0].week.verdict.kind).toBe("cannot_judge");
    expect(week.body.athletes[0].week.channelsNotBuilt).toHaveLength(2);
    // The athlete's trials are NOT in the roster payload: a week of 25-trial arrays per athlete
    // is the whole table, and the coach's view is the reading rather than the raw trials.
    expect(JSON.stringify(week.body)).not.toContain("trialsMs");
  });

  it("names the athletes who took none, so a quiet week is not an empty roster", async () => {
    const week = await rosterCoach.client.get("/api/coach/anvil/week?days=7");
    expect(week.body.athletes).toHaveLength(0);
    // Both the athlete who took none and the one who never accepted are named: a short list and
    // a roster nobody has set up look identical otherwise, and the second is the actionable one.
    expect(week.body.noChecks.map((a: { athleteName: string }) => a.athleteName).sort()).toEqual([
      "Quiet Athlete",
      "Rostered Athlete",
    ]);
  });

  it("does not put the coach in their own roster table", async () => {
    const coachClient = (await accept(selfTrainingCoach)).client;
    const today = new Date().toISOString().slice(0, 10);
    await coachClient.post("/api/anvil/checks", {
      date: today,
      localMinutes: IN_WINDOW,
      trialsMs: trials(25),
    });
    const week = await coachClient.get("/api/coach/anvil/week?days=7");
    // Their own check is on their own card, not as a row in the list of people they coach.
    expect(week.body.athletes).toHaveLength(0);
    expect(week.body.noChecks).toHaveLength(0);
    // And their own week route still has it.
    expect((await coachClient.get("/api/anvil/week?days=7")).body.days).toHaveLength(1);
  });

  it("404s an athlete outside the coach's scope, with no name in the body", async () => {
    const res = await rosterCoach.client.get(`/api/coach/roster/${outsider.id}/anvil`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Somebody Else");
  });

  it("serves one rostered athlete's history to their coach", async () => {
    const { user: athlete, client: athleteClient } = await accept(rostered);
    const today = new Date().toISOString().slice(0, 10);
    await athleteClient.post("/api/anvil/checks", {
      date: today,
      localMinutes: IN_WINDOW,
      trialsMs: trials(25),
    });
    const res = await rosterCoach.client.get(`/api/coach/roster/${athlete.id}/anvil?days=28`);
    expect(res.status).toBe(200);
    expect(res.body.athleteId).toBe(athlete.id);
    expect(res.body.days).toHaveLength(1);
  });

  it("prints the week as a PDF with the roster on it", async () => {
    const { client: athleteClient } = await accept(rostered);
    const today = new Date().toISOString().slice(0, 10);
    await athleteClient.post("/api/anvil/checks", {
      date: today,
      localMinutes: IN_WINDOW,
      trialsMs: trials(25),
    });
    const res = await fetch(`${server.baseUrl}/api/coach/anvil/week.pdf?days=7`, {
      headers: {
        cookie: rosterCoach.client.cookieHeader(),
        "x-forge-device-id": rosterCoach.client.deviceId,
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="anvil-/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("refuses an athlete the coach's roster view", async () => {
    const { client } = adult;
    expect((await client.get("/api/coach/anvil/week")).status).toBe(403);
    expect((await client.get("/api/coach/anvil/week.pdf")).status).toBe(403);
  });
});
