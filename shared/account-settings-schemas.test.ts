import { describe, it, expect } from "vitest";
import { backfillDateOfBirthSchema, updateNotificationPrefsSchema } from "./schema";

// Both of these were found by driving the real routes: the account surface
// accepted a date of birth in the future on a field it then refuses to
// overwrite, and rejected the exact payload the notification dialog sends.
describe("backfillDateOfBirthSchema", () => {
  it("takes a real date", () => {
    expect(backfillDateOfBirthSchema.safeParse({ dateOfBirth: "2005-06-06" }).success).toBe(true);
  });

  it("refuses a date in the future, like both signup paths do", () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(backfillDateOfBirthSchema.safeParse({ dateOfBirth: future }).success).toBe(false);
  });

  it("still refuses a non-date", () => {
    expect(backfillDateOfBirthSchema.safeParse({ dateOfBirth: "06/06/2005" }).success).toBe(false);
  });
});

describe("updateNotificationPrefsSchema", () => {
  it("accepts the one-field payload the notifications dialog sends", () => {
    expect(updateNotificationPrefsSchema.safeParse({ notifyEmail: false }).success).toBe(true);
  });

  it("still accepts a full payload", () => {
    const parsed = updateNotificationPrefsSchema.safeParse({
      notifyEmail: true,
      notifySms: false,
      phone: "555-0199",
    });
    expect(parsed.success).toBe(true);
  });

  it("still rejects a wrong type", () => {
    expect(updateNotificationPrefsSchema.safeParse({ notifyEmail: "yes" }).success).toBe(false);
  });

  it("rejects an empty payload rather than writing nothing", () => {
    expect(updateNotificationPrefsSchema.safeParse({}).success).toBe(false);
  });
});
