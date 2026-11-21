/** Pulls every connected device every ten minutes (2026-11-21). The work is
 * `syncAllConnections` in server/device-integrations.ts, which records a failure on the
 * connection it belongs to and never throws; the coach's "Sync now" button calls the same
 * `syncConnection` for one connection.
 *
 * Through the advisory job lock like every job here, so two instances up during a deploy do not
 * pull the same vendor twice (they could not double-store -- the unique index forbids it -- but
 * they would spend the vendor's rate limit twice). */
import { runWithJobLock } from "./job-lock";
import { reportJobFailure } from "./job-errors";

export const DEVICE_SYNC_JOB = "device-integrations-sync";
const MINUTES = 10;
const MS_PER_MINUTE = 60_000;
export const DEVICE_SYNC_INTERVAL_MS = MINUTES * MS_PER_MINUTE;

export async function runDeviceSync() {
  try {
    const { syncAllConnections } = await import("./device-integrations");
    return await syncAllConnections();
  } catch (err) {
    reportJobFailure(DEVICE_SYNC_JOB, err);
    return { connections: 0, stored: 0, failed: 0 };
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startDeviceSyncJob(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runWithJobLock(DEVICE_SYNC_JOB, runDeviceSync);
  }, DEVICE_SYNC_INTERVAL_MS);
  timer.unref?.();
}
