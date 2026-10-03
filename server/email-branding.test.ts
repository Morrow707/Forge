import { describe, expect, it } from "vitest";
import { applyEmailBranding, brandedFromAddress, FORGE_EMAIL_ORANGE } from "./email-branding";
import { buildWelcomeEmail } from "./welcome-email";
import { buildPasswordResetEmail } from "./password-reset-email";

const CAL = {
  brandTeamName: "Cal Bears",
  brandLogoUrl: "/uploads/team-logos/bears.png",
  brandPrimaryColor: "#003262",
  brandSenderName: "Cal Strength",
};

describe("a branded email", () => {
  it("replaces the orange FORGE band with the program's colour, logo and name", () => {
    const html = applyEmailBranding(buildWelcomeEmail({ name: "Sam Lee", role: "athlete" }, "Coach"), CAL);
    expect(html).not.toContain(FORGE_EMAIL_ORANGE);
    expect(html).toContain("background:#003262");
    expect(html).toContain("Cal Bears");
    expect(html).toContain("/uploads/team-logos/bears.png");
    expect(html).toMatch(/<img src="https:\/\/[^"]+\/uploads\/team-logos\/bears\.png"/);
  });

  it("never drops the word Forge: Powered by Forge rides in the band and the footer says via Forge", () => {
    const html = applyEmailBranding(buildWelcomeEmail({ name: "Sam Lee", role: "athlete" }, "Coach"), CAL);
    expect(html).toContain("Powered by Forge");
    expect(html).toContain("Sent by Cal Bears via Forge.");
  });

  it("recolours the buttons that were orange", () => {
    const html = applyEmailBranding(buildPasswordResetEmail("https://x/reset"), CAL);
    expect(html).not.toContain(FORGE_EMAIL_ORANGE);
    expect(html).toContain("background:#003262;color:#fff");
  });

  it("escapes a team name", () => {
    const html = applyEmailBranding(buildPasswordResetEmail("https://x/reset"), {
      ...CAL,
      brandTeamName: '<img src=x onerror="1">',
    });
    expect(html).not.toContain("<img src=x");
  });

  it("leaves an unbranded program's email exactly as built", () => {
    const built = buildPasswordResetEmail("https://x/reset");
    expect(applyEmailBranding(built, null)).toBe(built);
    expect(
      applyEmailBranding(built, { brandTeamName: null, brandLogoUrl: null, brandPrimaryColor: null, brandSenderName: null }),
    ).toBe(built);
  });

  it("leaves HTML without the shared header alone rather than half-branding it", () => {
    const plain = "<p>Open Forge to see more.</p>";
    expect(applyEmailBranding(plain, CAL)).toBe(plain);
  });
});

describe("the From line", () => {
  it("names the program via Forge and keeps the verified address", () => {
    expect(brandedFromAddress("Forge <hello@forgeperformancesystems.com>", CAL)).toBe(
      "Cal Strength via Forge <hello@forgeperformancesystems.com>",
    );
  });
  it("falls back to the team name, then to the plain address", () => {
    expect(brandedFromAddress("Forge <a@b.c>", { ...CAL, brandSenderName: null })).toBe("Cal Bears via Forge <a@b.c>");
    expect(brandedFromAddress("Forge <a@b.c>", null)).toBe("Forge <a@b.c>");
  });
  it("cannot be used to forge a different address", () => {
    expect(brandedFromAddress("Forge <a@b.c>", { ...CAL, brandSenderName: 'Evil <evil@x.y>' })).toBe(
      "Evil evil@x.y via Forge <a@b.c>",
    );
  });
});
