import { describe, expect, it } from "vitest";
import { redactForLog } from "./log-redaction";

// This used to walk the top-level keys of a plain object and hand back
// anything else untouched, so two of the three shapes a response takes --
// an array, and a secret one level down -- went to the log in full.

describe("redactForLog", () => {
  it("redacts a secret at the top level", () => {
    expect(redactForLog({ id: 1, nativeToken: "abc" })).toEqual({
      id: 1,
      nativeToken: "[redacted]",
    });
  });

  it("redacts a secret nested inside an object", () => {
    expect(redactForLog({ user: { id: 1, nativeToken: "abc" } })).toEqual({
      user: { id: 1, nativeToken: "[redacted]" },
    });
  });

  it("redacts secrets inside an array response", () => {
    expect(redactForLog([{ id: 1, token: "abc" }, { id: 2, token: "def" }])).toEqual([
      { id: 1, token: "[redacted]" },
      { id: 2, token: "[redacted]" },
    ]);
  });

  it("redacts a secret inside an array nested in an object", () => {
    expect(redactForLog({ sessions: [{ mfaToken: "abc" }] })).toEqual({
      sessions: [{ mfaToken: "[redacted]" }],
    });
  });

  it("covers every key it claims to", () => {
    const body = {
      secret: "a",
      otpauthUri: "b",
      mfaToken: "c",
      nativeToken: "d",
      token: "e",
      passwordHash: "f",
      backupCodes: ["g"],
    };
    for (const value of Object.values(redactForLog(body) as Record<string, unknown>)) {
      expect(value).toBe("[redacted]");
    }
  });

  it("leaves ordinary values alone", () => {
    // Deliberately no `name` here any more -- it is redacted now, and using
    // it as the example of an ordinary value is what this test used to do.
    const body = { id: 1, sport: "Football", nested: { count: 2 }, list: [1, 2] };
    expect(redactForLog(body)).toEqual(body);
  });

  it("redacts the fields that identify a person, not just the ones that are secret", () => {
    // About three in five accounts on this platform belong to a minor, and a
    // request log is a plain-text file that gets copied around. A name is not
    // a secret, which is exactly why a list that only asked "is this a
    // secret" let every one of these through.
    const body = {
      id: 42,
      name: "Priya Raghunathan",
      email: "priya@example.test",
      phone: "+1-555-0100",
      dateOfBirth: "2012-04-19",
      sport: "Football",
    };
    const redacted = redactForLog(body) as Record<string, unknown>;

    expect(redacted.name).toBe("[redacted]");
    expect(redacted.email).toBe("[redacted]");
    expect(redacted.phone).toBe("[redacted]");
    expect(redacted.dateOfBirth).toBe("[redacted]");
    // Non-identifying context survives, or the log stops being useful.
    expect(redacted.id).toBe(42);
    expect(redacted.sport).toBe("Football");
    expect(JSON.stringify(redacted)).not.toContain("Raghunathan");
    expect(JSON.stringify(redacted)).not.toContain("2012-04-19");
  });

  it("catches the same facts under the other names this codebase gives them", () => {
    // athleteName, guardianName, userName and inviteEmail are all somebody's
    // name or address wearing a different key.
    const body = {
      athleteName: "Priya Raghunathan",
      guardianName: "Marisol Raghunathan",
      userName: "Dana Whitfield",
      coachName: "Dana Whitfield",
      inviteEmail: "parent@example.test",
    };
    for (const value of Object.values(redactForLog(body) as Record<string, unknown>)) {
      expect(value).toBe("[redacted]");
    }
  });

  it("redacts identity nested inside a list response", () => {
    // The shape a roster or an admin list actually takes.
    const body = { users: [{ id: 1, name: "Priya Raghunathan", sport: "Football" }] };
    const redacted = JSON.stringify(redactForLog(body));

    expect(redacted).not.toContain("Raghunathan");
    expect(redacted).toContain("Football");
  });

  it("redacts the two credentials that address a person's data on their own", () => {
    // A calendar token is an unauthenticated feed URL and a staff invite code
    // joins the holder to a coach's whole organisation. Neither is a password,
    // so neither read as a secret until you ask what holding one gets you.
    const body = { calendarToken: "abc123", staffInviteCode: "JOIN-4821" };
    for (const value of Object.values(redactForLog(body) as Record<string, unknown>)) {
      expect(value).toBe("[redacted]");
    }
  });

  it("passes primitives and null through", () => {
    expect(redactForLog(null)).toBeNull();
    expect(redactForLog("plain")).toBe("plain");
    expect(redactForLog(7)).toBe(7);
  });

  it("terminates on a cyclic body instead of overflowing the stack", () => {
    const cyclic: any = { token: "abc" };
    cyclic.self = cyclic;
    expect(() => redactForLog(cyclic)).not.toThrow();
  });
});
