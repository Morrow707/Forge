/**
 * A LABEL MAP IS DRAWN THROUGH t(), AND EVERY WORD IN IT IS IN THE CATALOG (2026-11-22).
 *
 * The page ratchet (every-page-is-translated.test.ts) counts English LITERALS, so it could not see
 * `{EXERCISE_PURPOSE_LABEL[p]}`: no string sits at the draw site, so a Spanish screen can read
 * "Off-season / Preseason / Warm-up / Joint care". Three rules, each read from the source:
 *
 *   1. Every reference to a label map (a name ending in LABEL or LABELS that a client .tsx file
 *      imports or declares) sits inside t(...), translate(...) or msg(...), or is Object.keys's
 *      argument (label-map-scan.ts). The few deliberate exceptions are DELIBERATE_ENGLISH below,
 *      each with its reason.
 *   2. Every English value of every such map (followed to the file that declares it) is in es.json.
 *   3. Every value of Forge's fixed library vocabularies that the screens draw through t() -- the
 *      exercise category, family, movement type, body region, muscle group, equipment, laterality,
 *      skill type, sport and periodization phase -- is in es.json.
 *
 * The scan reads the TypeScript syntax tree, so a comment is never read (CLAUDE.md's
 * comment-strip rule, met by construction and proven by a case).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { findUntranslatedLabelMaps, labelMapOrigins, labelMapText } from "./label-map-scan";
import { REPO_ROOT, SPANISH_CATALOG_PATH, allClientFiles, readRepoFile } from "./source-files";
import { BODY_REGIONS, MOVEMENT_COMPLEXITIES, MOVEMENT_TYPES, MUSCLE_GROUPS, PLANES, SPORTS } from "@shared/exercise-taxonomy";
import { EQUIPMENT_ORDER, EXERCISE_FAMILIES } from "@shared/exercise-family";
import { exerciseCategoryEnum, lateralityEnum } from "@shared/schema";
import { EXERCISE_JOINT_LABEL } from "@shared/exercise-tags";
import { SKILL_EQUIPMENT, SKILL_TARGETS, SKILL_TYPES } from "@/lib/skill-taxonomy";
import type { VocabularyKind } from "./index";

const spanish = JSON.parse(readFileSync(SPANISH_CATALOG_PATH, "utf8")) as Record<string, string>;

/** Label maps drawn in English on purpose. A map is exempt everywhere it is used (`files: null`) or
 *  in the named files only. Every entry carries the reason a reader in Spanish still sees English. */
const DELIBERATE_ENGLISH: Record<string, { files: string[] | null; reason: string }> = {
  POWERED_BY_FORGE_LABEL: {
    files: null,
    reason: "The brand's own mark, drawn the same in every language and in every email.",
  },
  LANGUAGE_SHORT_LABELS: {
    files: null,
    reason: "Each language's name in that language (the flip reads ES and EN in every language).",
  },
  AUTHORIZED_CHECKBOX_LABEL: {
    files: null,
    reason: "A signing box on the Institutional Service Agreement; legal documents stay in English.",
  },
  AGREED_CHECKBOX_LABEL: {
    files: null,
    reason: "A signing box on the Institutional Service Agreement; legal documents stay in English.",
  },
  DOC_LABEL: {
    files: ["client/src/pages/admin/documents.tsx"],
    reason: "The titles of Forge's legal documents, which stay in English (counsel question 30).",
  },
  CONSENT_LABEL: {
    files: ["client/src/pages/admin/documents.tsx"],
    reason: "The names of signed legal consents in the admin compliance list; legal titles stay English.",
  },
  DEFAULT_COLOR_FOR_LABEL: {
    files: null,
    reason: "Colour ids keyed by event label: it holds no text and is never drawn.",
  },
  CALENDAR_EVENT_LABELS: {
    files: null,
    reason: "A list of {id, name} read for its ids; every place that draws a name calls t(l.name).",
  },
  ROLE_LABELS: {
    files: ["client/src/components/app-shell.tsx"],
    reason: "Read inside roleLabel(), whose every caller translates the result: t(roleLabel(role)).",
  },
  LABEL: {
    files: ["client/src/components/body-map.tsx"],
    reason: "Read inside bodyMapLabel(), whose every caller translates the result: t(bodyMapLabel(g)).",
  },
};

