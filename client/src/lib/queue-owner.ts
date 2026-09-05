/** Who queued the offline work currently sitting on this device.
 *
 * The offline log queue and the offline video queue both live in
 * localStorage, which is per-device, not per-account. Neither was cleared or
 * scoped at logout, so on a shared device -- and the Family plan explicitly
 * covers three athletes -- one athlete's queued work would flush under the
 * next athlete's session. The two failed differently and neither failed
 * well: a log is refused by the server (it scopes the assignment) and then
 * dropped as a permanent rejection, losing the first athlete's workout and
 * telling the second one about a workout that was never theirs; a video
 * upload SUCCEEDS, is recorded as the second athlete's file, fails only at
 * the attach step, and lands in their Video Bank.
 *
 * Clearing both queues at logout would have been simpler and worse -- that
 * is somebody's unsynced workout, deleted because they signed out. So
 * entries are stamped with their owner instead and simply wait: they flush
 * when that athlete signs back in on this device.
 */
let currentUserId: number | null = null;

export function setQueueOwner(userId: number | null): void {
  currentUserId = userId;
}

export function getQueueOwner(): number | null {
  return currentUserId;
}

/** Whether a queued entry may be sent under the session that is signed in
 * right now.
 *
 * An entry with no owner is one queued before this stamping existed. It is
 * allowed through rather than stranded: the alternative silently abandons
 * work already on real devices, and the pre-existing behaviour for those
 * entries is exactly what it was before. New entries are always stamped, so
 * that tolerance ages out on its own.
 */
export function belongsToCurrentUser(ownerId: number | null | undefined): boolean {
  if (ownerId == null) return true;
  return ownerId === currentUserId;
}
