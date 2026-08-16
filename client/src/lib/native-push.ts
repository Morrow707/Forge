import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token, type ActionPerformed } from "@capacitor/push-notifications";
import { apiRequest } from "@/lib/queryClient";

// Native-app twin of push.ts (Web Push) -- same "request permission,
// register, POST the resulting identifier to the server" shape, but APNs
// hands back a device token asynchronously via an event instead of
// returning a PushSubscription object directly from subscribe().
const DEVICE_TOKEN_KEY = "forge-apns-device-token";

export function isNativePushSupported() {
  return Capacitor.isNativePlatform();
}

/**
 * Called once at native startup (see native-bootstrap.ts). Wires the two
 * listeners @capacitor/push-notifications needs for its async flow: the
 * device token from register() arrives later as a 'registration' event, and
 * a tapped notification arrives as 'pushNotificationActionPerformed' --
 * mirroring sw.ts's notificationclick handler, but for a native shell that
 * only ever has the one window, a hard navigation to the target path is the
 * direct equivalent of the service worker's clients.openWindow(url).
 */
export function initNativePush() {
  if (!isNativePushSupported()) return;

  PushNotifications.addListener("registration", (token: Token) => {
    localStorage.setItem(DEVICE_TOKEN_KEY, token.value);
    apiRequest("POST", "/api/push/subscribe-apns", { deviceToken: token.value }).catch(() => {
      // Best-effort -- if this fails the athlete can retoggle push in
      // Notification Settings to retry.
    });
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.error("Native push registration failed:", err);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
    const url = (action.notification.data?.url as string) || "/";
    window.location.href = url;
  });

  // APNs device tokens can rotate (OS update, reinstall, restore from
  // backup), so re-register silently on every cold start when permission
  // was already granted, keeping the server's token current without
  // asking the athlete again.
  PushNotifications.checkPermissions().then((status) => {
    if (status.receive === "granted") void PushNotifications.register();
  });
}

export async function getNativePushPermissionGranted() {
  if (!isNativePushSupported()) return false;
  const status = await PushNotifications.checkPermissions();
  return status.receive === "granted";
}

/** Asks for the native notification permission (if not already decided) and
 * registers this device for push. Throws with a user-facing message on
 * denial/failure so the caller can toast it, matching subscribeToPush(). */
export async function subscribeToNativePush() {
  if (!isNativePushSupported()) {
    throw new Error("Native push isn't supported on this device.");
  }
  const status = await PushNotifications.requestPermissions();
  if (status.receive !== "granted") {
    throw new Error("Notification permission was denied.");
  }
  await PushNotifications.register();
}

/**
 * iOS gives apps no API to revoke a notification permission it already
 * granted -- only the athlete can do that in system Settings. This removes
 * the device token from the server so nothing gets sent to it anymore,
 * which is the practical effect the toggle promises even though the OS
 * permission itself stays granted underneath.
 */
export async function unsubscribeFromNativePush() {
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!deviceToken) return;
  await apiRequest("POST", "/api/push/unsubscribe-apns", { deviceToken });
  localStorage.removeItem(DEVICE_TOKEN_KEY);
}