const isExempt = (file: string, name: string) => {
  const entry = DELIBERATE_ENGLISH[name];
  return entry != null && (entry.files == null || entry.files.includes(file));
};

const clientTsx = () => allClientFiles().filter((f) => f.endsWith(".tsx"));

const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];
/** A module specifier as a repo-relative file, through the same aliases vite uses. */
const ALIASES: Array<{ prefix: string; to: (rest: string, fromFile: string) => string }> = [
  { prefix: "@shared/", to: (rest) => join("shared", rest) },
  { prefix: "@/", to: (rest) => join("client/src", rest) },
  { prefix: ".", to: (_rest, fromFile) => fromFile },
];
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const alias = ALIASES.find((a) => specifier.startsWith(a.prefix));
  if (alias == null) return null;
  const base = alias.prefix === "." ? join(dirname(fromFile), specifier) : alias.to(specifier.slice(alias.prefix.length), fromFile);
  const found = EXTENSIONS.map((ext) => base + ext).find((p) => existsSync(join(REPO_ROOT, p)));
  return found ? relative(REPO_ROOT, join(REPO_ROOT, found)).split("\\").join("/") : null;
}

const MAX_HOPS = 3;
/** The English a map holds, followed through imports to the file that declares it. */
function textOfMap(file: string, name: string, hops = 0): string[] | null {
  const src = readRepoFile(file);
  const own = labelMapText(file, src, name);
  if (own != null) return own;
  const from = labelMapOrigins(file, src).get(name);
  if (from == null || hops >= MAX_HOPS) return null;
  const next = resolveSpecifier(file, from);
  return next ? textOfMap(next, name, hops + 1) : null;
}

describe("the label-map scanner", () => {
  it("finds a label map drawn without t(), in a child, an attribute and a helper", () => {
    const src = `
      import { EXERCISE_PURPOSE_LABEL } from "@shared/exercise-tags";
      const STATUS_LABEL = { ok: "Connected" };
      export const A = ({ p }) => <span title={STATUS_LABEL.ok}>{EXERCISE_PURPOSE_LABEL[p]}</span>;
      export const B = () => <Chips labels={EXERCISE_PURPOSE_LABEL} />;
      const f = (s) => STATUS_LABEL[s] ?? s;
    `;
    expect(findUntranslatedLabelMaps("x.tsx", src).map((f) => f.text)).toEqual([
      "STATUS_LABEL.ok",
      "EXERCISE_PURPOSE_LABEL[p]",
      "EXERCISE_PURPOSE_LABEL",
      "STATUS_LABEL[s]",
    ]);
  });

  it("accepts t(), translate(), msg(), t.term()'s word, a fallback inside t(), and Object.keys", () => {
    const src = `
      import { EXERCISE_PURPOSE_LABEL } from "@shared/exercise-tags";
      const STATUS_LABEL = { ok: "Connected" };
      const LIST = [{ label: msg(STATUS_LABEL.ok) }];
      export const A = ({ p, s }) => <span title={t(STATUS_LABEL[s] ?? s)}>{t(EXERCISE_PURPOSE_LABEL[p])}</span>;
      const keys = Object.keys(STATUS_LABEL);
      const joint = t.term("joint", STATUS_LABEL.ok);
      toast(translate(STATUS_LABEL.ok));
    `;
    expect(findUntranslatedLabelMaps("x.tsx", src)).toEqual([]);
  });

  it("does not take a map inside t()'s VARS for a translated one", () => {
    const src = `
      const STATUS_LABEL = { ok: "Connected" };
      export const A = () => <p>{t("Status: {s}", { s: STATUS_LABEL.ok })}</p>;
    `;
    expect(findUntranslatedLabelMaps("x.tsx", src).map((f) => f.text)).toEqual(["STATUS_LABEL.ok"]);
  });

  it("never reads a comment, which is the direction that would hide English", () => {
    const src = `
      import { EXERCISE_PURPOSE_LABEL } from "@shared/exercise-tags";
      // Was: <span>{EXERCISE_PURPOSE_LABEL[p]}</span>
      /* {EXERCISE_PURPOSE_LABEL[p]} */
      export const A = ({ p }) => <span>{t(EXERCISE_PURPOSE_LABEL[p])}</span>;
    `;
    expect(findUntranslatedLabelMaps("x.tsx", src)).toEqual([]);
  });

  it("reads a map's English, its msg() values and a list's names, and no ids", () => {
    const src = `
      const A_LABEL = { a: "One", b: msg("Two") };
      export const LIST_LABELS = [{ id: "game", name: "Game" }, { id: "x", name: "Other" }];
    `;
    expect(labelMapText("x.tsx", src, "A_LABEL")).toEqual(["One", "Two"]);
    expect(labelMapText("x.tsx", src, "LIST_LABELS")).toEqual(["Game", "Other"]);
    expect(labelMapText("x.tsx", src, "NOT_HERE_LABEL")).toBeNull();
  });
});

