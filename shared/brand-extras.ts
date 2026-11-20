/**
 * THE REST OF A PROGRAM'S PERSONALIZATION, ONE RECORD (Scott, 2026-11-19: "pure personalization,
 * every aspect of the app that we can change"). Kept on the primary coach's row as
 * users.brandExtras so a new option is a new key, not a migration.
 *
 * Every option is part of Full Personalization and is narrowed by the program's plan when it is
 * READ (brandExtrasWithinEntitlements), exactly like the older branding columns: nothing stored is
 * cleared when a program loses it, so it comes back unchanged.
 *
 * Some of it is the program's private business (the coach's note to athletes, the announcement,
 * the athletes' dashboard layout) and never leaves a signed-in screen: publicBrandExtras is what a
 * login page, a sign-up page or the public team page may see.
 */
import type { TrophyCategory, TrophyTier } from "./achievements";
import { BODY_FONTS, type BrandFont } from "./brand-font-catalog";

/** The words a program can swap for Forge's own (singular and plural, exactly as typed). */
export const BRAND_TERM_KEYS = ["program", "workout", "set", "coach", "athlete"] as const;
export type BrandTermKey = (typeof BRAND_TERM_KEYS)[number];
export const FORGE_TERMS: Record<BrandTermKey, { one: string; many: string }> = {
  program: { one: "Program", many: "Programs" },
  workout: { one: "Workout", many: "Workouts" },
  set: { one: "Set", many: "Sets" },
  coach: { one: "Coach", many: "Coaches" },
  athlete: { one: "Athlete", many: "Athletes" },
};

/** Body text fonts; the list is brand-font-catalog.ts. */
export const BRAND_BODY_FONTS: BrandFont[] = BODY_FONTS;
export type BrandBodyFontId = string;

/** Corner rounding, as the app's --radius. */
export const BRAND_CORNERS = { square: "0.25rem", standard: "0.75rem", round: "1.25rem" } as const;
export type BrandCorners = keyof typeof BRAND_CORNERS;

/** The app icons built into the iPhone app (item 17). "forge" is the default. */
export const BRAND_APP_ICONS = [
  { id: "forge", label: "Forge orange", color: "#F65B23" },
  { id: "navy", label: "Navy", color: "#0B2A5B" },
  { id: "royal", label: "Royal blue", color: "#1D4ED8" },
  { id: "red", label: "Red", color: "#B91C1C" },
  { id: "green", label: "Green", color: "#15803D" },
  { id: "purple", label: "Purple", color: "#6D28D9" },
  { id: "black", label: "Black", color: "#111111" },
  { id: "gold", label: "Gold", color: "#D4A017" },
] as const;
export type BrandAppIconId = (typeof BRAND_APP_ICONS)[number]["id"];


/** The program's own daily check-in questions (2026-11-19). Answers are stored on their own and
 *  never change the readiness score, which stays computed from Forge's five. */
export const CHECKIN_QUESTION_KINDS = ["scale", "yesno", "text"] as const;
export type CheckinQuestionKind = (typeof CHECKIN_QUESTION_KINDS)[number];
export const MAX_CHECKIN_QUESTIONS = 5;
export const MAX_CHECKIN_TEXT_ANSWER = 280;

/** The program's own trophies, counted with the same numbers Forge's trophies use. */
export const PROGRAM_TROPHY_CATEGORIES = ["workout_count", "streak", "pr_count", "speed", "nutrition_streak"] as const satisfies readonly TrophyCategory[];
export const PROGRAM_TROPHY_TIERS = ["bronze", "silver", "gold"] as const satisfies readonly TrophyTier[];
export const MAX_PROGRAM_TROPHIES = 20;

/** A season or rivalry week: different colors and a banner between two dates. */
export const MAX_SEASONS = 12;

/** Up to three screens a new athlete sees once. */
export const MAX_WELCOME_SCREENS = 3;


/** The validator lives in ./brand-extras-schema so zod stays off the first paint: the eager
 *  branding code imports this module (bundle-budget.test.ts). The type is erased at build. */
export type { BrandExtras } from "./brand-extras-schema";
import type { BrandExtras } from "./brand-extras-schema";

