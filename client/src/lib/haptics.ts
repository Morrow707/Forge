import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// Thin wrapper so every call site can fire-and-forget without checking
// platform or wrapping in try/catch itself -- no-ops on web (and swallows
// any native failure) since haptics are a nice-to-have polish layer, never
// something a feature should depend on succeeding.
const isNative = Capacitor.isNativePlatform();

export function hapticLight() {
  if (!isNative) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

export function hapticMedium() {
  if (!isNative) return;
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
}

export function hapticSuccess() {
  if (!isNative) return;
  Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}

export function hapticWarning() {
  if (!isNative) return;
  Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
}
