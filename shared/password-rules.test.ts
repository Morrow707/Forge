import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  passwordProblems,
  passwordIsAcceptable,
} from "./password-rules";
import {
  signupSchema,
  resetPasswordSchema,
  changePasswordSchema,
  loginSchema,
} from "./schema";

/**
 * A PASSWORD RULE IS ONLY WORTH HAVING IF EVERY DOOR USES IT.
 *
 * Six schemas set a password and each used to carry its own `z.string().min(6)`. The failure
 * that shape invites is not a loud one: five get tightened, the sixth is missed, and accounts
 * created through it are weaker than the product says they are, silently, until somebody
 * audits. So the interesting assertions here are about COVERAGE and about the one door the
 * rule must never reach.
 */
describe("what makes a password acceptable", () => {
  it("wants length, a number and a special character", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(["length", "number", "special"]);
    expect(PASSWORD_MIN_LENGTH).toBe(6);
  });

  it("accepts a password that satisfies all three", () => {
    expect(passwordIsAcceptable("forge!7")).toBe(true);
    expect(passwordProblems("forge!7")).toEqual([]);
  });

  it("names EVERY missing rule at once, not just the first", () => {
    // Reporting one problem at a time turns a password field into a guessing game: fix the
    // length, get refused for the digit, fix the digit, get refused for the symbol.
    expect(passwordProblems("abc").map((r) => r.id)).toEqual(["length", "number", "special"]);
    expect(passwordProblems("abcdefgh").map((r) => r.id)).toEqual(["number", "special"]);
    expect(passwordProblems("abcdefg1").map((r) => r.id)).toEqual(["special"]);
  });

  it("counts any non-alphanumeric as special, not a hand-picked set", () => {
    // A curated "!@#$%^&*" list rejects good passwords for using a character its author did
    // not think of, and the person is given no way to tell which one offended.
    for (const ch of ["!", "?", "-", "_", ".", "£", "€", " ", "~", "#"]) {
      expect(passwordIsAcceptable(`forge1${ch}`)).toBe(true);
    }
  });

  it("does not accept a long password of letters alone", () => {
    expect(passwordIsAcceptable("correcthorsebatterystaple")).toBe(false);
  });
});

describe("every schema that SETS a password enforces it", () => {
  const weak = "sixsix";
  const strong = "forge!7";

  it("refuses the old six-letter password at signup", () => {
    const base = {
      name: "Marcus Delacroix",
      email: "marcus@example.com",
      dateOfBirth: "1985-03-12",
      role: "coach" as const,
      expectedAthletes: 34,
      agreedToTerms: true,
    };
    expect(signupSchema.safeParse({ ...base, password: weak }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: strong }).success).toBe(true);
  });

  it("refuses it on a reset and on a change", () => {
    expect(resetPasswordSchema.safeParse({ token: "t".repeat(32), password: weak }).success).toBe(
      false,
    );
    expect(
      changePasswordSchema.safeParse({ currentPassword: "anything", newPassword: weak }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "anything", newPassword: strong }).success,
    ).toBe(true);
  });

  it("reports every unmet rule through zod, not only the first", () => {
    const result = signupSchema.safeParse({
      name: "A",
      email: "a@example.com",
      dateOfBirth: "1990-01-01",
      role: "athlete" as const,
      password: "abc",
      agreedToTerms: true,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues
      .filter((i) => i.path[0] === "password")
      .map((i) => i.message);
    expect(messages).toHaveLength(PASSWORD_RULES.length);
  });

  it("leaves no set-password schema on a hand-written rule", () => {
    // The scan is the point. A seventh password-setting schema added later with its own
    // min(6) is exactly the regression this file exists to catch, and no list of schema
    // names would have had it on it.
    const schema = readFileSync(join(__dirname, "schema.ts"), "utf8");
    expect(schema).not.toMatch(/password:\s*z\.string\(\)\.min\(6/);
    expect(schema).not.toMatch(/newPassword:\s*z\.string\(\)\.min\(6/);
  });
});

describe("signing in is NOT held to the rule", () => {
  it("accepts an existing weak password at login", () => {
    // Every account created before this rule has a password that fails it. Enforcing it at
    // sign-in would lock out the entire platform in one deploy, and for nothing: the password
    // is already set and the person typing it is the owner. The rule belongs where a password
    // is chosen, never where one is checked.
    expect(loginSchema.safeParse({ email: "a@example.com", password: "sixsix" }).success).toBe(
      true,
    );
    expect(loginSchema.safeParse({ email: "a@example.com", password: "a" }).success).toBe(true);
  });

  it("still refuses an empty one", () => {
    expect(loginSchema.safeParse({ email: "a@example.com", password: "" }).success).toBe(false);
  });
});
