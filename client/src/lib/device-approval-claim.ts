/** ONE CLAIM PER POLL TOKEN, FOR THE LIFE OF THE PAGE.
 *
 * `POST /api/auth/device-approval/complete` spends an approval exactly once
 * (`consumeApproval`), so a second attempt on the same token is a 409 and a
 * fiftieth is a 429. On 2026-10-29 a phone sent about fifty of them in one
 * second after approving a new device from the email -- one 200, then 409s,
 * then 429s, then the error screen (read off the Render log, 19:46:45).
 *
 * The claim was guarded by a `useState` inside `DeviceApprovalStep`, and that
 * is the defect: the guard's lifetime was the COMPONENT's and the fact it
 * records is the TOKEN's. A guard in component state is reset by every
 * remount, and the status query's "approved" is still CACHED on a remount, so
 * each remount claims again with no network round trip in between -- which is
 * how fifty of them fit inside one second. The burst needs a parent that
 * remounts the step repeatedly; that oscillation has NOT been reproduced here
 * (it did not occur in a real browser driving the real route, and the one
 * reload Scott did was enough to clear it), so the guard is made structural
 * rather than waited for -- the same argument `wait-for-email.ts` records: the
 * evidence that you need a structural guard is nearly undetectable by running
 * the flow.
 *
 * Deliberately a module-level set and NOT a ref: a ref dies with the mount,
 * which is exactly the lifetime that was wrong. It is also deliberately
 * UNBOUNDED -- one page load mints a handful of poll tokens at most (one per
 * sign-in attempt, one per resend) and the set dies with the page, while any
 * cap would make an evicted token claimable again, which is the hole this
 * exists to close.
 *
 * There is no release. A claim that the server ANSWERED has spent the
 * approval, 409 included; a claim that never reached it leaves the approval
 * unspent, but re-firing from here on a transport failure is how a tight
 * retry loop gets written, and the step already offers the way out that does
 * work -- "Send the email again" mints a fresh approval and a fresh token. */
const claimedPollTokens = new Set<string>();

/** True the first time this token is claimed, false every time after.
 * Call it in the `if` that decides whether to send the claim, never beside one. */
export function beginDeviceApprovalClaim(pollToken: string): boolean {
  if (!pollToken || claimedPollTokens.has(pollToken)) return false;
  claimedPollTokens.add(pollToken);
  return true;
}

/** Whether this token's claim has already been sent. Reading only; it never marks. */
export function deviceApprovalClaimWasSent(pollToken: string): boolean {
  return claimedPollTokens.has(pollToken);
}

/** Tests only -- the set is module state and would otherwise leak between cases. */
export function forgetDeviceApprovalClaimsForTests(): void {
  claimedPollTokens.clear();
}
