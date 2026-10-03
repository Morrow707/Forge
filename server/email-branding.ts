// Not imported from ./email: that module imports this one, and a cycle is cheap to avoid.
const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
import { PUBLIC_ORIGIN } from "@shared/public-origin";

/** THE EMAILS WEAR THE PROGRAM'S COLOURS TOO.
 *
 * Added 2026-10-03 with the Branding page. Scott: "if cal berkley used us, can they change
 * everything to blue and gold? every single thing" -- and an email is the first thing a new
 * athlete or a parent sees, before any screen. Every transactional email in server/ is built
 * from the same header (the orange band with FORGE in it), so instead of threading a brand
 * through fourteen builders, sendEmail({ brandForUserId }) rewrites that one header after the
 * fact: the band takes the program's primary colour, the word FORGE becomes the logo and the
 * team name, and the footer says "Sent by <program> via Forge". Every button that was orange
 * follows the band. The word Forge is never removed: "Powered by Forge" stays on everything that
 * leaves the building, which is the deal the add-on is sold on.
 *
 * A user with no branded program (a Free Agent, an unlinked guardian) gets the email exactly as
 * it was. The rewrite is a no-op on HTML that does not carry the header, so a builder with its
 * own layout is left alone rather than half-branded. */

export const FORGE_EMAIL_ORANGE = "#F65B23";

export interface EmailBrand {
  brandTeamName: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSenderName: string | null;
}

const HEADER_RE =
  /<div style="background:#F65B23;padding:20px 24px;">\s*<span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE<\/span>\s*<\/div>/;

/** Does this brand change anything an email shows? A logo or a name is enough; a colour alone
 * still recolours the band but keeps FORGE as the wordmark, since there is nothing to put there. */
export function isBrandedForEmail(brand: EmailBrand | null | undefined): brand is EmailBrand {
  return Boolean(brand && (brand.brandTeamName || brand.brandLogoUrl || brand.brandPrimaryColor));
}

/** Where an emailed image lives. Logos are stored as /uploads/team-logos/<file> and that
 * directory is public (see media-url-signing.ts), so the absolute address is the origin plus
 * the path. PUBLIC_ORIGIN from the environment first, then Render's own hostname, then the
 * shared constant -- an email has no request to read a host from. */
export function emailAssetOrigin(): string {
  const configured = (process.env.PUBLIC_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const render = (process.env.RENDER_EXTERNAL_URL ?? "").trim().replace(/\/$/, "");
  if (render) return render;
  return PUBLIC_ORIGIN;
}

/** The band at the top of a branded email. Exported so the Branding page's "send me a test"
 * and the unit test both see the same markup. */
export function brandedEmailHeader(brand: EmailBrand): string {
  const color = brand.brandPrimaryColor || FORGE_EMAIL_ORANGE;
  const name = brand.brandTeamName ? escapeHtml(brand.brandTeamName) : "FORGE";
  const logo = brand.brandLogoUrl
    ? `<img src="${escapeHtml(absoluteAssetUrl(brand.brandLogoUrl))}" alt="" height="36" style="height:36px;max-width:160px;vertical-align:middle;margin-right:12px;border:0;" />`
    : "";
  return (
    `<div style="background:${escapeHtml(color)};padding:20px 24px;">` +
    `${logo}<span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;vertical-align:middle;">${name}</span>` +
    `<div style="color:rgba(255,255,255,0.75);font-size:11px;margin-top:6px;letter-spacing:0.3px;">Powered by Forge</div>` +
    `</div>`
  );
}

export function absoluteAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${emailAssetOrigin()}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Re-dress a built email in the program's colours. Returns the input untouched when the brand
 * carries nothing, or when the HTML does not have the shared header to replace. */
export function applyEmailBranding(html: string, brand: EmailBrand | null | undefined): string {
  if (!isBrandedForEmail(brand)) return html;
  if (!HEADER_RE.test(html)) return html;
  const color = brand.brandPrimaryColor || FORGE_EMAIL_ORANGE;
  let out = html.replace(HEADER_RE, brandedEmailHeader(brand));
  if (color.toLowerCase() !== FORGE_EMAIL_ORANGE.toLowerCase()) {
    // Buttons and links that were orange follow the band. The header has already been
    // replaced, so this touches only the body.
    out = out.replace(/#F65B23/gi, color);
  }
  if (brand.brandTeamName) {
    out = out.replace(/Sent by Forge\./g, `Sent by ${escapeHtml(brand.brandTeamName)} via Forge.`);
  }
  return out;
}

/** The display name on the From line: "<sender> via Forge <address>". The address never
 * changes -- it is the verified sending domain -- and "via Forge" stays so the inbox is never
 * told the mail came from somewhere it did not. */
export function brandedFromAddress(fromAddress: string, brand: EmailBrand | null | undefined): string {
  const sender = brand?.brandSenderName?.trim() || brand?.brandTeamName?.trim();
  if (!sender) return fromAddress;
  const match = /<([^>]+)>\s*$/.exec(fromAddress);
  const address = match ? match[1] : fromAddress;
  const safe = sender.replace(/["<>\r\n]/g, "").slice(0, 60);
  return `${safe} via Forge <${address}>`;
}
