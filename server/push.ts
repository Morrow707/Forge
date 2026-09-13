import webpush from "web-push";
import { storage } from "./storage";
import { sendApnsToUser } from "./apns";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:support@forge.app";

// No paid provider needed -- Web Push is free, just needs a VAPID keypair.
// Configured lazily so a deployment without the env vars set yet degrades
// to "push silently does nothing" rather than crashing the whole server.
export const pushEnabled = Boolean(publicKey && privateKey);
if (pushEnabled) {
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
} else {
  console.warn(
    "Push notifications disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set.",
  );
}

export function getVapidPublicKey() {
  return publicKey ?? null;
}

// Sends to every device the user has enabled push on -- both the browser
// (Web Push) and the native app (APNs), fanned out in parallel so callers
// don't need to know or care which transport(s) actually apply to this
// user. A subscription/token the push service reports as gone (410 Gone /
// 404) is removed so it's not retried forever.
// Reports each transport's own outcome rather than folding them into one
// boolean. This used to return a single `web || apns` flag, and notify.ts
// recorded that flag as one "push" delivery attempt regardless of which
// transport(s) were actually configured or tried -- so an APNs-only
// deployment (or one where every native token had gone stale) attributed
// native-push failures to the Web Push badge on the admin dashboard, and a
// working web subscription could mask a broken native one under the same
// combined "success". Handing back both halves lets the caller count and
// report each channel against its own badge.
export async function sendPushToUser(
  userId: number,
  payload: { title: string; body: string; url?: string; badge?: number },
): Promise<{ web: boolean; apns: boolean }> {
  const [web, apns] = await Promise.all([
    sendWebPushToUser(userId, payload),
    sendApnsToUser(userId, payload),
  ]);
  return { web, apns };
}

async function sendWebPushToUser(
  userId: number,
  payload: { title: string; body: string; url?: string },
): Promise<boolean> {
  if (!pushEnabled) return false;
  const subs = await storage.getPushSubscriptionsForUser(userId);
  const results = await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        return true;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await storage.removePushSubscription(sub.userId, sub.endpoint);
        } else {
          console.error("Push send failed:", err?.message || err);
        }
        return false;
      }
    }),
  );
  return results.some(Boolean);
}
