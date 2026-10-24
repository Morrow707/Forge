import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  EMAIL_POLL_INTERVAL_MS,
  EMAIL_WAIT_TIMEOUT_MS,
  waitForEmail,
  waitForEmailTo,
  type OutboxMessage,
} from "./test-support/wait-for-email";

/** `brandForUserId` IS WHAT MAKES A FIRE-AND-FORGET SEND LAND AFTER THE RESPONSE.
 *
 * Measured 2026-10-24, not reasoned about. `sendEmail` is an async function whose body runs
 * synchronously up to its first `await`, and on the UNBRANDED path there is no await before the
 * outbox push -- so `sendEmail(...)` without `await` still leaves the message readable the
 * instant the call returns. Proven by driving the real function: an unbranded send is PRESENT
 * on the very next line. Pass `brandForUserId` and two awaits appear ahead of the push --
 * `await import("./storage")` (a real module load the first time, a cache hit after) and
 * `await storage.getEffectiveBrandingForUser(id)` -- and the push now lands whenever those
 * finish, which is after the handler's own remaining awaits and after `res.json`.
 *
 * So the hazard is exactly ONE shape: a send that is not awaited AND carries `brandForUserId`.
 * Neither half alone is a problem, which is why this went unnoticed -- the repo has unawaited
 * sends that are perfectly safe (`void emailSignedCopy(...)` is deliberately unbranded and says
 * so) and branded sends that are perfectly safe (every roster, campaign and device email is
 * awaited because its route reports what was delivered).
 *
 * WHAT IT COST. `a-claimed-athlete-is-told-they-have-a-coach.itest.ts` read the outbox straight
 * after the 201 and turned CI red on SIX consecutive runs across both refs, which is most of the
 * fifteen red runs Scott saw on 2026-10-24. It was latent for five runs before that: step 9 (the
 * production npm audit) was failing, so CI never reached step 16 and the commit that introduced
 * it was unproven by the integration suite -- exactly what CLAUDE.md means by a commit that dies
 * early being unproven by everything after it. Reproduced locally at about one run in three, and
 * **only ever on the first of that file's four cases**, because the first call is the only one
 * where the dynamic import is a real load rather than a cache hit. A race whose loser is always
 * the first test in a worker reads as one broken test rather than as a race.
 *
 * A `.test.ts`, NOT an itest, deliberately: it needs no Postgres, so it runs on every `npm test`
 * -- the same argument `the-reset-survives-an-unawaited-write.test.ts` makes for the deadlock
 * retry, which exists for this same family of deliberately unawaited writes.
 */

const SERVER = import.meta.dirname;

/** Prose about what the code no longer does is indistinguishable from the code still doing it,
 *  and the comments this fix added quote every pattern scanned for below. Proven load-bearing by
 *  mutation rather than taken on trust. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Everything inside one call's parentheses, matched by its own parens -- never a character
 *  window, which fails for prose and also PASSES for a match belonging to the next call down. */
function callArgsAt(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i);
    }
  }
  return source.slice(open);
}

function serverFiles(filter: (name: string) => boolean): string[] {
  return readdirSync(SERVER)
    .filter((n) => n.endsWith(".ts"))
    .filter(filter)
    .map((n) => join(SERVER, n));
}

/** Every `sendEmail(...)` in production server code that is NOT awaited and DOES carry
 *  `brandForUserId` -- i.e. every send whose outbox push can land after the response.
 *  Discovered, never listed: a fifth one written next year shows up here the day it is added.
 *
 *  **DIRECT CALLS ONLY, and the forbidden-form case below is what actually protects.** This does
 *  not see the INDIRECT shape -- an unawaited call to a function that internally awaits a branded
 *  send -- and `auth.ts` has four of those beside the four found here (`sendVerificationEmail`,
 *  `issueGuardianInviteIfNeeded`, the guardian consent confirmation, and `trackNewSession`'s
 *  never-awaited "New login" continuation). A transitive scan was considered and rejected: it
 *  would have to follow calls through helpers and would rot, while "an itest may not read the
 *  outbox directly" is a rule about the TEST and therefore covers every send behind every read.
 *  So read this as a diagnostic aid that names the surface, not as the guard. */
