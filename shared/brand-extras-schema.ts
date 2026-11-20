/** The validator for users.brandExtras (see ./brand-extras.ts). Its own module so zod is
 *  not pulled onto the first paint by the branding code every screen imports. */
import { z } from "zod";
import {
  BRAND_APP_ICONS,
  BRAND_BODY_FONTS,
  BRAND_TERM_KEYS,
  CHECKIN_QUESTION_KINDS,
  MAX_CHECKIN_QUESTIONS,
  MAX_PROGRAM_TROPHIES,
  MAX_SEASONS,
  MAX_WELCOME_SCREENS,
  PROGRAM_TROPHY_CATEGORIES,
  PROGRAM_TROPHY_TIERS,
  type BrandAppIconId,
  type BrandBodyFontId,
} from "./brand-extras";

const BODY_FONT_IDS = BRAND_BODY_FONTS.map((f) => f.id) as [BrandBodyFontId, ...BrandBodyFontId[]];
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
const MAX_QUESTION = 120;
const MAX_THRESHOLD = 10_000;
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
