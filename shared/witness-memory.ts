/** WHAT EVERY WITNESS HAS GOT RIGHT AND WRONG, PER LIFT, ON EVERY TAKE FILMED BESIDE THE SENSOR.
 *
 * Scott, 2026-11-12: "concerning the ai I want it to learn and get smarter ... get better at
 * object detecting, get better at detecting body and movement". Overwatch itself is a pure
 * function of one frame and keeps nothing (Rule #2: it owns no sensor and must not become one).
 * What CAN be remembered, without making the referee a player, is the record: for each lift, how
 * far each scale ruler, each 3D bone and the object detector sat from the sensor on every paired
 * take. This file is that record's arithmetic. It is a MECHANISM, so it is shared across every
 * lift; the numbers inside it are filed per lift and never pooled across lifts ("its own
 * numbers").
 *
 * It records and gates nothing (Rule #1): no take is refused and no number on a phone reads this.
 * The one consumer that may move a setting is shared/learned-ruler-trust.ts, and only through
 * its held-out test.
 *
 * Pure: no imports, so the server's export, a script and a test can all read it. */

/** One sensor-paired take, reduced to what each witness said against what the sensor required. */
export type WitnessTake = {
  readonly id: string;
  readonly lift: string;
  /** Each scale ruler that voted, as a signed per-cent error against the sensor's own scale. */
  readonly rulers: readonly { readonly source: string; readonly errorPct: number }[];
  /** Each 3D bone the take recorded, the same way. Empty when the export carried none. */
  readonly bones: readonly { readonly limb: string; readonly errorPct: number }[];
  /** What the object detector did on this take, or null when the export carried no telemetry. */
  readonly object: null | {
    readonly asked: string | null;
    readonly framesTracked: number;
    readonly framesWithObject: number;
    readonly framesLockHeld: number;
  };
};

export type WitnessStanding = {
  readonly takes: number;
  /** Median signed error: which way this witness leans on this lift. */
  readonly leanPct: number;
  /** Root-mean-square error about the sensor: lean and scatter together, the size of a miss. */
  readonly rmsPct: number;
  /** On how many takes this witness was the furthest from the sensor of those that voted. */
  readonly timesWorst: number;
};

export type ObjectStanding = {
  /** Takes whose export carried the detector's telemetry; the three counts below are of these. */
  readonly takesWithTelemetry: number;
  readonly asked: readonly string[];
  /** Takes on which the detector saw its object on at least one frame. */
  readonly takesSeen: number;
  /** Takes on which it held a lock on at least a tenth of the tracked frames. */
  readonly takesLocked: number;
  /** Takes, of ALL this lift's takes, on which an object of known size voted in the scale. */
  readonly takesVoted: number;
  /** Median share of tracked frames with a lock held, 0-1. */
  readonly medianLockShare: number;
};

export type LiftMemory = {
  readonly takes: number;
  readonly rulers: Readonly<Record<string, WitnessStanding>>;
  readonly bones: Readonly<Record<string, WitnessStanding>>;
  readonly object: ObjectStanding | null;
};

/** A lock held on fewer frames than this share of the take is a glimpse, not a witness. */
export const LOCKED_TAKE_MIN_SHARE = 0.1;

const DECIMALS = 1;
const SHARE_DECIMALS = 2;
const HALF = 2;
/** "Worst" needs something to be worse than: a lone witness is not the worst of one. */
const MIN_WITNESSES_TO_RANK = 2;
const round = (n: number, d = DECIMALS): number => Number(n.toFixed(d));

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / HALF);
  return s.length % HALF === 1 ? s[mid] : (s[mid - 1] + s[mid]) / HALF;
}

function standings(
  takes: readonly WitnessTake[],
  read: (t: WitnessTake) => readonly { name: string; errorPct: number }[],
): Record<string, WitnessStanding> {
  const perTake = takes.map(read);
  const errors = perTake
    .flat()
    .reduce<Record<string, number[]>>((acc, r) => ({ ...acc, [r.name]: [...(acc[r.name] ?? []), r.errorPct] }), {});
  const worst = perTake
    .filter((readings) => readings.length >= MIN_WITNESSES_TO_RANK)
    .map((readings) => readings.reduce((w, r) => (Math.abs(r.errorPct) > Math.abs(w.errorPct) ? r : w)).name)
    .reduce<Record<string, number>>((acc, name) => ({ ...acc, [name]: (acc[name] ?? 0) + 1 }), {});
  return Object.fromEntries(
    Object.keys(errors)
      .sort()
      .map((name) => {
        const e = errors[name];
        return [
          name,
          {
            takes: e.length,
            leanPct: round(median(e)),
            rmsPct: round(Math.sqrt(e.reduce((a, b) => a + b * b, 0) / e.length)),
            timesWorst: worst[name] ?? 0,
          },
        ];
      }),
  );
}

/** The one ruler that is an object of known size. A body ruler agrees with the other body rulers
 *  by construction (Rule #4); this is the witness that can contradict them. */
export const OBJECT_RULER = "plate";

function objectStanding(takes: readonly WitnessTake[]): ObjectStanding | null {
  const seen = takes.flatMap((t) => (t.object ? [t.object] : []));
  const takesVoted = takes.filter((t) => t.rulers.some((r) => r.source === OBJECT_RULER)).length;
  if (seen.length === 0 && takesVoted === 0) return null;
  const share = (o: NonNullable<WitnessTake["object"]>): number =>
    o.framesTracked > 0 ? o.framesLockHeld / o.framesTracked : 0;
  return {
    takesWithTelemetry: seen.length,
    asked: [...new Set(seen.map((o) => o.asked ?? "none"))].sort(),
    takesSeen: seen.filter((o) => o.framesWithObject > 0).length,
    takesLocked: seen.filter((o) => share(o) >= LOCKED_TAKE_MIN_SHARE).length,
    takesVoted,
    medianLockShare: seen.length > 0 ? round(median(seen.map(share)), SHARE_DECIMALS) : 0,
  };
}

/** The memory, one entry per lift, lifts in name order so the committed record diffs cleanly. */
export function buildWitnessMemory(takes: readonly WitnessTake[]): Record<string, LiftMemory> {
  const lifts = [...new Set(takes.map((t) => t.lift))].sort();
  return Object.fromEntries(
    lifts.map((lift) => {
      const mine = takes.filter((t) => t.lift === lift);
      return [
        lift,
        {
          takes: mine.length,
          rulers: standings(mine, (t) => t.rulers.map((r) => ({ name: r.source, errorPct: r.errorPct }))),
          bones: standings(mine, (t) => t.bones.map((b) => ({ name: b.limb, errorPct: b.errorPct }))),
          object: objectStanding(mine),
        },
      ];
    }),
  );
}

/** The witness that has missed by most on this lift, or null when fewer than two have a record.
 *  A sentence for the report, never a gate. */
export function leastReliableRuler(memory: LiftMemory): string | null {
  const entries = Object.entries(memory.rulers);
  if (entries.length < MIN_WITNESSES_TO_RANK) return null;
  return entries.reduce((w, e) => (e[1].rmsPct > w[1].rmsPct ? e : w))[0];
}
