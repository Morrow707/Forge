import { escapeHtml } from "./email";

// Same plain-inline-style-HTML approach as password-reset-email.ts -- no
// external CSS/images, so it renders consistently across mail clients.
// Carries the current parental_notice document's text inline (see
// legalDocuments/PARENTAL_NOTICE_DRAFT) -- this send is that document's
// only real delivery channel right now, not just an account invite.
export function buildGuardianInviteEmail(
  athleteName: string,
  claimLink: string,
  parentalNoticeText: string,
) {
  const safeName = escapeHtml(athleteName);
  const safeLink = escapeHtml(claimLink);
  const safeNotice = escapeHtml(parentalNoticeText);
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">You've been listed as ${safeName}'s guardian</h1>
        <p style="color:#555;margin:0 0 20px;">
          ${safeName} signed up for Forge, a training app their coach or program uses. As their
          parent/guardian, you can set up your own free account to see their training activity --
          use the link below. It expires in 7 days.
        </p>
        <a
          href="${safeLink}"
          style="display:inline-block;background:#F65B23;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px;margin-bottom:20px;"
        >
          Set Up Your Account
        </a>
        <p style="color:#777;font-size:13px;margin:0 0 4px;">Or paste this link into your browser:</p>
        <p style="color:#555;font-size:12px;word-break:break-all;margin:0 0 24px;">${safeLink}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:0 0 20px;" />
        <p style="color:#999;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">
          Notice to Parent or Guardian
        </p>
        <div style="color:#555;font-size:13px;white-space:pre-line;margin:0;">${safeNotice}</div>
      </div>
    </div>
  `;
}
