import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import type { FreeAgentTierId } from "@shared/free-agent-tiers";
import { resetDatabase, makeCoach } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** A TIER AN ADMIN ASSIGNED, OR A PURCHASE APPLE CONFIRMED, IS HONOURED WITH BILLING_LIVE OFF.
 *
 * Found 2026-10-08 while writing the launch audit's account recipe. `hasAthletePaidForAiAccess`
 * had exactly one line in its not-live branch -- the hardcoded `COMPED_FREE_AGENT_ENTITLEMENTS`
 * lookup on `freeagent@forge.app` -- so with BILLING_LIVE off, which is today's state and the
 * state every TestFlight build has shipped against, EVERY Free Agent was refused the camera, the
 * skills side and the AI chat whatever they held.
 *
 * That is correct for an account with nothing on file and wrong for one with a tier, because of
 * where `users.freeAgentTier` comes from: signup never writes it (checked), and the only writers
 * are an admin on /admin/billing and a VERIFIED purchase -- server/billing.ts' Stripe webhook and
 * applyAppleIapVerification. So:
 *
 *   - A tester who bought AI Coach + Video in the StoreKit sandbox had the purchase verified, the
 *     row written, and build 613's upgrade screen marking it as their current plan -- and still
 *     saw no record button. Builds 612 to 614 were cut to prove those purchases and proved they
 *     were RECORDED; nothing proved they were HONOURED. It is the same "numbers on screen, video
 *     gone ... a paywall that reads as a bug" failure `cameraAccessFor`'s comment exists to
 *     prevent, arriving through a different door.
 *   - The audit's "three Free Agents, one per tier, each seeing exactly its tier" row could not
 *     be run before launch day, since seeing any tier at all meant turning the money on
 *     platform-wide (BILLING_LIVE also opens every web checkout -- `chargingClosed`).
 *
 * `isBetaAccount` is deliberately NOT part of this path and this file does not add it. The coach
 * side (`getEntitlements`) short-circuits to UNLIMITED on `!ENFORCEMENT_ENABLED || isBetaAccount`;
 * the Free Agent side has always keyed on the tier instead, and the two switches point in
 * OPPOSITE directions by design -- enforcement-off comps a coach, billing-off refused a Free
 * Agent. Worth knowing before reading either as the other's bug.
 *
 * Every assertion below runs with BILLING_LIVE unset, which is what `startTestServer` gives.
 */

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDatabase();
});

/** A Free Agent -- an athlete on nobody's roster -- carrying the given tier, or none.
 *
 * `isBetaAccount: false` throughout. Beta is not consulted on this path, and setting it true
 * would prove nothing about the tier either way; stating it false keeps that explicit rather
 * than inherited from a fixture default that could change underneath this file. */
async function freeAgentHolding(tier: FreeAgentTierId | null) {
  const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
  if (tier) await storage.updateFreeAgentBilling(athlete.id, { freeAgentTier: tier });
  return { athlete, client: await loginAs(server.baseUrl, athlete) };
}

async function gatesFor(client: Awaited<ReturnType<typeof loginAs>>) {
  const [camera, skills, entitlements] = await Promise.all([
    client.get("/api/athlete/camera-access"),
    client.get("/api/athlete/skills-access"),
    client.get("/api/athlete/entitlements"),
  ]);
  expect(camera.status, JSON.stringify(camera.body)).toBe(200);
  expect(skills.status, JSON.stringify(skills.body)).toBe(200);
  expect(entitlements.status, JSON.stringify(entitlements.body)).toBe(200);
  return {
    camera: camera.body.allowed as boolean,
    cameraReason: camera.body.reason as string,
    skills: skills.body.allowed as boolean,
    entitlements: entitlements.body,
  };
}

describe("a Free Agent's assigned tier, with the money switch off", () => {
  /* The three tiers as shared/free-agent-tiers.ts defines them, so a flag flipped there fails
   * HERE rather than silently changing what this file claims to prove. */
  it.each([
    ["basic", { camera: false, skills: false }],
    ["ai_coach", { camera: false, skills: false }],
    ["ai_coach_video", { camera: true, skills: true }],
  ] as const)("%s sees exactly its own flags", async (tier, want) => {
    const { client } = await freeAgentHolding(tier);
    const got = await gatesFor(client);
    expect(got.camera, `camera on ${tier}`).toBe(want.camera);
    expect(got.skills, `skills on ${tier}`).toBe(want.skills);
  });

  /* The bug in one assertion. This is the take a sandbox purchase on build 612-614 produced:
   * the row is written, and before this fix the camera stayed shut. */
  it("HONOURS a camera tier, which is the sandbox purchase that recorded and did not grant", async () => {
    const { client } = await freeAgentHolding("ai_coach_video");
    const got = await gatesFor(client);
    expect(got.camera).toBe(true);
    // "entitled" rather than "coached_athlete" or "coach_or_admin": the grant came from the tier
    // on file and from nothing else. A reason of coached_athlete here would mean the fixture put
    // them on a roster and the whole file proves something other than what it says.
    expect(got.cameraReason).toBe("entitled");
  });

  /* The half that must NOT change, and the reason the fix is safe to ship with billing off:
   * nothing is granted to an account that has neither an admin assignment nor a purchase, and
   * `freeAgentTier` is null for every such account because signup never writes it. */
  it("grants nothing to a Free Agent with no tier on file", async () => {
    const { client } = await freeAgentHolding(null);
    const got = await gatesFor(client);
    expect(got.camera).toBe(false);
    expect(got.cameraReason).toBe("tier_excludes_camera");
    expect(got.skills).toBe(false);
  });

  /* A tier is not a way around the coach rule, in either direction. A coached athlete's video is
   * bounded by their team's retention cap rather than by a tier (see cameraAccessFor), so the
   * tier question never arises for them -- including on the Basic tier, which on its own grants
   * no camera. If this ever returns tier_excludes_camera, the coach branch has been reordered
   * below the tier branch and every coached athlete on a cheap tier just lost the camera. */
  it("leaves a COACHED athlete on a no-camera tier with the camera, by the coach branch", async () => {
    const coach = await makeCoach();
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    await storage.updateFreeAgentBilling(athlete.id, { freeAgentTier: "basic" });
    await addToRoster(coach.id, athlete.id);
    const got = await gatesFor(await loginAs(server.baseUrl, athlete));
    expect(got.camera).toBe(true);
    expect(got.cameraReason).toBe("coached_athlete");
  });

  /* Downgrade has to close what upgrade opened, or the gate is a one-way ratchet and a lapsed
   * subscriber keeps the camera forever. Same route, same account, tier rewritten. */
  it("closes the camera again when the tier is changed down", async () => {
    const { athlete, client } = await freeAgentHolding("ai_coach_video");
    expect((await gatesFor(client)).camera).toBe(true);
    await storage.updateFreeAgentBilling(athlete.id, { freeAgentTier: "basic" });
    const after = await gatesFor(client);
    expect(after.camera).toBe(false);
    expect(after.skills).toBe(false);
  });
});
