import { storage } from "./storage";
import { sendPushToUser } from "./push";
import { sendEmail, escapeHtml } from "./email";
import { categoryForNotificationType } from "@shared/notification-categories";

/** The one place all three notification channels (in-app inbox, push, email)
 * fan out from, so every targeted event -- a comment reply, a team
 * announcement -- reaches a user everywhere they've asked to be reached.
 * Email is opt-in per user (notifyEmail) and silently no-ops if Resend
 * isn't configured, matching the push pattern in push.ts. Push itself is
 * gated per-category (see shared/notification-categories.ts) -- a type with
 * no category mapping always pushes, same "unmapped means don't touch it"
 * posture as an unset category key meaning "on." */
export async function notifyUser(
  userId: number,
  type: string,
  title: string,
  body: string,
  link: string,
  // Announcements already push through regardless of prefs (see the team
  // board route) -- bypassEmail extends that same emergency-reach intent to
  // email, since an athlete without push enabled would otherwise have no
  // way to be reached at all; bypassPushCategoryPref extends it to push
  // itself, so muting "Team & Coach" still lets a "practice moved"
  // announcement through. skipEmail is the opposite override: for routine,
  // high-frequency events (a regular team board post) email would be noisy
  // regardless of the user's own preference, so this suppresses it
  // unconditionally rather than asking notifyEmail to decide.
  {
    bypassEmailPref = false,
    bypassPushCategoryPref = false,
    skipEmail = false,
  }: { bypassEmailPref?: boolean; bypassPushCategoryPref?: boolean; skipEmail?: boolean } = {},
) {
  await storage.createNotification(userId, type, title, body, link);
  // Counted after creating this notification, so the badge iOS shows on the
  // app icon always reflects what the notification/inbox screen will show
  // once opened, not what it was a moment ago.
  const badge = await storage.getUnreadNotificationCount(userId);

  const user = await storage.getUser(userId);
  const category = categoryForNotificationType(type);
  const pushAllowed =
    bypassPushCategoryPref ||
    !category ||
    user?.pushNotificationCategoryPrefs?.[category] !== false;
  if (pushAllowed) {
    await sendPushToUser(userId, { title, body, url: link, badge });
  }

  if (!skipEmail && user && (user.notifyEmail || bypassEmailPref)) {
    // `body` frequently embeds a coach/athlete's own display name and
    // free-typed comment text (see the workout-comment routes) -- unescaped,
    // either could carry markup that renders as part of a real
    // transactional email sent from Forge's own domain, same risk
    // escapeHtml already guards against in welcome-email.ts/progress-report.ts.
    await sendEmail({
      to: user.email,
      subject: title,
      html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;">${escapeHtml(body)}</p><p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#777;">Open Forge to see more.</p>`,
    });
  }
}
