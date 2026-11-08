import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  beginDeviceApprovalClaim,
  deviceApprovalClaimWasSent,
  forgetDeviceApprovalClaimsForTests,
} from "./device-approval-claim";

/**
 * AN APPROVED DEVICE CLAIMS ITS SESSION ONCE.
 *
 * `POST /api/auth/device-approval/complete` spends the approval exactly once
 * (`consumeApproval` in server/auth.ts), so a second attempt is a 409 and a fiftieth is a 429
 * off `deviceApprovalLimiter`. On 2026-10-29 a phone sent about fifty of them in one second
 * after the email approved it -- one 200, then 409s, then 429s, then the error screen.
 *
 * TWO DEFECTS, EACH SUFFICIENT ON ITS OWN, AND NEITHER IS THE OSCILLATION:
 *   1. the claim was guarded by a `useState` inside DeviceApprovalStep, so the guard's lifetime
 *      was the COMPONENT's where the fact it records is the TOKEN's -- and the status query's
 *      "approved" is still cached on a remount, so each remount claimed with no network round
 *      trip in between, which is how fifty fit inside a second;
 *   2. nothing cleared `loginMutation.data` after a successful claim, and `devicePending` on both
 *      login pages is read off it -- so the step stayed drawable on an approval that had already
 *      been consumed, for the life of the page.
 *
 * WHAT IS NOT CLAIMED HERE: the parent oscillation that did the remounting. Driving the real
 * route in a real browser -- sign in, read the intercepted approval email, approve it in a second
 * tab -- claims exactly once and lands on the dashboard, and breaking the session afterwards does
 * not reproduce it either. So the guard is made structural rather than waited for, which is this
 * repo's own standing rule for a hazard whose evidence is nearly undetectable by running the flow
 * (see wait-for-email.ts). Both defects above are real, both are fixed, and the burst needs both
 * a remount AND a guard that forgets.
 *
 * THE RULE THIS FILE STATES IS WHAT IS FORBIDDEN, never a list of accepted spellings: the claim
 * may be sent from exactly one place, behind the token-keyed guard, and nothing may mark a token
 * claimed except the code that sends it.
 */

const CLIENT_SRC = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(CLIENT_SRC, ...p), "utf8");

/** Comments off before every assertion below. This fix's own comments quote
 *  `deviceApprovalCompleteMutation.mutate(`, `setClaimed(` and `loginMutation.reset()` verbatim,
 *  so an unstripped scan would be satisfied by the explanation of the bug rather than by the
 *  code -- CLAUDE.md's most repeated self-inflicted failure, in its worse direction.
 *
 *  LINE-AWARE, not the two-regex strip: a non-greedy block matcher pairs a `/*` inside a string
 *  with the next real close thousands of lines away. See skills-need-entitlement.test.ts, which
 *  measured that on routes.ts. */
function strip(s: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      out.push("");
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      out.push("");
      continue;
    }
    if (t.startsWith("//")) {
      out.push("");
      continue;
    }
    let cut = -1;
    let quote: string | null = null;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "/" && line[i + 1] === "/") {
        cut = i;
        break;
      }
    }
    out.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return out.join("\n");
}

/** A brace-delimited block, bounded by MATCHING ITS OWN BRACES -- never a character window,
 *  which CLAUDE.md forbids in so many words (a window both reds on a correct change whose
 *  comment grew and passes for a match belonging to the next function down the file). */
function blockFrom(s: string, from: number): string {
  const open = s.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return s.slice(open, i + 1);
    }
  }
  return "";
}

/** Every production client source file, DISCOVERED from the directory rather than named, so a
 *  second caller written next year is covered the day it exists. Tests excluded: this file holds
 *  every token it forbids. */
