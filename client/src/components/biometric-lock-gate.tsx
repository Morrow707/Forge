import { useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ForgeMark } from "@/components/forge-mark";
import {
  isBiometricLockSupported,
  isBiometricLockEnabled,
  authenticateWithBiometrics,
  BiometryError,
} from "@/lib/biometric-lock";

/**
 * Wraps the whole app. Starts locked whenever the setting is on (checked
 * fresh on mount so a toggle flipped in a previous session takes effect on
 * the very next cold launch), and re-locks on every resume-from-background
 * -- not just cold launch -- since "left the phone on the workout page
 * unlocked" is exactly the moment this exists to cover, not just app
 * startup.
 */
export function BiometricLockGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(() => isBiometricLockSupported() && isBiometricLockEnabled());
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a resume listener firing while an authenticate() call
  // from mount (or a previous resume) is still in flight -- iOS can fire
  // 'resume' right as the biometric prompt itself is dismissing.
  const authInFlightRef = useRef(false);

  async function tryUnlock() {
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    setAuthenticating(true);
    setError(null);
    try {
      await authenticateWithBiometrics();
      setLocked(false);
    } catch (err) {
      setLocked(true);
      setError(
        err instanceof BiometryError && err.code === "userCancel"
          ? null
          : "Authentication failed. Try again.",
      );
    } finally {
      authInFlightRef.current = false;
      setAuthenticating(false);
    }
  }

  useEffect(() => {
    if (!isBiometricLockSupported()) return;
    if (locked) tryUnlock();

    const listenerPromise = App.addListener("resume", () => {
      if (isBiometricLockEnabled()) {
        setLocked(true);
        tryUnlock();
      }
    });
    return () => {
      listenerPromise.then((h) => h.remove());
    };
    // Deliberately empty -- this wires up the resume listener once for the
    // component's lifetime; tryUnlock reads fresh state internally rather
    // than closing over anything that would need it to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <ForgeMark className="h-9 w-9" />
      </div>
      <div className="text-center">
        <h1 className="font-display text-2xl font-extrabold uppercase tracking-wider">
          Forge Locked
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authenticate to continue
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button size="lg" onClick={tryUnlock} disabled={authenticating} className="gap-2">
        <ScanFace className="h-5 w-5" />
        {authenticating ? "Authenticating…" : "Unlock"}
      </Button>
    </div>
  );
}
