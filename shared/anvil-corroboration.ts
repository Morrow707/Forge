/**
 * ITEM 3: WHAT THE ANVIL IS WILLING TO CALL A FINDING.
 *
 * Rule #4 applied to the Anvil. One witness is an assertion; a finding needs two. The camera
 * section of CLAUDE.md states it for sensors -- "a number corroborated by one system is not a
 * trusted number, it is an assertion" -- and the argument transfers exactly, because the Anvil's
 * three channels have the same failure mode the body rulers do: they can agree by construction.
 *
 * **THIS GOVERNS THE WEEKLY CLAIM AND NOTHING ELSE**, which is what Scott's decision of 2026-11-06
 * made possible. The daily surface shows the reading and its movement with no claim attached, so
 * the false-alarm arithmetic never reaches it; the weekly surface is the only one that says
 * something is wrong, so it is the only one that has to be right.
 *
 * MEASURED, not argued, by `tools/anvil-sim/items367.py` -- 3,000 pure-noise seasons against 3,000
 * seasons carrying a real 1.0-SD drop held three weeks, with per-channel availability of
 * 1.0 / 0.55 / 0.40 (the fast channel is the check itself; the slow one needs a filmed lift; the
 * career one needs a test that season):
 *
 *     rule                            z     false weeks   caught    caught/false
 *     any one channel               2.0          6.6%      99.1%          14.9
 *     any one channel               3.0          0.3%      72.8%         218.3
 *     two of three                  2.0          0.1%      74.6%        1119.0
 *     two of three                  2.5          0.0%      37.5%             --
 *
 * **Two of three at 2.0 dominates one channel at 3.0 on BOTH axes** -- it catches slightly more
 * (74.6% against 72.8%) while firing a third as often (0.1% against 0.3%). That is the whole case,
 * and it is the comparison an unmatched test would have got wrong: against one channel at the SAME
 * threshold, corroboration looks like a 25-point loss of detection.
 *
 * **AND A LONE-WITNESS ESCAPE HATCH WAS MEASURED AND REJECTED.** The obvious kindness -- let a
 * single channel fire if it clears a higher bar, for the athlete whose other two are absent -- adds
 * false weeks (1.5% against 1.1% at z = 1.5) and adds no detection anybody can measure (73.1%
 * against 74.6% at z = 2.0, inside the noise of 3,000 runs). It is not in the rule.
 *
 * SO AN ATHLETE WHOSE CHANNELS ARE ABSENT GETS NO WEEKLY CLAIM, AND THAT IS THE DESIGN. It is
 * Rule #1's shape rather than a refusal: their daily readings are still shown, still trended, still
 * theirs. What is withheld is Forge asserting something about them on one witness -- and
 * `CannotJudge` carries the reason, so "nothing was wrong" and "nothing could be judged" are never
 * the same blank. That distinction is the one the 2026-10-04 box jump lost.
 */

export type AnvilChannelName = "fast" | "slow" | "career";

/** One channel's weekly evidence, or why it has none. */
export type ChannelWeek =
  | { readonly channel: AnvilChannelName; readonly z: number }
  | { readonly channel: AnvilChannelName; readonly absent: string };

/** The z a channel must reach to count as a witness. Measured above. */
export const CORROBORATION_Z = 2.0;

/** How many channels must agree before the Anvil will say anything. */
export const WITNESSES_REQUIRED = 2;

export type WeeklyVerdict =
  | { readonly kind: "finding"; readonly witnesses: readonly AnvilChannelName[]; readonly z: number }
  | { readonly kind: "quiet"; readonly witnesses: readonly AnvilChannelName[] }
  | { readonly kind: "cannot_judge"; readonly reason: string; readonly available: number };

/**
 * The weekly claim. Three outcomes and never two: a finding, a quiet week, or an honest inability
 * to judge -- which is NOT the same as quiet and must never be drawn as it.
 */
export function weeklyVerdict(weeks: readonly ChannelWeek[]): WeeklyVerdict {
  const present = weeks.filter((w): w is Extract<ChannelWeek, { z: number }> => "z" in w);
  const witnesses = present.filter((w) => w.z >= CORROBORATION_Z);
  if (witnesses.length >= WITNESSES_REQUIRED) {
    return {
      kind: "finding",
      witnesses: witnesses.map((w) => w.channel),
      // The weakest witness, never the strongest: a finding is only as good as the second channel
      // that carries it, and reporting the max would let one loud channel set the number.
      z: Math.min(...witnesses.map((w) => w.z)),
    };
  }
  if (present.length < WITNESSES_REQUIRED) {
    const missing = weeks.filter((w) => "absent" in w) as Extract<ChannelWeek, { absent: string }>[];
    return {
      kind: "cannot_judge",
      reason:
        missing.map((m) => `${m.channel}: ${m.absent}`).join("; ") ||
        "fewer channels than the rule requires",
      available: present.length,
    };
  }
  return { kind: "quiet", witnesses: witnesses.map((w) => w.channel) };
}
