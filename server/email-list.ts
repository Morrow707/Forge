import type { Express, Request } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes } from "crypto";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { emailListCampaigns, emailListSubscribers } from "@shared/schema";
import { requireRole } from "./auth";
import { isEmailConfigured, sendEmail } from "./email";
import { type CampaignRecipient, buildCampaignEmail, unsubscribeUrl } from "./email-list-render";
import { publicOrigin } from "./public-origin";

/** THE LAUNCH EMAIL LIST.
 *
 * Added 2026-10-02, the night the site went up behind "Coming soon". Scott: "can we have
 * people signup to like a newsletter or email list? way to mass emails to everyone for
 * discounts or something, and then obviously before we launch have people sign up to an
 * email list."
 *
 * Three routes a visitor can reach and three an admin can. The rules, each one a thing a
 * mailing list gets wrong when nobody writes it down:
 *
 * - JOINING NEVER SAYS WHETHER THE ADDRESS WAS ALREADY THERE. The public form answers
 *   `{ ok: true }` for a new address, a repeat, and a re-join after unsubscribing alike. A
 *   different answer would make the form a way to test whether somebody is on the list.
 * - THE LINK IN THE EMAIL NEVER ACTS. Mail scanners fetch every link, so a GET that
 *   unsubscribed would unsubscribe the whole list on delivery. The link opens /unsubscribe,
 *   which has one button, and only the POST writes. Same rule as the new-device email.
 * - UNSUBSCRIBING KEEPS THE ROW. `unsubscribedAt` is set, nothing is deleted, so the address
 *   can never be re-added by a repeat send, a CSV re-import, or a bug that forgot the flag,
 *   and a re-join is something only the person can do, from the form.
 * - THE RECIPIENTS ARE READ WHEN THE SEND STARTS. Never from a count or a list the admin
 *   screen fetched earlier: an unsubscribe between opening the screen and pressing Send has
 *   to count.
 * - A SEND RUNS IN THE BACKGROUND AND REPORTS AS IT GOES. Resend accepts a couple of requests a
 *   second, so a list of a thousand is minutes of work and a request that waited for it would
 *   time out at the proxy and leave the admin thinking nothing was sent. The campaign row is
 *   written first, each delivery moves its counters, and the admin screen polls it.
 * - A TEST SEND GOES TO THE ADMIN AND NOBODY ELSE, and is not a campaign.
 */

const SOURCES = ["signup", "footer", "other"] as const;

const joinSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.enum(SOURCES).optional(),
});

const unsubscribeSchema = z.object({
  token: z.string().trim().regex(/^[0-9a-f]{64}$/),
});

const sendSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
});

// Keyed by IP, like the signup limiter: the form is unauthenticated and writes a row.
const joinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many sign-ups from this network. Please try again later." },
});

// Resend's documented ceiling is a couple of requests a second; this stays under it with room.
const SEND_SPACING_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Idempotent join. Returns nothing a caller could use to tell the three cases apart. */
export async function joinEmailList(email: string, source?: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await db
    .insert(emailListSubscribers)
    .values({ email, source: source ?? null, unsubscribeToken: token })
    .onConflictDoUpdate({
      target: emailListSubscribers.email,
      // A re-join after an unsubscribe clears the flag; a plain repeat changes nothing that
      // matters. The token is kept so a link in an older email still works.
      set: { unsubscribedAt: null, source: sql`coalesce(${emailListSubscribers.source}, ${source ?? null})` },
    });
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const rows = await db
    .update(emailListSubscribers)
    .set({ unsubscribedAt: new Date() })
    .where(and(eq(emailListSubscribers.unsubscribeToken, token), isNull(emailListSubscribers.unsubscribedAt)))
    .returning({ id: emailListSubscribers.id });
  if (rows.length > 0) return true;
  // Already unsubscribed is still "done" to the person pressing the button.
  const [existing] = await db
    .select({ id: emailListSubscribers.id })
    .from(emailListSubscribers)
    .where(eq(emailListSubscribers.unsubscribeToken, token));
  return Boolean(existing);
}

async function activeSubscribers() {
  return db
    .select({ email: emailListSubscribers.email, token: emailListSubscribers.unsubscribeToken })
    .from(emailListSubscribers)
    .where(isNull(emailListSubscribers.unsubscribedAt))
    .orderBy(emailListSubscribers.id);
}

/** The delivery loop. Exported so the test can await it; the route does not. With no
 * `recipients`, the active launch list; the Coaches Corner digest passes its own. */
export async function runCampaign(
  campaignId: number,
  args: { subject: string; body: string; origin: string; recipients?: CampaignRecipient[] },
): Promise<void> {
  const recipients: CampaignRecipient[] =
    args.recipients ??
    (await activeSubscribers()).map((r) => ({ email: r.email, unsubscribeUrl: unsubscribeUrl(args.origin, r.token) }));
  await db
    .update(emailListCampaigns)
    .set({ recipientCount: recipients.length })
    .where(eq(emailListCampaigns.id, campaignId));
  let sent = 0;
  let failed = 0;
  for (const [i, r] of recipients.entries()) {
    if (i > 0 && process.env.NODE_ENV !== "test") await sleep(SEND_SPACING_MS);
    const html = buildCampaignEmail({ body: args.body, unsubscribeUrl: r.unsubscribeUrl });
    let ok = false;
    try {
      ok = (await sendEmail({ to: r.email, subject: args.subject, html, brandForUserId: r.brandForUserId ?? null })).sent;
    } catch {
      ok = false;
    }
    if (ok) sent += 1;
    else failed += 1;
    await db
      .update(emailListCampaigns)
      .set({ sentCount: sent, failedCount: failed })
      .where(eq(emailListCampaigns.id, campaignId));
  }
  await db
    .update(emailListCampaigns)
    .set({ sentCount: sent, failedCount: failed, finishedAt: new Date() })
    .where(eq(emailListCampaigns.id, campaignId));
}