function sendsThatLandLate(): { file: string; line: number }[] {
  const out: { file: string; line: number }[] = [];
  for (const path of serverFiles((n) => !n.includes(".test.") && !n.includes(".itest."))) {
    const bare = stripComments(readFileSync(path, "utf8"));
    for (const m of bare.matchAll(/sendEmail\s*\(/g)) {
      const open = bare.indexOf("(", m.index!);
      const args = callArgsAt(bare, open);
      if (!/\bbrandForUserId\s*:/.test(args)) continue;
      // The call is awaited when `await` (or a `return`, or a bare arrow body) sits immediately
      // before it. `sendEmail`'s own declaration is skipped by requiring a call, not a signature.
      const before = bare.slice(Math.max(0, m.index! - 24), m.index!);
      if (/\b(await|return)\s*$/.test(before)) continue;
      if (/\bexport\s+async\s+function\s*$/.test(before)) continue;
      out.push({ file: path.slice(SERVER.length + 1), line: bare.slice(0, m.index!).split("\n").length });
    }
  }
  return out;
}

/** An itest may read `testOutbox` directly ONLY where the send it reads cannot land late, and
 *  each entry says WHY in terms of the code rather than asserting it is fine. Every reason here
 *  was read off the handler, with line numbers, during the 2026-10-24 sweep.
 *
 *  This is the `NOT_PUBLIC_ON_PURPOSE` / `FITTED_OVERRIDES` shape: the machinery for a direct
 *  read exists, and adding one costs a sentence that turns up in a grep. The primary mechanism
 *  is the helper; this list is the proven-safe exceptions, not the rule. */
const READS_A_SEND_THAT_CANNOT_LAND_LATE: Record<string, string> = {
  "branding-page.itest.ts":
    "Both sends under test are awaited before the response: routes.ts' branding test-email does `const result = await sendEmail(...)` and only then res.json, and auth.ts' password reset awaits it at ~2000 with the response after. The branding lookup that loses the race is inside that await.",
  "coach-roster-document-emails.itest.ts":
    "Awaited the whole way down: routes.ts does `await storage.requestDocuments(...)` and requestDocuments does `const result = await sendEmail(...)`, because the route reports emailed vs in_app_only per target and cannot know that without waiting. Reads also filter by recipient rather than by count.",
  "email-list.itest.ts":
    "The campaign routes await the send to report their own counters -- email-list.ts awaits sendEmail for the test send and runCampaign is awaited for the real one -- and neither passes brandForUserId, so the push is synchronous regardless.",
  "new-device-approval.itest.ts":
    "The approval mail is sent down an awaited chain in auth.ts (the login handler awaits the notifier, which awaits sendEmail) before the login response returns, which is what makes the test able to read its own approval link at all.",
  "institutional-agreement-sign.itest.ts":
    "The send is fire-and-forget (`void emailSignedCopy(...)`, so a mail outage cannot undo a filed signature) but deliberately UNBRANDED -- the file says 'Deliberately UNBRANDED by program (no brandForUserId)' because the recipient is a notice address -- so there is no await before the push and it lands synchronously.",
  "terms-reacceptance.itest.ts":
    "This file calls `await notifyGuardiansOfTermsChange()` directly rather than through a route, and that function awaits each sendEmail in turn, so every read -- including the five that assert ABSENCE, which would otherwise pass spuriously -- is fully ordered behind the send.",
};

describe("the wait helper cannot mask a missing email", () => {
  /** A fake clock and a fake sleep, so these cases are deterministic and instant. */
  function controlled(pushAfterPolls: number | null) {
    const outbox: OutboxMessage[] = [];
    let polls = 0;
    let clock = 0;
    return {
      outbox,
      polls: () => polls,
      opts: {
        outbox,
        now: () => clock,
        sleep: async (ms: number) => {
          polls += 1;
          clock += ms;
          if (pushAfterPolls != null && polls === pushAfterPolls) {
            outbox.push({ to: "a@b.test", subject: "Welcome to Forge", html: "<p>hi</p>" });
          }
        },
      },
    };
  }

  it("returns a message that arrives LATE, which is the whole point", async () => {
    const c = controlled(3);
    const found = await waitForEmailTo("a@b.test", "Welcome to Forge", c.opts);
    expect(found.html).toBe("<p>hi</p>");
    expect(c.polls(), "it should have had to wait, not found it on the first look").toBe(3);
  });

  it("returns immediately when the message is already there", async () => {
    const c = controlled(null);
    c.outbox.push({ to: "a@b.test", subject: "Welcome to Forge", html: "<p>hi</p>" });
    const found = await waitForEmailTo("a@b.test", "Welcome to Forge", c.opts);
    expect(found).toBeTruthy();
    expect(c.polls(), "a passing test must pay nothing for this helper").toBe(0);
  });

  it("THROWS when no email is ever sent -- it never resolves to undefined", async () => {
    // The property that keeps this helper from turning every missing-email bug into a pass.
    const c = controlled(null);
    await expect(waitForEmailTo("a@b.test", "Welcome to Forge", c.opts)).rejects.toThrow(
      /No email matching/,
    );
  });

  it("names what it waited for AND what the outbox actually held", async () => {
    // Somebody reading a red CI job needs both halves: a wrong recipient and a send that never
    // happened are different bugs and the message has to tell them apart.
    const c = controlled(null);
    c.outbox.push({ to: "someone-else@b.test", subject: "Verify your email", html: "" });
    const err = await waitForEmailTo("a@b.test", "Welcome to Forge", c.opts).catch((e) => e);
    expect(String(err)).toContain("Welcome to Forge");
    expect(String(err)).toContain("a@b.test");
    expect(String(err), "the outbox contents are what distinguish the two bugs").toContain(
      "someone-else@b.test",
    );
  });

  it("is BOUNDED even when the sleep resolves instantly", async () => {
    // retry-on-deadlock.ts records what the alternative costs: a loop whose sleep resolves at
    // once starves the timer queue, so the suite HANGS rather than failing, and a hang in CI is
    // a job timeout that reads as an entirely different fault.
    const c = controlled(null);
    await waitForEmail(() => false, { ...c.opts, what: "nothing" }).catch(() => {});
    expect(c.polls()).toBeLessThanOrEqual(
      Math.ceil(EMAIL_WAIT_TIMEOUT_MS / EMAIL_POLL_INTERVAL_MS) + 1,
    );
  });

  it("waits on a REAL timer by default", async () => {
    // The default sleep must actually delay; a default that resolved immediately would make the
    // bound above the only thing standing between this and a spin.
    const started = Date.now();
    await waitForEmail(() => false, { outbox: [], timeoutMs: 60, intervalMs: 20 }).catch(() => {});
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
  });
});

describe("every send that can land late is waited for", () => {
  it("still has sends that land late -- the premise, so this rule is never vacuous", () => {
    // If this ever became empty the rules below would pass trivially, which is the state the
    // 2026-10-16 camera-registry check was in when it certified records nothing read.
    const late = sendsThatLandLate();
    expect(late.length, "no unawaited branded send found; the scan has stopped working").toBeGreaterThan(0);
  });

  it("finds them where they actually are, with usable line numbers", () => {
    // All of today's are in auth.ts -- signup, the claim, and the two account-security mails.
    const late = sendsThatLandLate();
    expect(late.some((s) => s.file === "auth.ts")).toBe(true);
    // A line number is the whole value of this scan on the day it fires, and the first draft of
    // it read `.count` off a string and reported undefined for every hit.
    for (const s of late) {
      expect(Number.isInteger(s.line), `${s.file} hit has no usable line`).toBe(true);
      expect(s.line).toBeGreaterThan(0);
    }
  });

  it("measures the UNAWAITED direction, not merely 'a branded send somewhere'", () => {
    // M5 of this file's own mutation run slipped through without this. Inverting the scan to
    // look for AWAITED branded sends left every other case green, because auth.ts holds both
    // kinds -- so "the set is non-empty and mentions auth.ts" is true either way and cannot tell
    // the two directions apart. A scan that silently starts measuring the opposite thing is the
    // circular-diagnostic shape CLAUDE.md records for plateBoxToExpectedRatio.
    //
    // terms-change-notice.ts is the landmark: its only send is `await sendEmail({ ...
    // brandForUserId: guardianId })`, branded AND awaited, so it belongs in the set under the
    // inverted scan and must never appear under the correct one. Pinned by FILENAME rather than
    // line, so ordinary edits to that file cannot move it.
    const late = sendsThatLandLate().map((s) => s.file);
    expect(
      late,
      "terms-change-notice.ts awaits its branded send; finding it here means the scan has inverted",
    ).not.toContain("terms-change-notice.ts");
    expect(
      readFileSync(join(SERVER, "terms-change-notice.ts"), "utf8"),
      "the landmark only works while that send really is awaited and branded",
    ).toMatch(/await sendEmail\(/);
  });

  it("FORBIDS an itest reading the outbox directly unless it says why that is safe", () => {
    const offenders: string[] = [];
    for (const path of serverFiles((n) => n.endsWith(".itest.ts"))) {
      const name = path.slice(SERVER.length + 1);
      const bare = stripComments(readFileSync(path, "utf8"));
      // A READ is a find/filter/some over the outbox. `testOutbox.length = 0` in a beforeEach is
      // a reset, not a read, and is always fine.
      if (!/testOutbox\s*\.\s*(find|filter|some)\s*\(/.test(bare) && !/\[\s*\.\.\.\s*testOutbox\s*\]/.test(bare)) continue;
      if (READS_A_SEND_THAT_CANNOT_LAND_LATE[name]) continue;
      // Going through the helper is the ordinary way and needs no entry.
      if (/waitForEmail(To)?\s*\(/.test(bare)) continue;
      offenders.push(name);
    }
    expect(
      offenders,
      "these read testOutbox directly: use waitForEmailTo, or add an entry saying why that send cannot land after the response",
    ).toEqual([]);
  });

  it("requires every exemption to give a reason, not just a name", () => {
    for (const [file, reason] of Object.entries(READS_A_SEND_THAT_CANNOT_LAND_LATE)) {
      expect(reason.length, `${file}'s exemption needs a real reason`).toBeGreaterThan(60);
      // A reason has to name the mechanism. "it is fine" is not one.
      expect(reason, `${file}'s reason must say WHY the push cannot land late`).toMatch(
        /await|unbranded|brandForUserId|synchronous/i,
      );
    }
  });

  it("keeps no exemption for a file that no longer reads the outbox", () => {
    // A rotting list is the failure mode this shape is otherwise prone to.
    for (const file of Object.keys(READS_A_SEND_THAT_CANNOT_LAND_LATE)) {
      const bare = stripComments(readFileSync(join(SERVER, file), "utf8"));
      expect(
        /testOutbox/.test(bare),
        `${file} is exempted but no longer reads testOutbox -- drop the entry`,
      ).toBe(true);
    }
  });
});
