// Same plain-inline-style-HTML approach as progress-report.ts's own comment
// explains -- no external CSS/images, so it renders consistently across mail
// clients.
import { escapeHtml } from "./email";

export function buildWelcomeEmail(
  user: { name: string; role: "coach" | "athlete" | "admin" | "guardian" },
  coachName: string | null,
) {
  const firstName = escapeHtml(user.name.split(" ")[0] || user.name);

  const body =
    user.role === "coach"
      ? `<p style="margin:0 0 16px;">Start by building out your <strong>exercise bank</strong>, then put together a program and assign it to your roster -- athletes' calendars stay in sync automatically with whatever you schedule.</p>`
      : coachName
        ? `<p style="margin:0 0 16px;">You're connected with <strong>${escapeHtml(coachName)}</strong>. Whatever they assign will show up on your calendar automatically -- no extra setup needed on your end.</p>`
        : `<p style="margin:0 0 16px;">You're training on your own for now, with full access to Forge's AI program builder to put together your own plan. If you join a coach later using their invite code, everything you've logged stays right where it is.</p>`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">Welcome, ${firstName}</h1>
        <p style="color:#555;margin:0 0 20px;">Your account is ready to go.</p>
        ${body}
        <p style="color:#999;font-size:12px;margin-top:24px;">Sent by Forge.</p>
      </div>
    </div>
  `;
}