function clientSourceFiles(dir = CLIENT_SRC, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      clientSourceFiles(full, acc);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

function countAcrossClient(needle: string): { file: string; count: number }[] {
  const hits: { file: string; count: number }[] = [];
  for (const file of clientSourceFiles()) {
    const src = strip(readFileSync(file, "utf8"));
    const count = src.split(needle).length - 1;
    if (count > 0) hits.push({ file: file.slice(CLIENT_SRC.length + 1), count });
  }
  return hits;
}

/** CALL sites of a named function, which is not the same as mentions of its name: the module that
 *  declares it mentions it once in the declaration and an importer mentions it once in the import
 *  clause, and counting either as a call makes the expected number a function of where the code
 *  happens to live rather than of how many places call it. A declaration is excluded by the
 *  `function` before the name; an import clause carries no `(` and never matches. */
function callSitesAcrossClient(fn: string): { file: string; count: number }[] {
  const call = new RegExp(`(?<!function\\s)\\b${fn}\\(`, "g");
  const hits: { file: string; count: number }[] = [];
  for (const file of clientSourceFiles()) {
    const src = strip(readFileSync(file, "utf8"));
    const count = src.match(call)?.length ?? 0;
    if (count > 0) hits.push({ file: file.slice(CLIENT_SRC.length + 1), count });
  }
  return hits;
}

describe("the device-approval claim fires once per poll token", () => {
  beforeEach(() => forgetDeviceApprovalClaimsForTests());

  it("allows the first claim and refuses every one after it", () => {
    expect(beginDeviceApprovalClaim("tok-a")).toBe(true);
    expect(beginDeviceApprovalClaim("tok-a")).toBe(false);
    expect(beginDeviceApprovalClaim("tok-a")).toBe(false);
  });

  it("refuses fifty remounts of one token, which is the burst that was observed", () => {
    const allowed = Array.from({ length: 50 }, () => beginDeviceApprovalClaim("tok-burst")).filter(Boolean);
    expect(allowed).toHaveLength(1);
  });

  it("keeps tokens independent, so a resend's fresh approval can still be claimed", () => {
    expect(beginDeviceApprovalClaim("first")).toBe(true);
    expect(beginDeviceApprovalClaim("second")).toBe(true);
    expect(beginDeviceApprovalClaim("first")).toBe(false);
  });

  it("never claims an empty token", () => {
    expect(beginDeviceApprovalClaim("")).toBe(false);
    expect(deviceApprovalClaimWasSent("")).toBe(false);
  });

  it("reads without marking", () => {
    expect(deviceApprovalClaimWasSent("tok-read")).toBe(false);
    expect(deviceApprovalClaimWasSent("tok-read")).toBe(false);
    expect(beginDeviceApprovalClaim("tok-read")).toBe(true);
    expect(deviceApprovalClaimWasSent("tok-read")).toBe(true);
  });

  it("holds the guard OUTSIDE any component, because a remount is the thing it survives", () => {
    const mod = strip(read("lib", "device-approval-claim.ts"));
    // Module scope, not a hook: a ref or a useState dies with the mount, which is the lifetime
    // that was wrong. State the forbidden forms rather than the accepted one.
    expect(mod).not.toMatch(/useState/);
    expect(mod).not.toMatch(/useRef/);
    expect(mod).toMatch(/^const claimedPollTokens = new Set<string>\(\);$/m);
  });

  it("offers no production way to forget a claimed token", () => {
    // A release is how a tight retry loop gets written: the effect re-runs on the mutation's own
    // state change, so releasing on failure re-fires immediately. The way back in is a RESEND,
    // which mints a new approval and a new token.
    expect(callSitesAcrossClient("forgetDeviceApprovalClaimsForTests")).toEqual([]);
    const mod = strip(read("lib", "device-approval-claim.ts"));
    expect(mod).not.toMatch(/\bdelete\b/);
  });
});

describe("the claim is sent from exactly one place, behind that guard", () => {
  it("has one caller of the claim mutation in the whole client", () => {
    const callers = countAcrossClient("deviceApprovalCompleteMutation.mutate(");
    expect(callers).toEqual([{ file: join("components", "device-approval-step.tsx"), count: 1 }]);
  });

  it("marks the token only where the claim is sent", () => {
    // One call, in the one file that sends it. A second marker elsewhere would STRAND the real
    // claim rather than guard it, which is worse than the burst it is meant to prevent.
    expect(callSitesAcrossClient("beginDeviceApprovalClaim")).toEqual([
      { file: join("components", "device-approval-step.tsx"), count: 1 },
    ]);
  });

  it("guards the sending effect on the token and not on component state", () => {
    const src = strip(read("components", "device-approval-step.tsx"));
    const at = src.indexOf("deviceApprovalCompleteMutation.mutate(");
    expect(at).toBeGreaterThan(0);
    // The effect that sends it, bounded by the effect's own braces.
    const effectStart = src.lastIndexOf("useEffect(", at);
    expect(effectStart).toBeGreaterThan(-1);
    const effect = blockFrom(src, effectStart);
    expect(effect).toContain("deviceApprovalCompleteMutation.mutate(");
    expect(effect).toContain("beginDeviceApprovalClaim(pollToken)");
    // FORBIDDEN: a per-mount guard, in any spelling.
    expect(src).not.toMatch(/setClaimed/);
    expect(src).not.toMatch(/const \[claimed/);
  });
});

describe("a spent attempt stops being drawable", () => {
  it("clears the login attempt on the branch that establishes a session", () => {
    const src = strip(read("hooks", "use-auth.tsx"));
    const at = src.indexOf("function useDeviceApprovalCompleteMutation(");
    expect(at).toBeGreaterThan(-1);
    const hook = blockFrom(src, src.indexOf("{", src.indexOf(")", at)));
    // The callback is taken as a parameter rather than reached for, so the provider is the one
    // place that decides what "the login attempt" is.
    expect(src.slice(at, at + 200)).toContain("clearSpentLoginAttempt");
    const applied = hook.indexOf("applyLoginSuccess(");
    const cleared = hook.indexOf("clearSpentLoginAttempt()");
    expect(applied).toBeGreaterThan(-1);
    expect(cleared).toBeGreaterThan(applied);
    // And NOT on the hand-off branch: both login pages read the authenticator step off this
    // mutation's data, so clearing there would break the code step's Back.
    const mfaReturn = hook.indexOf('if ("mfaRequired" in result) return;');
    expect(mfaReturn).toBeGreaterThan(-1);
    expect(mfaReturn).toBeLessThan(applied);
  });

  it("passes the login mutation's own reset in, from the provider", () => {
    const src = strip(read("hooks", "use-auth.tsx"));
    expect(src).toMatch(/useDeviceApprovalCompleteMutation\(loginMutation\.reset\)/);
    // FORBIDDEN: constructed with nothing, which is what left the attempt drawable.
    expect(src).not.toMatch(/useDeviceApprovalCompleteMutation\(\)/);
  });
});

describe("backing out of the code step works from either way in", () => {
  // Two ways reach MfaLoginStep -- straight from the password, or after the email approved a new
  // device -- and only the first puts the hand-off on loginMutation. Resetting the password step
  // alone left mfaPending truthy and Back did nothing.
  for (const page of ["login.tsx", "admin-login.tsx"]) {
    it(`${page} resets both mutations when backing out`, () => {
      const src = strip(read("pages", page));
      const at = src.indexOf("<MfaLoginStep");
      expect(at).toBeGreaterThan(-1);
      const onBack = src.indexOf("onBack=", at);
      expect(onBack).toBeGreaterThan(-1);
      const handler = blockFrom(src, onBack);
      expect(handler).toContain("loginMutation.reset()");
      expect(handler).toContain("deviceApprovalCompleteMutation.reset()");
    });
  }
});
