import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

/**
 * The Query Engine, attacked rather than checked.
 *
 * query-engine-anonymity.itest.ts asserts the properties the design claims:
 * no identity column, a floor under the result set, codes that do not join
 * across queries, a budget on how many queries an admin may run. Every one
 * of those held. This file asks the different question -- given all of them
 * holding, can an admin still read one named athlete's record -- and the
 * answer was yes, in two queries.
 *
 * Ask for football athletes aged 17 and 18, and get six rows. Ask for the
 * 17-year-olds, and get five. Subtract: what is in the first answer and not
 * the second is the only 18-year-old's complete record. Both queries cleared
 * the cohort floor. Neither was a small group. The budget of fifty never
 * came into it, because the attack needs two.
 *
 * Worth being precise about why the existing defences each miss it. The
 * floor judges one result at a time, and neither result is small. The
 * per-query subject-code salt stops two answers being joined BY CODE, but
 * the rows carry exact values, so a row is its own join key and subtraction
 * never needs the codes. And the budget bounds how MANY questions get asked,
 * which is the right control for an attack that needs dozens of probes and
 * no control at all for one that needs two.
 *
 * So the defence these tests cover is a floor on the DIFFERENCE between an
 * admin's result sets, not only on their size. See
 * QUERY_ENGINE_MIN_DIFFERENCE in storage.ts.
 */
describe("an admin cannot isolate an athlete by subtracting two results", () => {
  let adminId: number;

  beforeEach(async () => {
    await resetDatabase();
    adminId = (await makeCoach({ role: "admin", name: "Admin" })).id;
  });

  /** Five in the cohort, plus one target who differs only by age. */
  async function makeCohortWithOneOutlier() {
    for (let i = 0; i < 5; i++) {
      await makeAthlete({
        sport: "Football",
        age: 17,
        researchDataConsent: true,
        name: `Cohort ${i}`,
        benchMaxLbs: 200 + i,
        squatMaxLbs: 300 + i,
        heightIn: 70 + i,
      });
    }
    return makeAthlete({
      sport: "Football",
      age: 18,
      researchDataConsent: true,
      name: "The one the admin is actually looking for",
      benchMaxLbs: 405,
      squatMaxLbs: 545,
      heightIn: 77,
      bodyWeightLbs: 265,
    });
  }

  const wide = { lookbackDays: 30, sport: ["Football"], age: { min: 17, max: 18 } } as any;
  const narrow = { lookbackDays: 30, sport: ["Football"], age: { min: 17, max: 17 } } as any;

  it("refuses the second half of the pair", async () => {
    await makeCohortWithOneOutlier();

    // The first query is ordinary and is answered in full. Nothing about it
    // is suspicious on its own, which is the point -- the attack is not in
    // either query, it is in the pair.
    const first = await storage.queryAthletesAdvanced(adminId, wide);
    expect(first).toHaveLength(6);

    // The second differs from it by exactly one athlete.
    await expect(storage.queryAthletesAdvanced(adminId, narrow)).rejects.toThrow(
      /differs from one you ran recently/i,
    );
  });

  it("refuses it in either order", async () => {
    // Narrowing and widening are the same attack; an admin who runs the
    // small one first is not doing something safer.
    await makeCohortWithOneOutlier();
    expect(await storage.queryAthletesAdvanced(adminId, narrow)).toHaveLength(5);
    await expect(storage.queryAthletesAdvanced(adminId, wide)).rejects.toThrow(
      /differs from one you ran recently/i,
    );
  });

  it("names the refusal so it cannot be mistaken for the budget", async () => {
    await makeCohortWithOneOutlier();
    await storage.queryAthletesAdvanced(adminId, wide);
    const err = await storage
      .queryAthletesAdvanced(adminId, narrow)
      .then(() => null)
      .catch((e) => e);
    expect(err?.name).toBe("CohortQueryDifferencingRefused");
    expect(err.overlap.differsBy).toBe(1);
    expect(err.overlap.minimum).toBe(5);
  });

  it("leaves the target unrecoverable rather than merely harder to reach", async () => {
    // The assertion that actually matters. A status code says a request was
    // refused; this says the admin does not end up holding the row.
    const target = await makeCohortWithOneOutlier();

    const answers: any[][] = [];
    for (const filters of [wide, narrow]) {
      try {
        answers.push(await storage.queryAthletesAdvanced(adminId, filters));
      } catch {
        // A refusal contributes nothing to subtract with, which is the
        // entire mechanism.
      }
    }

    const fingerprint = (row: any) => JSON.stringify({ ...row, subjectCode: undefined });
    const seen = new Set(answers.flat().map(fingerprint));
    const recovered = [...seen].filter((f) => {
      const row = JSON.parse(f);
      return row.age === 18 && row.benchMaxLbs === target.benchMaxLbs;
    });

    // The target's row may legitimately appear inside a result set of six --
    // that is a group, and seeing a group is the tool working. What must not
    // happen is that six-minus-five leaves it standing alone.
    expect(answers).toHaveLength(1);
    expect(answers[0]).toHaveLength(6);
    expect(recovered).toHaveLength(1);
    expect(
      answers.length,
      "a second answer came back, so the admin can subtract and isolate the target",
    ).toBe(1);
  });

  it("still allows two genuinely different cohorts", async () => {
    // The check has to cost an honest analyst nothing they would notice. Two
    // questions about two different groups differ by far more than the
    // floor, so neither is refused.
    for (let i = 0; i < 6; i++) {
      await makeAthlete({ sport: "Football", age: 17, researchDataConsent: true });
    }
    for (let i = 0; i < 6; i++) {
      await makeAthlete({ sport: "Track", age: 17, researchDataConsent: true });
    }

    const football = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Football"],
    } as any);
    const track = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Track"],
    } as any);

    expect(football).toHaveLength(6);
    expect(track).toHaveLength(6);
  });

  it("allows an identical query to be run again", async () => {
    // A re-run differs by nothing, and hands back an answer the admin was
    // already given. Refusing it would only teach people that the tool is
    // flaky.
    for (let i = 0; i < 6; i++) {
      await makeAthlete({ sport: "Football", age: 17, researchDataConsent: true });
    }
    const filters = { lookbackDays: 30, sport: ["Football"] } as any;
    expect(await storage.queryAthletesAdvanced(adminId, filters)).toHaveLength(6);
    expect(await storage.queryAthletesAdvanced(adminId, filters)).toHaveLength(6);
  });

  it("is scoped per admin, since the log it reads is", async () => {
    // Two admins are two people, and one running a query must not refuse the
    // other's unrelated work. This is also an honest statement of the
    // limit: two colluding admins can still difference across each other,
    // which is a different problem from the one this solves.
    const other = (await makeCoach({ role: "admin", name: "Second Admin" })).id;
    await makeCohortWithOneOutlier();

    expect(await storage.queryAthletesAdvanced(adminId, wide)).toHaveLength(6);
    expect(await storage.queryAthletesAdvanced(other, narrow)).toHaveLength(5);
  });

  it("does not count a suppressed result against a later query", async () => {
    // A query under the floor returns nothing at all, so there is nothing to
    // subtract it against and no reason for it to block anything afterwards.
    for (let i = 0; i < 6; i++) {
      await makeAthlete({ sport: "Football", age: 17, researchDataConsent: true });
    }
    await makeAthlete({ sport: "Lacrosse", age: 17, researchDataConsent: true });

    const suppressed = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Lacrosse"],
    } as any);
    expect(suppressed).toEqual([]);

    const football = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Football"],
    } as any);
    expect(football).toHaveLength(6);
  });
});
