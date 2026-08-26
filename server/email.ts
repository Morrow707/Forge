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
const SANDBOX_FROM_ADDRESS = "Forge <onboarding@resend.dev>";
const fromAddress = process.env.RESEND_FROM_EMAIL || SANDBOX_FROM_ADDRESS;

// Resend's free tier needs nothing but an API key -- no SMTP setup. Configured
// lazily so a deployment without the key set yet degrades to "sending
// silently does nothing" rather than crashing the whole server, matching the
// VAPID/push pattern in push.ts.
export const emailEnabled = Boolean(apiKey);
if (!emailEnabled) {
  console.warn("Email sending disabled: RESEND_API_KEY not set.");
} else if (fromAddress === SANDBOX_FROM_ADDRESS) {
  // A real API key with the sandbox from-address is the dangerous middle
  // state: sendEmail() looks like it's working (no startup error, no crash)
  // but Resend's sandbox only delivers to the Resend account's own verified
  // email -- every other recipient gets a 403 back from Resend, logged
  // per-send as "Resend send failed" below and otherwise invisible, since
  // every caller in this app treats email as fire-and-forget. That silently
  // breaks the guardian-invite/parental-notice email specifically (real
  // parents never receive it) without breaking signup or anything else a
  // developer would notice. Verify a sending domain in Resend and set
  // RESEND_FROM_EMAIL to fix -- see render.yaml's own comment on this var.
  console.warn(
    "Email sending is using Resend's SANDBOX address (RESEND_FROM_EMAIL not set) -- " +
      "emails to any address other than this Resend account's own verified email will silently fail to deliver. " +
      "Verify a domain in Resend and set RESEND_FROM_EMAIL before relying on guardian-invite or other real recipient emails.",
  );
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