/** Which entitlement each option sits under, read off the same four the older branding uses. */
export const BRAND_EXTRAS_GATES = {
  hasTeamIdentity: ["terms", "wording", "coachNote", "announcement", "celebration", "trophies", "recap", "welcomeScreens"],
  hasCustomColors: ["defaultTheme", "corners", "pillButtons", "bodyFont", "wordmarkUrl", "backgroundImageUrl", "appIcon", "seasons"],
  hasWorkflowCustomization: ["athleteDashboard", "checkinQuestions"],
} as const satisfies Record<string, readonly (keyof BrandExtras)[]>;

type Gates = Record<keyof typeof BRAND_EXTRAS_GATES, boolean>;

export function brandExtrasWithinEntitlements(extras: BrandExtras | null | undefined, ent: Gates): BrandExtras {
  const out: Record<string, unknown> = { ...(extras ?? {}) };
  (Object.keys(BRAND_EXTRAS_GATES) as (keyof typeof BRAND_EXTRAS_GATES)[])
    .filter((gate) => !ent[gate])
    .flatMap((gate) => [...BRAND_EXTRAS_GATES[gate]])
    .forEach((key) => {
      delete out[key];
    });
  return out as BrandExtras;
}

/** What a page anyone can open may see: the look only, never the program's notes or layout. */
const PUBLIC_KEYS = ["defaultTheme", "corners", "pillButtons", "bodyFont", "wordmarkUrl", "backgroundImageUrl"] as const;
export function publicBrandExtras(extras: BrandExtras | null | undefined): BrandExtras {
  const src = (extras ?? {}) as Record<string, unknown>;
  return Object.fromEntries(PUBLIC_KEYS.filter((k) => src[k] != null).map((k) => [k, src[k]])) as BrandExtras;
}

/** A Forge word in the program's words. `text` is one of Forge's own terms; anything else is
 *  returned as it is. */
export function brandTerm(extras: BrandExtras | null | undefined, key: BrandTermKey, plural = false): string {
  const custom = extras?.terms?.[key];
  const fallback = FORGE_TERMS[key];
  return plural ? custom?.many || fallback.many : custom?.one || fallback.one;
}

/** Swaps Forge's whole-word terms inside a label ("Programs", "Coach reviews") for the program's,
 *  keeping whether the first letter was capital. Only words a program has renamed move; the
 *  plural is swapped before the singular so "Programs" never becomes "Blocks" + "s". */
function swapWord(text: string, word: string, to: string): string {
  // The word on its own: "Program" in "My Program" matches, the "Program" in "Programming" does not.
  // https://regex101.com/?regex=%5CbProgram%5Cb&flags=gi
  return text.replace(new RegExp(`\\b${word}\\b`, "gi"), (m) => (m[0] === m[0].toLowerCase() ? to.toLowerCase() : to));
}

/** Names of Forge products, never renamed by a program's words: "Coaches Corner" stays itself
 *  for a program that calls its coaches Trainers. */
export const PROTECTED_PHRASES = ["Coaches Corner", "Forge Coach"] as const;
// A stand-in no label contains, so a protected phrase rides through the swap untouched.
const PROTECTED_MARK = "\u0000";

export function applyBrandTerms(text: string, extras: BrandExtras | null | undefined): string {
  const terms = extras?.terms;
  if (!terms || !text) return text;
  const hidden = PROTECTED_PHRASES.reduce((acc, phrase, i) => acc.split(phrase).join(`${PROTECTED_MARK}${i}${PROTECTED_MARK}`), text);
  const swapped = BRAND_TERM_KEYS.reduce((acc, key) => {
    const custom = terms[key];
    if (!custom) return acc;
    return swapWord(swapWord(acc, FORGE_TERMS[key].many, custom.many), FORGE_TERMS[key].one, custom.one);
  }, hidden);
  return PROTECTED_PHRASES.reduce((acc, phrase, i) => acc.split(`${PROTECTED_MARK}${i}${PROTECTED_MARK}`).join(phrase), swapped);
}

