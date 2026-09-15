import { escapeHtml } from "./email";

/** The "plus" in email-plus.
 *
 * The FTC's email-plus method for verifiable parental consent is a consent given by email
 * followed by a second, separate confirmation to the same address -- the point being that a
 * child who intercepted the first message has to still hold the parent's inbox some time later,
 * and that a parent who did NOT consent finds out that somebody did it in their name.
 *
 * So this is not a receipt and must not read like one. Its job is to be actionable: it states
 * plainly what was agreed, on whose behalf, and what to do if the reader did not do it. A
 * confirmation nobody can act on is decoration.
 *
 * Sent after the claim has succeeded, because it confirms something that happened rather than
 * asking for anything. Same plain-inline-style HTML as every other send here -- no external CSS
 * or images, so it renders the same everywhere.
 */
export function buildGuardianConsentConfirmationEmail(
  athleteName: string,
  guardianEmail: string,
  agreedAt: Date,
  revokeLink: string,
) {
  const safeName = escapeHtml(athleteName);
  const safeEmail = escapeHtml(guardianEmail);
  const safeLink = escapeHtml(revokeLink);
  const when = agreedAt.toUTCString();
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">You approved ${safeName}'s Forge account</h1>
        <p style="color:#555;margin:0 0 16px;">
          On ${escapeHtml(when)}, using ${safeEmail}, a parent or guardian account was created and
          linked to ${safeName}, and agreed to:
        </p>
        <ul style="color:#555;margin:0 0 20px;padding-left:20px;">
          <li style="margin-bottom:6px;">Forge's terms of service</li>
          <li style="margin-bottom:6px;">
            The privacy policy, covering what Forge collects about ${safeName} and who can see it
          </li>
          <li style="margin-bottom:6px;">
            The video and biometric release -- ${safeName} can be recorded on video for coaching,
            and measurements taken from that footage
          </li>
        </ul>
        <p style="color:#555;margin:0 0 20px;">
          ${safeName} could not use Forge until this was done, and can use it now.
        </p>
        <div style="background:#FFF4F0;border-left:4px solid #F65B23;padding:14px 16px;margin-bottom:20px;">
          <strong style="display:block;margin-bottom:6px;">If this wasn't you</strong>
          <span style="color:#555;">
            Somebody used your email address to approve a child's account. Open the link below to
            withdraw the approval and close the account, or reply to this email and we will do it
            for you.
          </span>
        </div>
        <a
          href="${safeLink}"
          style="display:inline-block;background:#F65B23;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px;margin-bottom:20px;"
        >Manage or withdraw this approval</a>
        <p style="color:#888;font-size:12px;margin:0;">
          You are receiving this because you were named as ${safeName}'s parent or guardian. This
          is a confirmation of an approval that has already taken effect, not a request.
        </p>
      </div>
    </div>
  `;
}
