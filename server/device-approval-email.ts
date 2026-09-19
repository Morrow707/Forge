import { escapeHtml } from "./email";

// Same plain-inline-style-HTML approach as password-reset-email.ts. ONE
// button, to a page with the two choices on it, never an approve link and a
// deny link side by side: corporate mail scanners and link previews FETCH
// every link in a message, and a GET that approved a device would let a
// scanner trust a thief's phone on the owner's behalf. The page only acts on
// a POST from a button somebody pressed.
export function buildDeviceApprovalEmail(input: {
  name: string;
  deviceLabel: string;
  location: string | null;
  when: Date;
  reviewLink: string;
}) {
  const firstName = escapeHtml(input.name.split(" ")[0] || input.name);
  const safeLink = escapeHtml(input.reviewLink);
  const whenText = input.when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">We don't recognize this device</h1>
        <p style="color:#555;margin:0 0 20px;">
          Hi ${firstName}, somebody just signed in to your Forge account with your password from a
          device you have not used before. It is waiting for you to say whether that was you.
        </p>
        <table style="border-collapse:collapse;margin:0 0 20px;">
          <tr><td style="color:#777;padding:2px 12px 2px 0;">Device</td><td>${escapeHtml(input.deviceLabel)}</td></tr>
          <tr><td style="color:#777;padding:2px 12px 2px 0;">Where</td><td>${escapeHtml(input.location ?? "Unknown location")} (approximate)</td></tr>
          <tr><td style="color:#777;padding:2px 12px 2px 0;">When</td><td>${escapeHtml(whenText)}</td></tr>
        </table>
        <a
          href="${safeLink}"
          style="display:inline-block;background:#F65B23;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px;margin-bottom:20px;"
        >
          Review this sign-in
        </a>
        <p style="color:#777;font-size:13px;margin:0 0 4px;">Or paste this link into your browser:</p>
        <p style="color:#555;font-size:12px;word-break:break-all;margin:0 0 20px;">${safeLink}</p>
        <p style="color:#999;font-size:12px;margin-top:24px;">
          If this was you, approve it there and the device will be trusted for 30 days. If it was
          not, deny it: every device will be signed out and you will choose a new password. The
          link expires in 15 minutes; if nobody acts, nothing happens and the sign-in fails.
        </p>
      </div>
    </div>
  `;
}
