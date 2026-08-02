import { apiRequest } from "@/lib/queryClient";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getCurrentPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Asks for browser notification permission (if not already decided) and
 * subscribes this device to push, registering it server-side. Throws with
 * a user-facing message on denial/failure so the caller can toast it. */
export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error("Push notifications aren't supported in this browser.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was denied.");
  }
  const keyRes = await apiRequest("GET", "/api/push/vapid-public-key");
  const { publicKey } = await keyRes.json();
  if (!publicKey) {
    throw new Error("Push isn't configured on the server yet.");
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await apiRequest("POST", "/api/push/subscribe", subscription.toJSON());
  return subscription;
}

export async function unsubscribeFromPush() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiRequest("POST", "/api/push/unsubscribe", { endpoint });
}
