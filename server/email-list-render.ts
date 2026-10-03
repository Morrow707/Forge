import { escapeHtml } from "./email";

/** The launch mailing's HTML. Database-free on purpose so server/email-list.test.ts can hold
 * the rendering to account without Postgres; the routes live in server/email-list.ts. */

/** Plain text as typed on the admin screen, rendered the way a person expects: a blank line is
 * a paragraph, a newline is a line break, a bare http(s) URL is a link. Everything is escaped
 * first; the only markup in the output is what this function wrote. */
export function renderCampaignBody(body: string): string {
  const linkify = (escaped: string) =>
    escaped.replace(
      /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"']/g,
      (url) => `<a href="${url}" style="color:#F65B23;">${url}</a>`,
    );
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p style="color:#333;margin:0 0 16px;line-height:1.5;">${linkify(escapeHtml(para)).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** One recipient of a mailing: an address, and how they stop getting it. The launch list has a
 * token link; a coach with Coaches Corner turns off email notifications in the app, so their
 * footer says that instead and the email wears their program (brandForUserId). */
export type CampaignRecipient = {
  email: string;
  unsubscribeUrl: string | null;
  brandForUserId?: number | null;
};

export function buildCampaignEmail(args: { body: string; unsubscribeUrl: string | null }): string {
  const footer = args.unsubscribeUrl
    ? `You're getting this because you asked Forge Performance Systems for launch updates.
          <a href="${escapeHtml(args.unsubscribeUrl)}" style="color:#999;">Unsubscribe</a> at any time.`
    : `You're getting this because your Forge account has Coaches Corner. Turn off email
          notifications in the app's notification settings to stop these.`;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        ${renderCampaignBody(args.body)}
        <p style="color:#999;font-size:12px;margin-top:24px;line-height:1.5;">
          ${footer}
        </p>
      </div>
    </div>
  `;
}

export function unsubscribeUrl(origin: string, token: string): string {
  return `${origin}/unsubscribe?token=${token}`;
}

