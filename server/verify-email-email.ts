// Same plain-inline-style-HTML approach as the other transactional emails
// in this codebase.
export function buildVerifyEmailEmail(verifyLink: string) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">Confirm your email</h1>
        <p style="color:#555;margin:0 0 20px;">
          One more step -- confirm this is your email address. The link below expires in 24
          hours.
        </p>
        <a
          href="${verifyLink}"
          style="display:inline-block;background:#F65B23;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px;margin-bottom:20px;"
        >
          Confirm Email
        </a>
        <p style="color:#777;font-size:13px;margin:0 0 4px;">Or paste this link into your browser:</p>
        <p style="color:#555;font-size:12px;word-break:break-all;margin:0 0 20px;">${verifyLink}</p>
        <p style="color:#999;font-size:12px;margin-top:24px;">
          If you didn't create a Forge account, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
}