function adminUser(req: Request) {
  return req.user as { id: number; email: string };
}

export function registerEmailListRoutes(app: Express) {
  // ---- public ----
  app.post("/api/public/email-list", joinLimiter, async (req, res) => {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email address." });
    await joinEmailList(parsed.data.email, parsed.data.source);
    res.json({ ok: true });
  });

  app.post("/api/public/email-list/unsubscribe", async (req, res) => {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "That unsubscribe link isn't valid." });
    const found = await unsubscribeByToken(parsed.data.token);
    if (!found) return res.status(404).json({ message: "That unsubscribe link isn't valid." });
    res.json({ ok: true });
  });

  // ---- admin ----
  app.get("/api/admin/email-list", requireRole("admin"), async (_req, res) => {
    const [counts] = await db
      .select({
        active: sql<number>`count(*) filter (where ${emailListSubscribers.unsubscribedAt} is null)`.mapWith(Number),
        unsubscribed: sql<number>`count(*) filter (where ${emailListSubscribers.unsubscribedAt} is not null)`.mapWith(Number),
      })
      .from(emailListSubscribers);
    const recent = await db
      .select({
        id: emailListSubscribers.id,
        email: emailListSubscribers.email,
        source: emailListSubscribers.source,
        subscribedAt: emailListSubscribers.subscribedAt,
        unsubscribedAt: emailListSubscribers.unsubscribedAt,
      })
      .from(emailListSubscribers)
      .orderBy(desc(emailListSubscribers.subscribedAt))
      .limit(50);
    // Only the launch list's own mailings; the Coaches Corner digest shares the table under
    // its own audience and is listed on the Coaches Corner admin page.
    const campaigns = await db
      .select()
      .from(emailListCampaigns)
      .where(eq(emailListCampaigns.audience, "launch_list"))
      .orderBy(desc(emailListCampaigns.startedAt))
      .limit(20);
    res.json({ active: counts?.active ?? 0, unsubscribed: counts?.unsubscribed ?? 0, recent, campaigns, emailConfigured: isEmailConfigured() });
  });

  app.get("/api/admin/email-list.csv", requireRole("admin"), async (_req, res) => {
    const rows = await db
      .select({ email: emailListSubscribers.email, source: emailListSubscribers.source, subscribedAt: emailListSubscribers.subscribedAt })
      .from(emailListSubscribers)
      .where(isNull(emailListSubscribers.unsubscribedAt))
      .orderBy(emailListSubscribers.id);
    const csv = ["email,source,subscribed_at", ...rows.map((r) => `${r.email},${r.source ?? ""},${r.subscribedAt.toISOString()}`)].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="forge-email-list.csv"');
    res.send(csv);
  });

  app.post("/api/admin/email-list/send-test", requireRole("admin"), async (req, res) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A subject and a body are both needed." });
    if (!isEmailConfigured()) return res.status(503).json({ message: "Email sending isn't configured on this server." });
    const me = adminUser(req);
    const html = buildCampaignEmail({
      body: parsed.data.body,
      unsubscribeUrl: unsubscribeUrl(publicOrigin(req), "0".repeat(64)),
    });
    const result = await sendEmail({ to: me.email, subject: `[TEST] ${parsed.data.subject}`, html });
    if (!result.sent) return res.status(502).json({ message: result.error ?? "The test email didn't send." });
    res.json({ ok: true, to: me.email });
  });

  app.post("/api/admin/email-list/send", requireRole("admin"), async (req, res) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A subject and a body are both needed." });
    if (!isEmailConfigured()) return res.status(503).json({ message: "Email sending isn't configured on this server." });
    const [running] = await db
      .select({ id: emailListCampaigns.id })
      .from(emailListCampaigns)
      .where(isNull(emailListCampaigns.finishedAt))
      .limit(1);
    if (running) return res.status(409).json({ message: "A mailing is still going out. Wait for it to finish." });
    const me = adminUser(req);
    const [campaign] = await db
      .insert(emailListCampaigns)
      .values({ sentByUserId: me.id, subject: parsed.data.subject, body: parsed.data.body })
      .returning({ id: emailListCampaigns.id });
    const run = runCampaign(campaign.id, { subject: parsed.data.subject, body: parsed.data.body, origin: publicOrigin(req) });
    // Awaited under test so the assertion can read the counters; fire-and-forget in production,
    // with the campaign row as the record of what happened.
    if (process.env.NODE_ENV === "test") await run;
    else void run.catch((err) => console.error("email-list campaign failed", err));
    res.json({ ok: true, campaignId: campaign.id });
  });
}
