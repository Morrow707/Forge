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
export async function sendPushToUser(
  userId: number,
  payload: { title: string; body: string; url?: string },
) {
  await Promise.all([sendWebPushToUser(userId, payload), sendApnsToUser(userId, payload)]);
}

async function sendWebPushToUser(
  userId: number,
  payload: { title: string; body: string; url?: string },
) {
  if (!pushEnabled) return;
  const subs = await storage.getPushSubscriptionsForUser(userId);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await storage.removePushSubscription(sub.endpoint);
        } else {
          console.error("Push send failed:", err?.message || err);
        }
      }
    }),
  );
}
