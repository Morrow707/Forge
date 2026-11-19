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
import { z } from "zod";
import type { TrophyCategory, TrophyTier } from "./achievements";

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

export const BRAND_BODY_FONTS = [
  { id: "inter", label: "Inter (Forge)", stack: '"Inter", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: null },
  { id: "roboto", label: "Roboto", stack: '"Roboto", "Inter", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" },
  { id: "lato", label: "Lato", stack: '"Lato", "Inter", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" },
  { id: "open-sans", label: "Open Sans", stack: '"Open Sans", "Inter", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" },
  { id: "nunito", label: "Nunito (rounded)", stack: '"Nunito", "Inter", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" },
  { id: "source-serif", label: "Source Serif (classic)", stack: '"Source Serif 4", Georgia, serif', googleFontsUrl: "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&display=swap" },
] as const;
export type BrandBodyFontId = (typeof BRAND_BODY_FONTS)[number]["id"];
const BODY_FONT_IDS = BRAND_BODY_FONTS.map((f) => f.id) as [BrandBodyFontId, ...BrandBodyFontId[]];

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
const APP_ICON_IDS = BRAND_APP_ICONS.map((i) => i.id) as [BrandAppIconId, ...BrandAppIconId[]];

const MAX_TERM = 24;
const MAX_LINE = 140;
const MAX_NOTE = 600;
const MAX_BANNER = 200;
const MAX_WIDGETS = 40;
const MAX_WIDGET_ID = 60;
const MAX_URL = 500;
// A six-digit hex color: "#003262" passes, "#036" and "navy" do not.
// https://regex101.com/?regex=%5E%23%5B0-9a-fA-F%5D%7B6%7D%24
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a color like #003262.");
// A calendar date: "2026-12-01" passes, "12/01/2026" does not.
// https://regex101.com/?regex=%5E%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7D%24
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const line = (max: number) => z.string().trim().max(max).nullable().optional();
// A short id a coach's own list item is known by: "q1", "first-100", not "a b" or "".
// https://regex101.com/?regex=%5E%5Ba-z0-9-%5D%7B1%2C32%7D%24
const itemId = z.string().regex(/^[a-z0-9-]{1,32}$/, "Use letters, numbers and dashes.");

/** The program's own daily check-in questions (2026-11-19). Answers are stored on their own and
 *  never change the readiness score, which stays computed from Forge's five. */
export const CHECKIN_QUESTION_KINDS = ["scale", "yesno", "text"] as const;
export type CheckinQuestionKind = (typeof CHECKIN_QUESTION_KINDS)[number];
export const MAX_CHECKIN_QUESTIONS = 5;
export const MAX_CHECKIN_TEXT_ANSWER = 280;
const MAX_QUESTION = 120;

/** The program's own trophies, counted with the same numbers Forge's trophies use. */
export const PROGRAM_TROPHY_CATEGORIES = ["workout_count", "streak", "pr_count", "speed", "nutrition_streak"] as const satisfies readonly TrophyCategory[];
export const PROGRAM_TROPHY_TIERS = ["bronze", "silver", "gold"] as const satisfies readonly TrophyTier[];
export const MAX_PROGRAM_TROPHIES = 20;
const MAX_THRESHOLD = 10_000;

/** A season or rivalry week: different colors and a banner between two dates. */
export const MAX_SEASONS = 12;

/** Up to three screens a new athlete sees once. */
export const MAX_WELCOME_SCREENS = 3;
const MAX_WELCOME_BODY = 400;

export const brandExtrasSchema = z.object({
  terms: z
    .partialRecord(z.enum(BRAND_TERM_KEYS), z.object({ one: z.string().trim().min(1).max(MAX_TERM), many: z.string().trim().min(1).max(MAX_TERM) }))
    .nullable()
    .optional(),
  wording: z
    .object({
      greeting: line(MAX_LINE),
      restDay: line(MAX_LINE),
      workoutDone: line(MAX_LINE),
    })
    .nullable()
    .optional(),
  defaultTheme: z.enum(["dark", "light"]).nullable().optional(),
  corners: z.enum(["square", "standard", "round"]).nullable().optional(),
  pillButtons: z.boolean().nullable().optional(),
  bodyFont: z.enum(BODY_FONT_IDS).nullable().optional(),
  wordmarkUrl: z.string().max(MAX_URL).nullable().optional(),
  backgroundImageUrl: z.string().max(MAX_URL).nullable().optional(),
  athleteDashboard: z
    .object({
      order: z.array(z.string().max(MAX_WIDGET_ID)).max(MAX_WIDGETS),
      hidden: z.array(z.string().max(MAX_WIDGET_ID)).max(MAX_WIDGETS),
    })
    .nullable()
    .optional(),
  coachNote: line(MAX_NOTE),
  announcement: z
    .object({ text: z.string().trim().min(1).max(MAX_BANNER), until: z.string().regex(isoDate).nullable().optional() })
    .nullable()
    .optional(),
  celebration: z.object({ message: line(MAX_LINE), color: hex.nullable().optional() }).nullable().optional(),
  appIcon: z.enum(APP_ICON_IDS).nullable().optional(),
  checkinQuestions: z
    .array(z.object({ id: itemId, text: z.string().trim().min(1).max(MAX_QUESTION), kind: z.enum(CHECKIN_QUESTION_KINDS) }))
    .max(MAX_CHECKIN_QUESTIONS)
    .nullable()
    .optional(),
  trophies: z
    .array(
      z.object({
        id: itemId,
        label: z.string().trim().min(1).max(MAX_TERM * 2),
        category: z.enum(PROGRAM_TROPHY_CATEGORIES),
        threshold: z.number().int().min(1).max(MAX_THRESHOLD),
        tier: z.enum(PROGRAM_TROPHY_TIERS),
      }),
    )
    .max(MAX_PROGRAM_TROPHIES)
    .nullable()
    .optional(),
  seasons: z
    .array(
      z.object({
        id: itemId,
        name: z.string().trim().min(1).max(MAX_TERM * 2),
        start: z.string().regex(isoDate),
        end: z.string().regex(isoDate),
        primaryColor: hex.nullable().optional(),
        secondaryColor: hex.nullable().optional(),
        banner: line(MAX_BANNER),
      }),
    )
    .max(MAX_SEASONS)
    .nullable()
    .optional(),
  recap: z
    .object({
      enabled: z.boolean(),
      weekday: z.number().int().min(0).max(6),
      includeTotals: z.boolean(),
      includeTopPerformers: z.boolean(),
      note: line(MAX_NOTE),
      sendToGuardians: z.boolean(),
    })
    .nullable()
    .optional(),
  welcomeScreens: z
    .array(z.object({ title: z.string().trim().min(1).max(MAX_LINE), body: z.string().trim().max(MAX_WELCOME_BODY) }))
    .max(MAX_WELCOME_SCREENS)
    .nullable()
    .optional(),
});
export type BrandExtras = z.infer<typeof brandExtrasSchema>;

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
