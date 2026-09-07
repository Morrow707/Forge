/**
 * A closed vocabulary for injury body parts, and a normaliser onto it.
 *
 * Why this exists: injury_history.bodyPart is free text. Someone typing
 * "hamstring", "Hamstring", "L hamstring", "left ham" and "hamstrings" has
 * described one injury five ways, and any cohort built by grouping on the
 * raw column silently misses four of them. That is tolerable for a coach
 * reading one athlete's history and disqualifying for research: an
 * undercount looks exactly like a real finding.
 *
 * Why it is not simply BODY_PAIN_PARTS: that list is the daily wellness
 * pain map, built for "where does it hurt today" on a body diagram, and it
 * stops at joints -- neck, shoulder, elbow, wrist, back, core, hip, knee,
 * ankle. Injuries are overwhelmingly soft tissue. Hamstring strain is the
 * single most common injury in field sports and has nowhere to go on that
 * list; so do groin, calf, quad, Achilles and concussion. Grouping injuries
 * by the wellness vocabulary would have forced every hamstring strain into
 * "knee" or "hip" or dropped it entirely.
 *
 * Side is deliberately separate from region. Research questions are almost
 * always about the region ("hamstring injury rate in 17-year-old football
 * athletes"), while side matters for asymmetry work, and a combined
 * "hamstring_left" vocabulary makes the common question the awkward one.
 * It also halves every cohort, which pushes groups under a suppression
 * threshold for no analytic gain.
 */

export const INJURY_REGIONS = [
  { key: "head", label: "Head / concussion" },
  { key: "neck", label: "Neck" },
  { key: "shoulder", label: "Shoulder" },
  { key: "elbow", label: "Elbow" },
  { key: "forearm", label: "Forearm" },
  { key: "wrist", label: "Wrist" },
  { key: "hand", label: "Hand / fingers" },
  { key: "chest", label: "Chest / ribs" },
  { key: "upper_back", label: "Upper back" },
  { key: "lower_back", label: "Lower back" },
  { key: "core", label: "Core / abdominal" },
  { key: "hip", label: "Hip" },
  { key: "groin", label: "Groin / adductor" },
  { key: "quad", label: "Quadriceps" },
  { key: "hamstring", label: "Hamstring" },
  { key: "knee", label: "Knee" },
  { key: "calf", label: "Calf" },
  { key: "achilles", label: "Achilles" },
  { key: "shin", label: "Shin" },
  { key: "ankle", label: "Ankle" },
  { key: "foot", label: "Foot" },
  { key: "other", label: "Other / unspecified" },
] as const;

export type InjuryRegion = (typeof INJURY_REGIONS)[number]["key"];

export const INJURY_SIDES = ["left", "right", "bilateral", "unspecified"] as const;
export type InjurySide = (typeof INJURY_SIDES)[number];

// Matched longest-first, so "lower back" wins over "back" and "hamstring"
// is never swallowed by a shorter token. Order within the array does not
// matter; length does.
const REGION_SYNONYMS: Record<InjuryRegion, string[]> = {
  head: ["head", "concussion", "skull", "face", "jaw", "nose", "eye"],
  neck: ["neck", "cervical", "stinger", "burner", "whiplash"],
  shoulder: ["shoulder", "rotator cuff", "rotator", "cuff", "labrum", "ac joint", "delt", "deltoid", "clavicle", "collarbone"],
  elbow: ["elbow", "ucl", "tommy john", "tennis elbow", "golfers elbow", "golfer's elbow", "epicondylitis"],
  forearm: ["forearm", "radius", "ulna"],
  wrist: ["wrist", "carpal", "scaphoid", "tfcc"],
  hand: ["hand", "finger", "fingers", "thumb", "knuckle", "metacarpal"],
  chest: ["chest", "rib", "ribs", "pec", "pectoral", "sternum"],
  upper_back: ["upper back", "thoracic", "trap", "traps", "rhomboid", "scapula", "shoulder blade", "lat", "lats"],
  lower_back: ["lower back", "low back", "lumbar", "si joint", "sacroiliac", "spondylolysis", "disc", "sciatica"],
  core: ["core", "abdominal", "abdominals", "abs", "oblique", "sports hernia", "hernia"],
  hip: ["hip", "hip flexor", "labral", "glute", "glutes", "piriformis", "psoas", "pelvis"],
  groin: ["groin", "adductor", "adductors", "inner thigh", "pubic", "osteitis pubis"],
  quad: ["quad", "quads", "quadriceps", "thigh", "rectus femoris", "vmo"],
  hamstring: ["hamstring", "hamstrings", "ham", "hammy", "biceps femoris", "posterior thigh"],
  knee: ["knee", "acl", "mcl", "pcl", "lcl", "meniscus", "patella", "patellar", "jumpers knee", "jumper's knee", "it band", "itb", "iliotibial"],
  calf: ["calf", "calves", "gastroc", "gastrocnemius", "soleus"],
  achilles: ["achilles", "achilles tendon", "achilles tendonitis"],
  shin: ["shin", "shin splints", "tibia", "medial tibial", "stress fracture shin"],
  ankle: ["ankle", "high ankle", "deltoid ligament", "atfl", "peroneal", "sprained ankle"],
  foot: ["foot", "feet", "toe", "toes", "plantar", "plantar fasciitis", "heel", "metatarsal", "turf toe", "navicular"],
  other: [],
};

const SIDE_PATTERNS: { side: InjurySide; patterns: string[] }[] = [
  { side: "bilateral", patterns: ["bilateral", "both", "b/l"] },
  { side: "left", patterns: ["left", "lt", "l/", "(l)"] },
  { side: "right", patterns: ["right", "rt", "r/", "(r)"] },
];

function clean(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/[^a-z0-9() ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort region for a free-text body part. Returns "other" rather than
 * null when nothing matches, so a cohort always accounts for every injury
 * row: an unmatched injury must show up as an "Other / unspecified" count a
 * reader can see and question, never vanish from the denominator.
 */
export function normalizeInjuryRegion(raw: string | null | undefined): InjuryRegion {
  if (!raw) return "other";
  const text = clean(raw);
  if (!text) return "other";

  let best: { region: InjuryRegion; length: number } | null = null;
  for (const [region, synonyms] of Object.entries(REGION_SYNONYMS) as [InjuryRegion, string[]][]) {
    for (const synonym of synonyms) {
      if (!text.includes(synonym)) continue;
      // A synonym only counts on a word boundary, or "ham" would match
      // "hamate" and "l/" would match anything containing an l.
      const boundary = new RegExp(`(^|\\s)${synonym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`);
      if (!boundary.test(text)) continue;
      if (!best || synonym.length > best.length) best = { region, length: synonym.length };
    }
  }
  return best?.region ?? "other";
}

/** Best-effort side. Unknown reads as "unspecified", never as a guess. */
export function normalizeInjurySide(raw: string | null | undefined): InjurySide {
  if (!raw) return "unspecified";
  const text = clean(raw);
  for (const { side, patterns } of SIDE_PATTERNS) {
    for (const pattern of patterns) {
      const boundary = new RegExp(`(^|\\s)${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`);
      if (boundary.test(text)) return side;
    }
  }
  return "unspecified";
}

export function injuryRegionLabel(region: InjuryRegion): string {
  return INJURY_REGIONS.find((r) => r.key === region)?.label ?? "Other / unspecified";
}
