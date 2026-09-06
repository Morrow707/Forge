import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";

// An invite row exists whether or not the email left the building, and the
// athlete is locked out either way. These pin the difference being
// recorded, and reaching the admin queue that has to act on it.

function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

async function inviteFor(athleteId: number, email = "parent@example.test") {
  const invite = await storage.createGuardianInvite(athleteId, email);
  if (!("inviteId" in invite)) throw new Error("invite was not created");
  return invite;
}

async function blockedRowFor(athleteId: number) {
  const rows = await storage.getAthletesBlockedPendingGuardian();
  const row = rows.find((r) => r.id === athleteId);
  if (!row) throw new Error("athlete missing from the blocked queue");
  return row;
}

describe("guardian invite delivery is recorded", () => {
  beforeEach(resetDatabase);

  it("reads as unknown before anything is recorded", () => {
    // A row written before delivery resolves, or before this was tracked at
    // all, must not read as failed -- that would send an admin chasing a
    // problem that may not exist.
    return (async () => {
      const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(14) });
      await inviteFor(athlete.id);
      const row = await blockedRowFor(athlete.id);
      expect(row.inviteDelivered).toBeNull();
      expect(row.inviteError).toBeNull();
    })();
  });

  it("records a successful send", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(14) });
    const invite = await inviteFor(athlete.id);
    await storage.recordGuardianInviteDelivery(invite.inviteId, { sent: true });
    const row = await blockedRowFor(athlete.id);
    expect(row.inviteDelivered).toBe(true);
    expect(row.inviteError).toBeNull();
  });

  it("records a refusal with the provider's reason", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(14) });
    const invite = await inviteFor(athlete.id);
    await storage.recordGuardianInviteDelivery(invite.inviteId, {
      sent: false,
      error: "not_configured",
    });
    const row = await blockedRowFor(athlete.id);
    expect(row.inviteDelivered).toBe(false);
    expect(row.inviteError).toBe("not_configured");
  });

  it("clears a stale failure when a later send succeeds", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(14) });
    const invite = await inviteFor(athlete.id);
    await storage.recordGuardianInviteDelivery(invite.inviteId, { sent: false, error: "boom" });
    await storage.recordGuardianInviteDelivery(invite.inviteId, { sent: true });
    const row = await blockedRowFor(athlete.id);
    expect(row.inviteDelivered).toBe(true);
    expect(row.inviteError).toBeNull();
  });

  it("bounds a long provider error rather than storing it whole", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(14) });
    const invite = await inviteFor(athlete.id);
    await storage.recordGuardianInviteDelivery(invite.inviteId, {
      sent: false,
      error: "x".repeat(1000),
    });
    const row = await blockedRowFor(athlete.id);
    expect(row.inviteError?.length).toBe(300);
  });

  it("reports the newest unclaimed invite, not an older one", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(14) });
    const first = await inviteFor(athlete.id);
    await storage.recordGuardianInviteDelivery(first.inviteId, { sent: false, error: "boom" });
    // Reissuing deletes the unclaimed row and writes a fresh one, so the
    // old failure must not follow the athlete around after a good resend.
    const second = await inviteFor(athlete.id);
    await storage.recordGuardianInviteDelivery(second.inviteId, { sent: true });
    const row = await blockedRowFor(athlete.id);
    expect(row.inviteDelivered).toBe(true);
  });
});
