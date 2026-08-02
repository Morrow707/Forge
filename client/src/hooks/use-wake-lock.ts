import { useEffect, useRef } from "react";

/** Keeps the screen from sleeping while `active` is true (e.g. during a live
 * workout logging session). The OS releases a wake lock automatically when
 * the tab loses visibility, so it's re-acquired on visibilitychange while
 * still active. No-ops entirely on browsers without the API. */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let cancelled = false;
    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release();
          return;
        }
        lockRef.current = lock;
      } catch {
        // Can be denied (e.g. low battery) -- session still works, the
        // screen just might time out.
      }
    }
    acquire();

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !lockRef.current) {
        acquire();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lockRef.current?.release();
      lockRef.current = null;
    };
  }, [active]);
}