describe("every label map", () => {
  it("is drawn through t() wherever a client file uses it", () => {
    const found = clientTsx().flatMap((file) =>
      findUntranslatedLabelMaps(file, readRepoFile(file))
        .filter((f) => !isExempt(file, f.name))
        .map((f) => `${file}:${f.line} ${f.text}`),
    );
    expect(found, "wrap the lookup in t(...), or msg(...) where it is stored for a later t()").toEqual([]);
  });

  it("every exemption is still used, and says why in a sentence", () => {
    const used = new Set(
      clientTsx().flatMap((file) => findUntranslatedLabelMaps(file, readRepoFile(file)).map((f) => f.name)),
    );
    const MIN_REASON = 40;
    const stale = Object.entries(DELIBERATE_ENGLISH)
      .filter(([name, entry]) => !used.has(name) || entry.reason.length < MIN_REASON)
      .map(([name]) => name);
    expect(stale).toEqual([]);
  });

  it("has every word it can draw in es.json", () => {
    const pairs = clientTsx().flatMap((file) =>
      [...labelMapOrigins(file, readRepoFile(file)).keys()]
        .filter((name) => !isExempt(file, name) && !(name in DELIBERATE_ENGLISH))
        .map((name) => ({ file, name, text: textOfMap(file, name) })),
    );
    const unread = pairs.filter((p) => p.text == null).map((p) => `${p.file} ${p.name}`);
    const missing = [
      ...new Set(pairs.flatMap((p) => (p.text ?? []).filter((w) => !(w in spanish)).map((w) => `${p.name}: ${w}`))),
    ];
    expect(unread, "a map whose declaration the scan cannot read").toEqual([]);
    expect(missing, "add each to es.json").toEqual([]);
  });
});

/** Lists of options whose `label` a screen draws through t(), by the file that declares them. */
const OPTION_LISTS: Array<[file: string, name: string]> = [
  ["client/src/components/profile-fields-form.tsx", "SEASON_PHASE_OPTIONS"],
  ["client/src/components/profile-fields-form.tsx", "TRAINING_STYLE_OPTIONS"],
  ["client/src/components/profile-fields-form.tsx", "GENDER_OPTIONS"],
  ["shared/equipment-profile.ts", "EQUIPMENT_ITEMS"],
  ["shared/goniometer.ts", "GONIOMETER_JOINTS"],
  ["shared/goniometer.ts", "SHOULDER_MOVEMENTS"],
  ["shared/goniometer.ts", "ELBOW_MOVEMENTS"],
  ["shared/goniometer.ts", "WRIST_MOVEMENTS"],
  ["shared/goniometer.ts", "HIP_MOVEMENTS"],
  ["shared/goniometer.ts", "KNEE_MOVEMENTS"],
  ["shared/goniometer.ts", "ANKLE_MOVEMENTS"],
];

