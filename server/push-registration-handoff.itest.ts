import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { apnsDeviceTokens, pushSubscriptions } from "@shared/schema";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";

// A push registration identifies a DEVICE, not an account. The APNs token is
// per app install and a web push endpoint is per browser profile, so neither
// changes when one athlete signs out and another signs in -- a shared team
// iPad, a family laptop, a sibling's phone. The registration therefore has to
// follow the sign-in, and these tests exist because it used to not: the save
// path found the existing row and returned it untouched.

describe("push registrations follow the account signed in on the device", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("re-points an APNs token to the athlete who just signed in", async () => {
    const first = await makeAthlete();
    const second = await makeAthlete();
    const token = "apns-token-on-the-shared-ipad";

    await storage.saveApnsToken(first.id, token);
    await storage.saveApnsToken(second.id, token);

    // The new user actually receives notifications...
    expect((await storage.getApnsTokensForUser(second.id)).map((t) => t.deviceToken)).toEqual([token]);
    // ...and the previous one no longer gets theirs delivered to a device
    // that is not theirs any more.
    expect(await storage.getApnsTokensForUser(first.id)).toEqual([]);

    const rows = await db.select().from(apnsDeviceTokens).where(eq(apnsDeviceTokens.deviceToken, token));
    expect(rows.length).toBe(1);
  });

  it("re-points a web push endpoint, keys included", async () => {
    const first = await makeAthlete();
    const second = await makeAthlete();
    const endpoint = "https://push.example.test/shared-browser";

    await storage.savePushSubscription(first.id, endpoint, { p256dh: "first-p256dh", auth: "first-auth" });
    await storage.savePushSubscription(second.id, endpoint, { p256dh: "second-p256dh", auth: "second-auth" });

    const forSecond = await storage.getPushSubscriptionsForUser(second.id);
    expect(forSecond.length).toBe(1);
    // Stale keys would fail encryption for every send, so the handoff has to
    // take the new subscription's keys, not just its user.
    expect(forSecond[0].p256dh).toBe("second-p256dh");
    expect(forSecond[0].auth).toBe("second-auth");
    expect(await storage.getPushSubscriptionsForUser(first.id)).toEqual([]);

    const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    expect(rows.length).toBe(1);
  });

  it("re-registering the same account on the same device is a no-op", async () => {
    const athlete = await makeAthlete();
    const first = await storage.saveApnsToken(athlete.id, "stable-token");
    const again = await storage.saveApnsToken(athlete.id, "stable-token");
    expect(again.id).toBe(first.id);
  });

  it("unsubscribing only removes the caller's own registration", async () => {
    const mine = await makeAthlete();
    const theirs = await makeAthlete();
    await storage.saveApnsToken(theirs.id, "their-token");

    // An endpoint or device token is not a secret. Before this was scoped,
    // any signed-in account could silence any other account's notifications
    // just by naming their token.
    await storage.removeApnsToken(mine.id, "their-token");
    expect((await storage.getApnsTokensForUser(theirs.id)).length).toBe(1);

    await storage.removeApnsToken(theirs.id, "their-token");
    expect(await storage.getApnsTokensForUser(theirs.id)).toEqual([]);
  });
});
