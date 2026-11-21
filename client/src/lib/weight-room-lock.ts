/* The weight-room station lock (2026-11-21).
 *
 * A station is the COACH's session on a shared tablet, so while it is open the tablet must not be
 * a way into the coach's other screens. Opening a station records the team here; while a lock is
 * recorded, every signed-in screen on this device redirects back to the station
 * (WeightRoomLockGuard in App.tsx), and the only way out is the coach's password, checked by the
 * server (/api/coach/weight-room/unlock). This is a lock on the APP, not on the device: on a school
 * iPad, iOS Guided Access is what stops somebody leaving the browser, and the station page says so. */

export const WEIGHT_ROOM_LOCK_KEY = "forge:weight-room-station-lock";
export const STATION_PATH_PREFIX = "/coach/weight-room/station/";

/** Signed-in areas a locked tablet may not reach. Sign-in, the legal pages and the TV page stay
 * reachable, so a signed-out tablet is never trapped in a redirect loop. */
const LOCKED_AREAS = ["/coach", "/athlete", "/admin", "/guardian", "/documents"];

export function stationPath(teamId: number): string {
  return `${STATION_PATH_PREFIX}${teamId}`;
}

export function readStationLock(): number | null {
  try {
    const raw = localStorage.getItem(WEIGHT_ROOM_LOCK_KEY);
    const teamId = raw ? Number(raw) : NaN;
    return Number.isInteger(teamId) && teamId > 0 ? teamId : null;
  } catch {
    return null;
  }
}

export function setStationLock(teamId: number): void {
  try {
    localStorage.setItem(WEIGHT_ROOM_LOCK_KEY, String(teamId));
  } catch {
    // Storage blocked: the station still works, it just is not held to this device.
  }
}

export function clearStationLock(): void {
  try {
    localStorage.removeItem(WEIGHT_ROOM_LOCK_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Where a locked tablet must go instead of `location`, or null when it may stay. */
export function lockedRedirectFor(location: string, lockedTeamId: number | null): string | null {
  if (lockedTeamId == null) return null;
  if (location.startsWith(STATION_PATH_PREFIX)) return null;
  const inLockedArea = location === "/" || LOCKED_AREAS.some((p) => location === p || location.startsWith(`${p}/`));
  return inLockedArea ? stationPath(lockedTeamId) : null;
}
