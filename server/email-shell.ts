import { FORGE_EMAIL_HEADER } from "./email-branding";

/** THE ONE EMAIL SHELL: the orange band, a heading, and a body.
 *
 * Pulled out of email-roster-documents.ts on 2026-10-09, after the launch audit's email sweep
 * found two builders sending bodies with no band at all. That is not a cosmetic miss:
 * `applyEmailBranding` keys on the band (`FORGE_EMAIL_HEADER_RE`) and returns the html untouched
 * without it, so those two emails had the program in the From line and neither the program nor
 * "Powered by Forge" in the body -- half-branded, which a paying Full Personalization customer is
 * the one person certain to notice. `notify.ts` was every in-app notification email; the other was
 * the institutional signed-copy confirmation, the only email in the system with no Forge wordmark
 * anywhere.
 *
 * It is deliberately NOT a refactor of all sixteen builders. CLAUDE.md records the design: every
 * builder keeps its own header as written and the REWRITE is the one place. What was missing was
 * something for a new builder to reach for, which is why the two that had none had none.
 *
 * Output is byte-identical to the shell this replaces, pinned by email-shell.test.ts, so no
 * working email changed shape.
 */
export function emailShell(title: string, body: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      ${FORGE_EMAIL_HEADER}
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
        ${body}
      </div>
    </div>
  `;
}
