/**
 * Population norms, and the rules that decide whether one may be used.
 *
 * WHAT THIS IS FOR
 *
 * A number on its own is not coaching. "Peak velocity 0.72 on a squat" means
 * nothing to a coach; "around the fortieth percentile for linemen his age"
 * is a judgement they can act on. Until now every such comparison in Forge
 * came from the model's own general knowledge or a table printed years ago.
 *
 * These norms come from the athletes actually in Forge, recomputed nightly
 * from live ages. That last part is what makes it a living reference rather
 * than a snapshot: an athlete moves cohorts on their birthday, this year's
 * fifteens become next year's sixteens carrying their own numbers with them,
 * and nobody maintains a table.
 *
 * THREE RULES THAT DECIDE WHETHER IT IS HONEST
 *
 * 1. A floor. Eleven linemen is not a percentile. Below the floor the cohort
 *    widens -- position drops first, then age band, then sport -- until
 *    there are enough athletes to say anything. A norm that cannot be widened
 *    far enough is withheld rather than reported thin.
 * 2. Provenance travels with the number. An answer built on 340 athletes and
 *    one built on 22 read identically unless the count is on the page, and a
 *    coach making a return-to-play call deserves to know which.
 * 3. The population is named for what it is. Forge's athletes are not a
 *    random sample of American sixteen year olds; they are the ones whose
 *    coach bought this software and who film their lifts. Every rendering
 *    says so.
 */

/**
 * The minimum cohort a norm may be computed from.
 *
 * Higher than the in-app suppression floor of 5 on purpose. Five is enough
 * to stop a chart identifying somebody; it is nowhere near enough to make a
 * percentile mean anything. These answer different questions and should not
 * be tidied into one constant.
 */
export const NORM_MIN_COHORT = 30;

/** Cohort dimensions, in the order they are dropped when a group is too thin. */
export const NORM_WIDENING_ORDER = ["position", "ageBand", "sport"] as const;

export type NormDimension = (typeof NORM_WIDENING_ORDER)[number];

export type CohortKey = {
  sport: string | null;
  position: string | null;
  ageBand: string | null;
  gender: string | null;
};

export type Norm = {
  metric: string;
  unit: string;
  n: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

/** Five-year bands. Narrow enough to matter, wide enough to fill. */
export function ageBandFor(age: number | null | undefined): string | null {
  if (age == null || age < 8 || age > 60) return null;
  if (age <= 13) return "12-13";
  if (age <= 15) return "14-15";
  if (age <= 17) return "16-17";
  if (age <= 19) return "18-19";
  if (age <= 24) return "20-24";
  return "25+";
}

export function cohortLabel(key: CohortKey): string {
  const parts = [
    key.ageBand,
    key.gender && key.gender !== "prefer_not_to_say" ? key.gender.replace(/_/g, " ") : null,
    key.sport,
    key.position,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "all athletes";
}

/**
 * Where a value sits in a norm, as a percentile band.
 *
 * Bands rather than an exact percentile, because the underlying sample does
 * not support that precision and a figure like "43rd percentile" invites a
 * confidence the data has not earned.
 */
export function percentileBand(value: number, norm: Norm, higherIsBetter = true): string {
  const below = [
    { at: norm.p10, label: "bottom 10%" },
    { at: norm.p25, label: "bottom quarter" },
    { at: norm.p50, label: "below the middle" },
    { at: norm.p75, label: "above the middle" },
    { at: norm.p90, label: "top quarter" },
  ];
  let label = "top 10%";
  for (const step of below) {
    if (value <= step.at) {
      label = step.label;
      break;
    }
  }
  if (higherIsBetter) return label;
  // For a metric where lower is better -- a 40 time, an agility split -- the
  // same arithmetic reads backwards, so the band is mirrored rather than the
  // comparison being rewritten at every call site.
  const mirrored: Record<string, string> = {
    "bottom 10%": "top 10%",
    "bottom quarter": "top quarter",
    "below the middle": "above the middle",
    "above the middle": "below the middle",
    "top quarter": "bottom quarter",
    "top 10%": "bottom 10%",
  };
  return mirrored[label] ?? label;
}

/**
 * Renders norms for a prompt, with their provenance attached.
 *
 * The caveat is not boilerplate. A model handed bare percentiles will
 * present them as population facts, and these are facts about one platform's
 * users. Saying so in the same block is what keeps the answer honest.
 */
export function renderNormsForPrompt(
  key: CohortKey,
  norms: Norm[],
  widenedFrom?: NormDimension[],
): string {
  if (norms.length === 0) return "";

  const lines = norms.map(
    (n) =>
      `- ${n.metric} (${n.unit}), n=${n.n}: 10th ${n.p10}, 25th ${n.p25}, median ${n.p50}, 75th ${n.p75}, 90th ${n.p90}`,
  );

  return [
    `Reference distributions for ${cohortLabel(key)}, computed from athletes on this platform.`,
    widenedFrom && widenedFrom.length > 0
      ? `This group was too small on its own, so ${widenedFrom.join(" and ")} was dropped to reach a usable sample. Say so if you cite these.`
      : null,
    "",
    ...lines,
    "",
    "These describe Forge's own athletes, who are not a random sample of the",
    "wider population -- they are the ones whose coach uses this software and",
    "who record their training. Cite them as what they are, give the number of",
    "athletes behind any comparison you make, and never present them as",
    "national norms.",
  ]
    .filter((v): v is string => v != null)
    .join("\n");
}
