import { Capacitor } from "@capacitor/core";
import { BiometricAuth, BiometryError } from "@aparajita/capacitor-biometric-auth";

// App-lock, not credential autofill: the app already stays signed in via
// its session cookie (WKWebView persists cookies across launches same as
// any native app), so there's no stored password to hand back -- Face ID/
// Touch ID instead gates *seeing* an already-authenticated session, which
// is what actually matters for a coaching app holding athlete health data
// on a phone that might be picked up unlocked. Opt-in and off by default
// (see the checkbox in NotificationSettingsDialog) since turning on a lock
// screen nobody asked for is a hostile surprise, not a nice-to-have.
const STORAGE_KEY = "forge-biometric-lock-enabled";

export function isBiometricLockSupported() {
  return Capacitor.isNativePlatform();
}

export function isBiometricLockEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function setBiometricLockEnabled(enabled: boolean) {
  if (enabled) {
    localStorage.setItem(STORAGE_KEY, "1");
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export async function checkBiometryAvailable(): Promise<boolean> {
  if (!isBiometricLockSupported()) return false;
  try {
    const result = await BiometricAuth.checkBiometry();
    return result.isAvailable;
  } catch {
    return false;
  }
}

/** Throws a BiometryError on failure/cancellation -- callers decide how to
 * present that (retry button, stay locked, etc), never automatically fall
 * back to "unlocked" just because the prompt didn't succeed. */
export async function authenticateWithBiometrics(): Promise<void> {
  await BiometricAuth.authenticate({
    reason: "Unlock Forge",
    cancelTitle: "Cancel",
    // No device-passcode fallback -- if biometrics fail, the app stays
    // locked and offers its own Retry button rather than handing the OS
    // its own separate passcode challenge, keeping the single lock screen
    // as the one consistent recovery path.
    allowDeviceCredential: false,
  });
}

export { BiometryError };
