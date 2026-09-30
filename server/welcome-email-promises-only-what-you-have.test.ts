import { describe, it, expect } from "vitest";
import { buildWelcomeEmail } from "./welcome-email";
import { FREE_AGENT_TIERS } from "@shared/free-agent-tiers";

/**
 * THE WELCOME EMAIL MAY ONLY NAME WHAT THE READER ACTUALLY HAS.
 *
 * A self-serve athlete signup with no coach's invite code lands on NO paid tier. The email it
 * triggered told them they had "full access to Forge's AI program builder" -- which needs
 * hasAiChat, two tiers up at $9.99. Worse, FreeAgentWelcomeDialog on the signup screen has always
 * said the AI coach is a paid upgrade, so the email contradicted the screen the athlete had
 * tapped through thirty seconds earlier. Whichever one they believed, Forge looked broken.
 *
 * This is the third time this exact bug has been found. The landing page and the pricing page both
 * promised the AI program builder on Basic and the camera on all three (see CLAUDE.md, "Skills are
 * part of the camera tier"); both were fixed by deriving the feature lists from the tier flags. The
 * email was missed because it is the one surface that names features in prose rather than from a
 * table, so there was nothing to derive and nothing to scan.
 *
 * The premise is asserted rather than assumed: if somebody ever gives Basic the AI chat, the first
 * test here fails and tells the next reader that the rest of this file is now arguing for the wrong
 * thing -- instead of silently guarding a rule that stopped being true.
 */
describe("the welcome email a Free Agent gets", () => {
  const freeAgent = buildWelcomeEmail({ name: "Priya Raghunathan", role: "athlete" }, null);

  it("is written for a reader whose tier has no AI chat and no camera", () => {
    // The premise. Every assertion below depends on it.
    expect(FREE_AGENT_TIERS.basic.hasAiChat).toBe(false);
    expect(FREE_AGENT_TIERS.basic.hasVideoFormCheck).toBe(false);
    expect(FREE_AGENT_TIERS.basic.hasSkills).toBe(false);
  });

  it("never claims they have a feature that costs an entitlement", () => {
    // The vocabulary the paid surfaces use for the three gated things. A claim is what this
    // catches -- the email is allowed to MENTION the AI coach, and does, as an upgrade.
    const claimed = [
      /full access to [^<]*AI/i,
      /with (?:the )?AI program builder/i,
      /your AI (?:coach|chat)/i,
      /form[- ]check/i,
      /skill (?:programs|bank)/i,
    ];
    for (const pattern of claimed) expect(freeAgent).not.toMatch(pattern);
  });

  it("says the AI coach is a paid upgrade, the same as the signup screen does", () => {
    expect(freeAgent).toMatch(/paid upgrade/i);
    // And that nobody is charged for it yet, which is the true statement today and the one the
    // pricing page and the Free Agent dialog both make.
    expect(freeAgent).toMatch(/beta/i);
  });

  it("does name the exercise substitution agent, which really is free", () => {
    // Not an oversight and not generosity: the swap-exercise route is deliberately never behind
    // requirePaidAiAccess, so this is the one AI feature a Free Agent keeps. An email that left it
    // out would undersell the product as badly as the old one oversold it.
    expect(freeAgent).toMatch(/substitution/i);
  });

  it("still promises the coached athlete and the coach what they do have", () => {
    // The fix touched one branch of three. A coached athlete's calendar really does fill from their
    // coach, and a coach really does get the exercise bank and the roster.
    const coached = buildWelcomeEmail({ name: "Tatum Okafor", role: "athlete" }, "Marcus Delacroix");
    expect(coached).toContain("Marcus Delacroix");
    expect(coached).toMatch(/calendar/i);
    expect(coached).not.toMatch(/paid upgrade/i);

    const coach = buildWelcomeEmail({ name: "Marcus Delacroix", role: "coach" }, null);
    expect(coach).toMatch(/exercise bank/i);
    expect(coach).toMatch(/roster/i);
  });

  it("addresses the reader by first name only", () => {
    // Unchanged by this fix, and worth pinning: the greeting is the one place a full name would
    // read as a form letter.
    expect(freeAgent).toContain("Welcome, Priya");
    expect(freeAgent).not.toContain("Welcome, Priya Raghunathan");
  });
});
