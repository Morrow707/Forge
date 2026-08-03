import { storage } from "./storage";
import { sendPushToUser } from "./push";
import { sendEmail } from "./email";

/** The one place all three notification channels (in-app inbox, push, email)
 * fan out from, so every targeted event -- a comment reply, a team
 * announcement -- reaches a user everywhere they've asked to be reached.
 * Email is opt-in per user (notifyEmail) and silently no-ops if Resend
 * isn't configured, matching the push pattern in push.ts. */
export async function notifyUser(
  userId: number,
  type: string,
  title: string,
  body: string,
  link: string,
  // Announcements already push through regardless of prefs (see the team
  // board route) -- bypassEmail extends that same emergency-reach intent to
  // email, since an athlete without push enabled would otherwise have no
  // way to be reached at all.
  { bypassEmailPref = false }: { bypassEmailPref?: boolean } = {},
) {
  await storage.createNotification(userId, type, title, body, link);
  await sendPushToUser(userId, { title, body, url: link });

  const user = await storage.getUser(userId);
  if (user && (user.notifyEmail || bypassEmailPref)) {
    await sendEmail({
      to: user.email,
      subject: title,
      html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;">${body}</p><p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#777;">Open Forge to see more.</p>`,
    });
  }
}
