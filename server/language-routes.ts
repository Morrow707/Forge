// THE LANGUAGE A PERSON READS FORGE IN, AND THE TRANSLATION OF WHAT A COACH TYPED (2026-11-22).
//
// PUT /api/account/language saves `users.language` for the signed-in person, any role, and
// answers with their own identity carrying the role flags (server/every-self-response-carries-
// the-flags.test.ts says why a self response must). The top bar's flip never calls this: it
// changes the screen on one device and leaves the saved choice alone.
//
// POST /api/translate turns texts a person typed into the reader's language. Signed-in only,
// with its own limiter on top of the API floor, through the fast model (server/translation.ts).
// The client sends only text that is drawn on the screen; legal documents are never sent.

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { requireAuth, toPublicUserWithSections } from "./auth";
import { rateLimitKey } from "./rate-limiters";
import { users } from "@shared/schema";
import { LANGUAGES } from "@shared/languages";
import {
  TRANSLATE_MAX_TEXTS,
  TRANSLATE_MAX_TEXT_LENGTH,
  TRANSLATE_MAX_TOTAL_LENGTH,
  translateTexts,
  type TranslateAsker,
} from "./translation";

const languageSchema = z.enum(LANGUAGES);
const BAD_REQUEST = 400;
const NOT_FOUND = 404;

const languageBody = z.object({ language: languageSchema.nullable() }).strict();

const translateBody = z
  .object({
    texts: z.array(z.string().max(TRANSLATE_MAX_TEXT_LENGTH)).min(1).max(TRANSLATE_MAX_TEXTS),
    target: languageSchema,
  })
  .strict()
  .refine((b) => b.texts.reduce((sum, t) => sum + t.length, 0) <= TRANSLATE_MAX_TOTAL_LENGTH, {
    message: `At most ${TRANSLATE_MAX_TOTAL_LENGTH} characters can be translated at once.`,
  });

/** Sixty requests a quarter hour per account: a screen asks once per note, and the server caches. */
const TRANSLATE_WINDOW_MS = 900_000;
const TRANSLATE_REQUESTS_PER_WINDOW = 60;
const translateLimiter = rateLimit({
  windowMs: TRANSLATE_WINDOW_MS,
  limit: TRANSLATE_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { message: "Too many translation requests. Please try again shortly." },
});

const currentUserId = (req: Request) => (req.user as { id: number }).id;

export function registerLanguageRoutes(app: Express, opts: { ask?: TranslateAsker } = {}) {
  app.put("/api/account/language", requireAuth, async (req: Request, res: Response) => {
    const parsed = languageBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(BAD_REQUEST).json({ message: `Language must be one of: ${LANGUAGES.join(", ")}.` });
    }
    const [updated] = await db
      .update(users)
      .set({ language: parsed.data.language })
      .where(eq(users.id, currentUserId(req)))
      .returning();
    if (!updated) return res.status(NOT_FOUND).json({ message: "Account not found." });
    return res.json(await toPublicUserWithSections(updated));
  });

  app.post("/api/translate", requireAuth, translateLimiter, async (req: Request, res: Response) => {
    const parsed = translateBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(BAD_REQUEST).json({ message: parsed.error.issues[0]?.message ?? "Nothing to translate." });
    }
    const translations = await translateTexts(parsed.data.texts, parsed.data.target, opts.ask);
    return res.json({ target: parsed.data.target, translations });
  });
}
