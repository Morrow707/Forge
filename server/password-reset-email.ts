// Same plain-inline-style-HTML approach as progress-report.ts's own comment
// explains -- no external CSS/images, so it renders consistently across mail
// clients.
export function buildPasswordResetEmail(resetLink: string) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">Reset your password</h1>
        <p style="color:#555;margin:0 0 20px;">
          Someone requested a password reset for this account. If that was you, use the link
          below -- it expires in 1 hour and only works once.
        </p>
        <a
          href="${resetLink}"
          style="display:inline-block;background:#F65B23;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px;margin-bottom:20px;"
        >
          Reset Password
        </a>
        <p style="color:#777;font-size:13px;margin:0 0 4px;">Or paste this link into your browser:</p>
        <p style="color:#555;font-size:12px;word-break:break-all;margin:0 0 20px;">${resetLink}</p>
        <p style="color:#999;font-size:12px;margin-top:24px;">
          If you didn't request this, you can safely ignore this email -- your password won't change.
        </p>
      </div>
    </div>
  `;
}