describe("lists of options drawn through t()", () => {
  it.each(OPTION_LISTS)("every label of %s %s is in es.json", (file, name) => {
    const labels = labelMapText(file, readRepoFile(file), name, ["label"]);
    expect(labels, `${file} declares no ${name}`).not.toBeNull();
    const absent = [...new Set(labels ?? [])].filter((w) => !(w in spanish));
    expect(absent).toEqual([]);
  });
});

describe("Forge's fixed library vocabularies", () => {
  /** What the library stores in these columns, read off the seed so a new value is covered the day
   *  it is seeded. */
  function seededValues(field: string): string[] {
    const sources = ["server/seed.ts", "server/seed-data/library-review-2026-11-22.ts"];
    // A seeded field: `skillType: "Hitting"` -> Hitting. Rejects `skillType: x`.
    // https://regex101.com/?regex=%5CbskillType%3A%20%22(%5B%5E%22%5D%2B)%22&testString=skillType%3A%20%22Hitting%22
    const pattern = new RegExp(`\\b${field}: "([^"]+)"`, "g");
    return sources.flatMap((s) => Array.from(readRepoFile(s).matchAll(pattern), (m) => m[1]));
  }

  /** The category each repo-written Forge class is seeded under. */
  function classCategories(): string[] {
    const dir = "server/seed-data/forge-classes";
    // A class's category: `category: "Track"` -> Track. Rejects `category: x`.
    // https://regex101.com/?regex=%5Cbcategory%3A%20%22(%5B%5E%22%5D%2B)%22&testString=category%3A%20%22Track%22
    const pattern = /\bcategory: "([^"]+)"/g;
    return readdirSync(join(REPO_ROOT, dir))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .flatMap((f) => Array.from(readRepoFile(`${dir}/${f}`).matchAll(pattern), (m) => m[1]));
  }

  const VOCABULARIES: Record<VocabularyKind, readonly string[]> = {
    "exercise category": exerciseCategoryEnum.enumValues,
    laterality: lateralityEnum.enumValues,
    "exercise family": EXERCISE_FAMILIES,
    "movement type": MOVEMENT_TYPES,
    "movement complexity": MOVEMENT_COMPLEXITIES,
    "body region": BODY_REGIONS,
    plane: PLANES,
    sport: SPORTS,
    "muscle group": [...MUSCLE_GROUPS, ...seededValues("muscleGroup")],
    equipment: [...EQUIPMENT_ORDER, ...seededValues("equipment")],
    "skill type": [...SKILL_TYPES, ...seededValues("skillType")],
    "skill equipment": SKILL_EQUIPMENT,
    "skill target": SKILL_TARGETS,
    "class category": classCategories(),
    joint: Object.values(EXERCISE_JOINT_LABEL),
  };

  it.each(Object.entries(VOCABULARIES))("every %s is in es.json", (kind, values) => {
    const MIN_VALUES = 2;
    expect(values.length).toBeGreaterThanOrEqual(MIN_VALUES);
    // t.term() reads "{word} ({kind})" first, then the plain word (client/src/i18n/index.ts).
    const absent = [...new Set(values)].filter((v) => !(`${v} (${kind})` in spanish) && !(v in spanish));
    expect(absent).toEqual([]);
  });

  // A word whose plain key already means something else on another screen. Without its own key it
  // would read as the other meaning ("Back" the button, "Track" a Coaches Corner course, "Bench"
  // the bench press), and the case above cannot tell, because the plain key exists.
  const SAME_WORD_OTHER_MEANING: Array<[VocabularyKind, string]> = [
    ["muscle group", "Back"],
    ["joint", "Back"],
    ["equipment", "Bench"],
    ["skill type", "Serve"],
    ["skill type", "Starts"],
    ["class category", "Track"],
    ["skill equipment", "Basketball"],
    ["skill equipment", "Volleyball"],
    ["skill equipment", "Football"],
  ];
  it.each(SAME_WORD_OTHER_MEANING)("a %s %s has a key of its own", (kind, word) => {
    expect(spanish).toHaveProperty([`${word} (${kind})`]);
  });
});
