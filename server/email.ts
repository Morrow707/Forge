// The HTML email builders (welcome-email.ts, progress-report.ts, etc)
// interpolate free-text fields a coach or athlete entered themselves --
// display name, sport/position, exercise names -- directly into HTML
// strings. Without escaping, any of those could carry markup that renders
// as part of a real transactional email sent from Forge's own domain to
// another real user (e.g. a coach's display name rendering a phishing
// link inside the welcome email their invited athletes receive).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.RESEND_FROM_EMAIL || "Forge <onboarding@resend.dev>";

// Resend's free tier needs nothing but an API key -- no SMTP setup. Configured
// lazily so a deployment without the key set yet degrades to "sending
// silently does nothing" rather than crashing the whole server, matching the
// VAPID/push pattern in push.ts.
export const emailEnabled = Boolean(apiKey);
if (!emailEnabled) {
  console.warn("Email sending disabled: RESEND_API_KEY not set.");
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!emailEnabled) return { sent: false, error: "not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Resend send failed:", res.status, body);
      return { sent: false, error: "send_failed" };
    }
    return { sent: true };
  } catch (err: any) {
    console.error("Resend send failed:", err?.message || err);
    return { sent: false, error: "send_failed" };
  }
}
