import { storage } from "./storage";
import { sendPushToUser, pushEnabled } from "./push";
import { apnsEnabled } from "./apns";
import { sendEmail, escapeHtml, emailEnabled } from "./email";
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
  // Whether anything actually reached a device or an inbox. Callers that
  // only want the in-app notification can ignore it; the retention jobs
  // cannot, because they start a seven-day deletion clock on the strength
  // of having warned someone, and this used to return void -- sendEmail
  // reports failure by returning rather than throwing, and the push helpers
  // swallow per-device errors, so notifyUser could not fail no matter what
  // happened downstream.
  // Whether a channel was even available to try, as opposed to tried and
  // failed. The two look identical from `delivered` alone, and callers that
  // gate on it need to tell them apart: a transient push failure is worth
  // retrying tomorrow, but a deployment with no VAPID/APNs keys and no
  // Resend key -- or an athlete with no push subscription who has email
  // switched off -- will never succeed, and retrying forever means the
  // caller never makes progress.
  let attempted = false;

  let pushDelivered = false;
  if (pushAllowed) {
    if (pushEnabled || apnsEnabled) attempted = true;
    pushDelivered = await sendPushToUser(userId, { title, body, url: link, badge });
  }

  let emailDelivered = false;
  if (!skipEmail && user && (user.notifyEmail || bypassEmailPref)) {
    if (emailEnabled) attempted = true;
    // `body` frequently embeds a coach/athlete's own display name and
    // free-typed comment text (see the workout-comment routes) -- unescaped,
    // either could carry markup that renders as part of a real
    // transactional email sent from Forge's own domain, same risk
    // escapeHtml already guards against in welcome-email.ts/progress-report.ts.
    const result = await sendEmail({
      to: user.email,
      subject: title,
      html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;">${escapeHtml(body)}</p><p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#777;">Open Forge to see more.</p>`,
    });
    emailDelivered = result.sent;
  }
  // The in-app notification row is deliberately NOT counted as reaching
  // anyone. It always succeeds, and an athlete who has stopped opening the
  // app is exactly the population the stale-account sweep is about.
  return { delivered: pushDelivered || emailDelivered, attempted, pushDelivered, emailDelivered };
}
