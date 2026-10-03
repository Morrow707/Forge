import { recordSystemFailure, recordSystemSuccess } from "./system-events";
import { applyEmailBranding, brandedFromAddress, type EmailBrand } from "./email-branding";

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
    "Email sending is using Resend's SANDBOX address (RESEND_FROM_EMAIL not set), " +
      "emails to any address other than this Resend account's own verified email will silently fail to deliver. " +
      "Verify a domain in Resend and set RESEND_FROM_EMAIL before relying on guardian-invite or other real recipient emails.",
  );
}

/** Only populated under vitest (NODE_ENV=test) with no Resend key -- see sendEmail. */
export const testOutbox: { to: string; subject: string; html: string; from?: string }[] = [];

export function isEmailConfigured(): boolean {
  return emailEnabled || process.env.NODE_ENV === "test";
}

export async function sendEmail({
  to,
  subject,
  html: rawHtml,
  brandForUserId,
  brand: brandOverride,
}: {
  to: string;
  subject: string;
  html: string;
  /** The email wears the program this user belongs to (see email-branding.ts). An athlete's
   * coach, a guardian's child's coach, a coach's own org. Looked up here so a call site names
   * the person and nothing else; a lookup that fails sends the plain email rather than none. */
  brandForUserId?: number | null;
  /** The brand itself, for a caller that already has it (the Branding page's test send). */
  brand?: EmailBrand | null;
}): Promise<{ sent: boolean; error?: string }> {
  let brand: EmailBrand | null = brandOverride ?? null;
  if (!brand && brandForUserId != null) {
    try {
      // Dynamic: storage imports sendEmail, so a static import here would be a cycle.
      const { storage } = await import("./storage");
      brand = (await storage.getEffectiveBrandingForUser(brandForUserId)) as EmailBrand | null;
    } catch (err) {
      console.warn("Email branding lookup failed; sending unbranded:", (err as Error)?.message);
    }
  }
  const html = applyEmailBranding(rawHtml, brand);
  const from = brandedFromAddress(fromAddress, brand);
  if (!emailEnabled) {
    // Under vitest nothing is configured and nothing should leave the
    // process -- but a test of a flow that RUNS on an email (the
    // new-device approval link, for one) has to be able to read what would
    // have been sent. Captured as if delivered, so the code under test
    // takes its real "sent" branch.
    if (process.env.NODE_ENV === "test") {
      testOutbox.push({ to, subject, html, from });
      if (testOutbox.length > 50) testOutbox.shift();
      return { sent: true };
    }
    return { sent: false, error: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Resend send failed:", res.status, body);
      recordSystemFailure("email", `Resend rejected a send with HTTP ${res.status}`, {
        detail: body.slice(0, 500),
      });
      return { sent: false, error: "send_failed" };
    }
    // A success clears the badge: the provider is demonstrably working
    // again, which is stronger evidence than any timeout would be.
    recordSystemSuccess("email");
    return { sent: true };
  } catch (err: any) {
    console.error("Resend send failed:", err?.message || err);
    recordSystemFailure("email", "Could not reach Resend to send email", { detail: err });
    return { sent: false, error: "send_failed" };
  }
}
