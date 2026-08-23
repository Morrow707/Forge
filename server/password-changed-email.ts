// Same plain-inline-style-HTML approach as the other transactional emails
// in this codebase (welcome-email.ts, password-reset-email.ts,
// new-device-login-email.ts) -- no external CSS/images, so it renders
// consistently across mail clients.
import { escapeHtml } from "./email";

export function buildPasswordChangedEmail(name: string) {
  const firstName = escapeHtml(name.split(" ")[0] || name);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">Your password was changed</h1>
        <p style="color:#555;margin:0 0 20px;">
          Hi ${firstName}, this is a confirmation that your Forge account password was just reset.
          As a precaution, you've been logged out everywhere -- you'll need to log back in on any
          device you're using, including the app.
        </p>
        <p style="color:#555;margin:0 0 20px;">
          If this was you, there's nothing else to do.
        </p>
        <p style="color:#555;margin:0 0 20px;">
          If it wasn't, someone else may have access to your email -- secure that account first,
          then reset your Forge password again from the login page.
        </p>
        <p style="color:#999;font-size:12px;margin-top:24px;">Sent by Forge.</p>
      </div>
    </div>
  `;
}
