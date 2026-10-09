import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emailShell } from "./email-shell";
import { FORGE_EMAIL_HEADER, FORGE_EMAIL_HEADER_RE, applyEmailBranding } from "./email-branding";

/* AN EMAIL BODY WITH NO BAND IS AN EMAIL THAT CANNOT BE BRANDED, AND NOTHING SAID SO.
 *
 * `applyEmailBranding` opens with `if (!FORGE_EMAIL_HEADER_RE.test(html)) return html;` -- it
 * leaves a body it does not recognise alone rather than half-branding it, which is the right
 * rule and was also a silent one. Two builders passed `brandForUserId` and emitted no band, so
 * the From line wore the program and the body wore nothing, and no test anywhere could tell:
 *
 *   - notify.ts, which is EVERY in-app notification email.
 *   - the institutional signed-copy confirmation, the only email in the system with no Forge
 *     wordmark anywhere, sent to the notice address named in a signed agreement.
 *
 * Found 2026-10-09 by reading all sixteen bodies rather than by any scan. Both now go through
 * emailShell, and this file pins the three things that make that work.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the one email shell", () => {
  it("emits a band the branding rewrite recognises", () => {
    // The whole point. If this fails, every body built with the shell is silently unbranded.
    expect(FORGE_EMAIL_HEADER_RE.test(emailShell("Title", "<p>Body.</p>"))).toBe(true);
  });

  it("keeps the regex and the constant two spellings of one string", () => {
    // The regex RECOGNISES and the constant is WRITTEN, so they can drift, and the drift is
    // invisible: a builder emits a header nothing matches and goes unbranded with no error.
    expect(FORGE_EMAIL_HEADER_RE.test(FORGE_EMAIL_HEADER)).toBe(true);
  });

  it("is byte-identical to the shell it replaced, so no working email changed shape", () => {
    // email-roster-documents.ts had this inline and its emails are correct today. The move was
    // to give a new builder something to reach for -- not to restyle thirteen working emails.
    const previous = (title: string, body: string) => `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
        ${body}
      </div>
    </div>
  `;
    // Insignificant whitespace only: the shared band is one line where the old one was three,
    // so the difference is whitespace BETWEEN tags, which no mail client renders. Collapsing
    // runs to a single space is not enough -- that still distinguishes "a space here" from "no
    // space here", which is what the first run of this assertion caught. Whitespace inside text
    // content stays significant, so a changed sentence still fails.
    const squash = (s: string) =>
      s.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
    expect(squash(emailShell("A title", "<p>A body.</p>"))).toBe(
      squash(previous("A title", "<p>A body.</p>")),
    );
  });

  it("brands a shell-built body end to end", () => {
    // Not just "the regex matches" -- the rewrite actually rewrites, and the word Forge survives
    // it, which CLAUDE.md requires of every branded email.
    const branded = applyEmailBranding(emailShell("Hi", "<p>Body.</p>"), {
      brandTeamName: "Cal Berkeley",
      brandLogoUrl: null,
      brandPrimaryColor: "#003262",
    } as never);
    expect(branded).toContain("Cal Berkeley");
    expect(branded).toContain("Powered by Forge");
  });
});

describe("the two builders that had no band", () => {
  it("notify.ts builds its body through the shell", () => {
    const src = read("server/notify.ts");
    expect(src).toContain("emailShell(");
    // And still asks for the program, which did nothing without a band to rewrite.
    expect(src).toContain("brandForUserId: userId");
    // The bare two-paragraph body is gone, or both shapes could ship.
    expect(src).not.toMatch(/html: `<p style="font-family:Arial/);
  });

  it("the institutional signed copy builds its body through the shell", () => {
    const src = read("server/institutional-agreement-routes.ts");
    const at = src.indexOf("async function emailSignedCopy");
    expect(at).toBeGreaterThan(0);
    // Bounded at this function's own closing brace at column 0 -- and measured from the start
    // of its BODY, not its name. A fixed byte window ran past the end into unrelated code that
    // does pass brandForUserId; anchoring on the first "\n}" instead stopped at the closing
    // brace of the inline parameter TYPE, giving a 133-character window with no body in it at
    // all. Both wrong answers came from this one assertion and neither was about the code.
    const bodyStart = src.indexOf("Promise<void> {", at);
    expect(bodyStart).toBeGreaterThan(at);
    const end = src.indexOf("\n}", bodyStart);
    expect(end).toBeGreaterThan(bodyStart);
    const body = src.slice(bodyStart, end);
    expect(body).toContain("emailShell(");
    // Deliberately NOT branded by program: the recipient is the notice address in an agreement
    // between the school and Forge, so the confirmation of it wears Forge.
    //
    // Comments stripped first, because the comment EXPLAINING that it is unbranded names
    // brandForUserId and so failed this assertion on its own prose -- the same trap the claims
    // scan in welcome-email-promises-only-what-you-have.test.ts already strips for.
    const code = body
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
    expect(code).not.toContain("brandForUserId");
  });

  it("leaves the roster-document emails emitting the same band through the shared shell", () => {
    const src = read("server/email-roster-documents.ts");
    expect(src).toContain("emailShell");
    // The literal is gone from this file, which is why the claims scan discovers by the union of
    // the band and the filename glob rather than by the band alone.
    expect(src).not.toContain('style="background:#F65B23;padding:20px 24px;"');
  });
});
