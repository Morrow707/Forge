// Same plain-inline-style-HTML approach as welcome-email.ts/
// password-reset-email.ts -- no external CSS/images, so it renders
// consistently across mail clients.
import { escapeHtml } from "./email";

export function buildNewDeviceLoginEmail(input: {
  name: string;
  deviceLabel: string;
  location: string | null;
  when: Date;
}) {
  const firstName = escapeHtml(input.name.split(" ")[0] || input.name);
  const whenText = input.when.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">New login to your account</h1>
        <p style="color:#555;margin:0 0 20px;">
          Hi ${firstName}, your Forge account was just signed into from a device we haven't seen
          before:
        </p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:13px;color:#333;">
          <tr>
            <td style="padding:4px 0;color:#777;width:90px;">Device</td>
            <td style="padding:4px 0;">${escapeHtml(input.deviceLabel)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#777;">Location</td>
            <td style="padding:4px 0;">${escapeHtml(input.location ?? "Unknown")} (approximate)</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#777;">Time</td>
            <td style="padding:4px 0;">${escapeHtml(whenText)}</td>
          </tr>
        </table>
        <p style="color:#555;margin:0 0 20px;">
          If this was you, there's nothing else to do -- feel free to disregard this email.
        </p>
        <p style="color:#555;margin:0 0 20px;">
          If it wasn't, change your password right away and use "Where you're logged in" from
          your account menu to log that device out.
        </p>
        <p style="color:#999;font-size:12px;margin-top:24px;">Sent by Forge.</p>
      </div>
    </div>
  `;
}
