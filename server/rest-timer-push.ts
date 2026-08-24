import { sendPushToUser } from "./push";
import { storage } from "./storage";

// A client-side rest countdown runs on the page's own JS timers, which
// mobile browsers throttle or fully suspend once the tab is backgrounded or
// the phone is locked -- so the in-app full-screen alert and chime (see
// rest-timer.tsx) may just never fire if the athlete locks their phone
// mid-rest. A real push notification is delivered by the OS's push service,
// not this page's JS, so it still reaches the lock screen regardless. This
// is a plain in-memory setTimeout, not a durable job queue -- proportionate
// to what it's scheduling (a rest period is always a handful of minutes at
// most), and losing a pending one to a server restart just means one missed
// notification for an in-progress rest, not lost data.
const pending = new Map<number, ReturnType<typeof setTimeout>>();

/** Schedules a "rest over" push `seconds` from now for this athlete,
 * replacing any still-pending one -- starting or restarting a rest timer
 * should always supersede whatever was scheduled for a previous one, never
 * stack two notifications for the same athlete. */
export function scheduleRestOverPush(athleteId: number, seconds: number, url?: string) {
  cancelRestOverPush(athleteId);
  const timeout = setTimeout(async () => {
    pending.delete(athleteId);
    // Nothing awaits this callback's own promise (setTimeout can't), and
    // there's no global unhandledRejection handler in this app -- Node's
    // default since v15 is to crash the whole process on one. A transient
    // DB hiccup on getUnreadNotificationCount (the exact kind db.ts's own
    // 'error' listener exists to survive for idle clients) would otherwise
    // take the entire server down over one missed rest-timer push, which
    // is a wildly disproportionate failure mode -- worst case here should
    // be exactly that, one missed notification, never a full outage.
    try {
      const badge = await storage.getUnreadNotificationCount(athleteId);
      await sendPushToUser(athleteId, {
        title: "Rest Over",
        body: "Time to get back to it",
        url: url || "/",
        badge,
      });
    } catch (err) {
      console.error(`Rest-over push failed for athlete ${athleteId}:`, err);
    }
  }, seconds * 1000);
  pending.set(athleteId, timeout);
}

/** Cancels a pending push -- called when the athlete explicitly skips a
 * rest early, so they don't get a lock-screen notification minutes later
 * for a rest period they already moved on from. Deliberately NOT called
 * when the countdown just runs out normally: at that point the push is
 * scheduled to fire at essentially the same moment anyway, and that's
 * exactly the case (phone locked, page JS suspended) this exists for. */
export function cancelRestOverPush(athleteId: number) {
  const existing = pending.get(athleteId);
  if (existing) {
    clearTimeout(existing);
    pending.delete(athleteId);
  }
}