// One HTML tag, so only the words between tags are swapped and a link, an attribute or a style
// never is: '<a href="/athlete/programs">' matches whole; 'Your programs' does not.
// https://regex101.com/?regex=(%3C%5B%5E%3E%5D*%3E)
const HTML_TAG = /(<[^>]*>)/;

/** The program's words inside an email body: text between tags only. */
export function applyBrandTermsToHtml(html: string, extras: BrandExtras | null | undefined): string {
  if (!extras?.terms) return html;
  return html
    .split(HTML_TAG)
    .map((part) => (part.startsWith("<") ? part : applyBrandTerms(part, extras)))
    .join("");
}

/** The season running on `today` (YYYY-MM-DD), inclusive at both ends; the first listed wins
 *  when two overlap. */
export function activeSeason(extras: BrandExtras | null | undefined, today: string) {
  return extras?.seasons?.find((s) => s.start <= today && today <= s.end) ?? null;
}

/** A program trophy's key in athlete_trophies: scoped to the program so two programs' "first-100"
 *  are two trophies. */
export function programTrophyKey(programId: number, trophyId: string): string {
  return `program:${programId}:${trophyId}`;
}

type Seasonable = { brandPrimaryColor?: string | null; brandSecondaryColor?: string | null; brandExtras?: BrandExtras | null };

/** The program's look with today's season laid over it: the season's colors where it set them,
 *  and its name and banner under `activeSeason` for the app to show. Nothing stored changes. */
export function withActiveSeason<T extends Seasonable>(branding: T, today: string): T & { activeSeason: { name: string; banner: string | null } | null } {
  const season = activeSeason(branding.brandExtras, today);
  if (!season) return { ...branding, activeSeason: null };
  return {
    ...branding,
    brandPrimaryColor: season.primaryColor || branding.brandPrimaryColor,
    brandSecondaryColor: season.secondaryColor || branding.brandSecondaryColor,
    activeSeason: { name: season.name, banner: season.banner || null },
  };
}

const SCALE_ANSWERS = ["1", "2", "3", "4", "5"];
const YES_NO_ANSWERS = ["yes", "no"];

/** Whether `value` is an answer the question's kind accepts: 1-5, yes or no, or short text. */
export function programAnswerFits(kind: CheckinQuestionKind, value: string): boolean {
  if (kind === "scale") return SCALE_ANSWERS.includes(value);
  if (kind === "yesno") return YES_NO_ANSWERS.includes(value);
  return value.trim().length > 0 && value.length <= MAX_CHECKIN_TEXT_ANSWER;
}

/** The parts of a program's personalization that are its LOOK, not its words (2026-11-20). */
const LOOK_EXTRAS = ["defaultTheme", "corners", "pillButtons", "bodyFont", "backgroundImageUrl", "appIcon"] as const;

/** An athlete's branding with the program's look taken out, for an athlete who chose Forge's
 *  standard look. Colors, background tint, fonts, corners, the login photo, the exercise screen's
 *  colors and the app icon go; the program's name, logo, wordmark, words, notes, banner, season
 *  banner and celebration message stay, because those are information, not appearance. */
export function withoutProgramLook<
  T extends {
    brandPrimaryColor?: string | null;
    brandSecondaryColor?: string | null;
    brandBackgroundHue?: number | null;
    brandBackgroundStrength?: number | null;
    brandHeadingFont?: string | null;
    exercisePageTheme?: unknown;
    brandExtras?: BrandExtras | null;
  },
>(branding: T): T {
  const extras = branding.brandExtras
    ? Object.fromEntries(Object.entries(branding.brandExtras).filter(([k]) => !(LOOK_EXTRAS as readonly string[]).includes(k)))
    : branding.brandExtras;
  const celebration = (extras as BrandExtras | null | undefined)?.celebration;
  return {
    ...branding,
    brandPrimaryColor: null,
    brandSecondaryColor: null,
    brandBackgroundHue: null,
    brandBackgroundStrength: null,
    brandHeadingFont: null,
    exercisePageTheme: null,
    brandExtras: extras && celebration ? { ...extras, celebration: { ...celebration, color: null } } : extras,
  };
}
