/* COACH <-> ATHLETE MESSAGING, THE SERVER HALF (2026-11-21). The rules are in
 * shared/coach-messaging.ts; this file reads and writes `coach_athlete_messages`.
 *
 * WHO MAY WRITE, AND THE ONE WAY A ROW GETS IN. `insertCoachMessage` is the only insert into the
 * table, and it takes a `SendPermit`, which only `sendPermitFor` mints and only for an ACTIVE
 * coaching relationship (`coachingRelationship` below). Every route that sends calls both, in
 * that order; server/no-athlete-to-athlete-communication.test.ts discovers every insert and every
 * route that reaches one and reds the day one skips the guard. That is how "0 communication
 * between users when they aren't being coached" stays true with a messaging table in the schema.
 *
 * DECISIONS, so nobody re-derives them:
 *   - A thread is one COACH and one athlete, never the whole staff. An assistant coach in scope
 *     has their own thread with the athlete; a staff coach narrowed to other teams has none.
 *   - A parked (held) athlete reads every old message and neither side sends a new one.
 *   - A thread whose relationship ended is read-only and stays readable to its two parties.
 *   - A minor's linked guardian READS every thread (removed messages included) and writes
 *     nothing, and gets no notification per message: the guardian's access is oversight, not a
 *     second inbox, and a parent emailed for every "see you at 3" learns to ignore the email that
 *     matters. The thread tells both parties a parent can see it.
 *   - Team announcements are the existing Team Board (`team_posts`, isAnnouncement). An athlete's
 *     private reply to a coach's post lands in this table with `teamPostId`, never on the board.
 *   - No edit, no hard delete. The sender may REMOVE a message: the other party sees that one was
 *     removed, the sender, a minor's guardian and an admin audit still see the text. */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, asc, count, eq, gt, inArray, isNull, max, ne, or } from "drizzle-orm";
import { db } from "./db";
import { requireAuth, requireGuardianAccess, requireRole } from "./auth";
import { storage } from "./storage";
import { notifyUser } from "./notify";
import { coachAthleteMessageReads, coachAthleteMessages, coachAthletes, guardianLinks, teamPosts, users } from "@shared/schema";
import { derivePrivacyTier } from "@shared/privacy-tiers";
import {
  MESSAGE_MAX_LENGTH,
  bodyVisibleTo,
  notificationPreview,
  parentCanSeeThread,
  relationshipStateFrom,
  sendPermitFor,
  sendRefusal,
  threadIsReadable,
  type CoachingRelationship,
  type MessageViewer,
  type SendPermit,
} from "@shared/coach-messaging";

const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const HTTP = { created: CREATED, noContent: NO_CONTENT, badRequest: BAD_REQUEST, forbidden: FORBIDDEN, notFound: NOT_FOUND } as const;
const QUOTE_LENGTH = 200;

type Me = { id: number; role: "coach" | "athlete" | "admin" | "guardian"; name: string };
const currentUser = (req: Request) => req.user as Me;

const idParam = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Write something first.").max(MESSAGE_MAX_LENGTH, `Keep a message under ${MESSAGE_MAX_LENGTH} characters.`),
  teamPostId: z.coerce.number().int().positive().nullable().optional(),
});

async function hasHistory(coachId: number, athleteId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: coachAthleteMessages.id })
    .from(coachAthleteMessages)
    .where(and(eq(coachAthleteMessages.coachId, coachId), eq(coachAthleteMessages.athleteId, athleteId)))
    .limit(1);
  return !!row;
}

/** THE COACHING-RELATIONSHIP GUARD. One coach, one athlete, read fresh from the roster. */
export async function coachingRelationship(coachId: number, athleteId: number): Promise<CoachingRelationship> {
  const [coach, athlete] = await Promise.all([storage.getUser(coachId), storage.getUser(athleteId)]);
  const rolesAreCoachAndAthlete = coachId !== athleteId && coach?.role === "coach" && athlete?.role === "athlete";
  const inScope = rolesAreCoachAndAthlete ? await storage.athleteIsInCoachScope(coachId, athleteId) : false;
  const seats = inScope
    ? await db
        .select({ heldAt: coachAthletes.heldAt, heldUntil: coachAthletes.heldUntil })
        .from(coachAthletes)
        .where(and(eq(coachAthletes.athleteId, athleteId), inArray(coachAthletes.coachId, await storage.getEffectiveCoachIds(coachId))))
    : [];
  const state = relationshipStateFrom({ rolesAreCoachAndAthlete, inScope, seats, hasHistory: await hasHistory(coachId, athleteId) });
  const heldUntil = state === "held" ? (seats.find((s) => s.heldUntil)?.heldUntil ?? null) : null;
  return { coachId, athleteId, state, heldUntil };
}

/** THE ONLY INSERT INTO coach_athlete_messages. A permit exists only for an active relationship. */
export async function insertCoachMessage(permit: SendPermit, body: string, teamPostId: number | null) {
  const [row] = await db
    .insert(coachAthleteMessages)
    .values({ coachId: permit.coachId, athleteId: permit.athleteId, senderId: permit.senderId, body, teamPostId })
    .returning();
  return row;
}

/** The sender removes their OWN message, once. Keyed on the caller, so another person's id is a miss. */
export async function removeOwnMessage(senderId: number, messageId: number): Promise<boolean> {
  const [row] = await db
    .update(coachAthleteMessages)
    .set({ removedAt: new Date() })
    .where(and(eq(coachAthleteMessages.id, messageId), eq(coachAthleteMessages.senderId, senderId), isNull(coachAthleteMessages.removedAt)))
    .returning({ id: coachAthleteMessages.id });
  return !!row;
}

async function markRead(userId: number, coachId: number, athleteId: number) {
  await db
    .insert(coachAthleteMessageReads)
    .values({ userId, coachId, athleteId, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [coachAthleteMessageReads.userId, coachAthleteMessageReads.coachId, coachAthleteMessageReads.athleteId],
      set: { lastReadAt: new Date() },
    });
}

async function athleteFacts(athleteId: number) {
  const [athlete, [link]] = await Promise.all([
    storage.getUser(athleteId),
    db.select({ id: guardianLinks.id }).from(guardianLinks).where(eq(guardianLinks.athleteId, athleteId)).limit(1),
  ]);
  const isAdult = !!athlete?.dateOfBirth && derivePrivacyTier(athlete.dateOfBirth) === "tier3_adult_18plus";
  return { athlete, isAdult, parentCanSee: parentCanSeeThread({ hasGuardian: !!link, isAdult }) };
}

/** The thread, as `viewerId` sees it. The guardian and admin readers pass no viewer id. */
async function threadMessages(coachId: number, athleteId: number, viewer: { id: number } | "guardian" | "admin") {
  const rows = await db
    .select({
      id: coachAthleteMessages.id,
      senderId: coachAthleteMessages.senderId,
      body: coachAthleteMessages.body,
      removedAt: coachAthleteMessages.removedAt,
      createdAt: coachAthleteMessages.createdAt,
      teamPostId: coachAthleteMessages.teamPostId,
      quotedPost: teamPosts.body,
    })
    .from(coachAthleteMessages)
    .leftJoin(teamPosts, eq(teamPosts.id, coachAthleteMessages.teamPostId))
    .where(and(eq(coachAthleteMessages.coachId, coachId), eq(coachAthleteMessages.athleteId, athleteId)))
    .orderBy(asc(coachAthleteMessages.createdAt), asc(coachAthleteMessages.id));
  const viewerFor = (senderId: number): MessageViewer => {
    if (typeof viewer === "string") return viewer;
    return senderId === viewer.id ? "sender" : "other_party";
  };
  return rows.map((r) => {
    const who = viewerFor(r.senderId);
    const removed = r.removedAt != null;
    return {
      id: r.id,
      fromMe: who === "sender",
      senderRole: r.senderId === coachId ? ("coach" as const) : ("athlete" as const),
      body: bodyVisibleTo(who, removed) ? r.body : null,
      removed,
      createdAt: r.createdAt,
      replyTo: r.teamPostId && r.quotedPost ? { teamPostId: r.teamPostId, body: r.quotedPost.slice(0, QUOTE_LENGTH) } : null,
    };
  });
}

/** Per thread for one reader: the newest message time and how many from the other side are unread. */
async function threadSummaries(readerId: number, side: "coach" | "athlete") {
  const mine = side === "coach" ? coachAthleteMessages.coachId : coachAthleteMessages.athleteId;
  const other = side === "coach" ? coachAthleteMessages.athleteId : coachAthleteMessages.coachId;
  const [latest, unread] = await Promise.all([
    db.select({ otherId: other, lastAt: max(coachAthleteMessages.createdAt) }).from(coachAthleteMessages).where(eq(mine, readerId)).groupBy(other),
    db
      .select({ otherId: other, n: count() })
      .from(coachAthleteMessages)
      .leftJoin(
        coachAthleteMessageReads,
        and(
          eq(coachAthleteMessageReads.userId, readerId),
          eq(coachAthleteMessageReads.coachId, coachAthleteMessages.coachId),
          eq(coachAthleteMessageReads.athleteId, coachAthleteMessages.athleteId),
        ),
      )
      .where(
        and(
          eq(mine, readerId),
          ne(coachAthleteMessages.senderId, readerId),
          isNull(coachAthleteMessages.removedAt),
          or(isNull(coachAthleteMessageReads.lastReadAt), gt(coachAthleteMessages.createdAt, coachAthleteMessageReads.lastReadAt)),
        ),
      )
      .groupBy(other),
  ]);
  return {
    lastAt: new Map(latest.map((r) => [r.otherId, r.lastAt])),
    unread: new Map(unread.map((r) => [r.otherId, Number(r.n)])),
  };
}

/** Unread messages in this coach's own readable threads, per athlete, by the same rule the
 *  Messages page draws (used by the dashboard's "needs you today" lines). */
export async function unreadForCoach(coachId: number): Promise<Map<number, number>> {
  const { unread } = await threadSummaries(coachId, "coach");
  const candidates = Array.from(unread.entries()).filter(([athleteId, n]) => n > 0 && athleteId !== coachId);
  const rels = await Promise.all(candidates.map(([athleteId]) => coachingRelationship(coachId, athleteId)));
  return new Map(candidates.filter((_, i) => threadIsReadable(rels[i].state)));
}

async function namesFor(ids: number[]) {
  if (ids.length === 0) return new Map<number, string>();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** The coaches an athlete may have a thread with: everybody on the staff of every seat they hold
 *  (the guard decides which of those coach them today), plus any coach they already have history
 *  with, whose thread may now be ended and read-only. */
async function candidateCoachesFor(athleteId: number): Promise<number[]> {
  const seats = await storage.getCoachSeatsForAthlete(athleteId);
  const staffs = await Promise.all(seats.map(async (s) => storage.getEffectiveCoachIds(await storage.getPrimaryCoachId(s.coachId))));
  const history = await db
    .selectDistinct({ coachId: coachAthleteMessages.coachId })
    .from(coachAthleteMessages)
    .where(eq(coachAthleteMessages.athleteId, athleteId));
  return Array.from(new Set([...staffs.flat(), ...history.map((h) => h.coachId)])).filter((id) => id !== athleteId);
}

async function notifyRecipient(permit: SendPermit, senderName: string, body: string) {
  // A mail or push outage must never fail a send that already landed.
  try {
    const link = permit.recipientId === permit.athleteId ? `/athlete/messages?coach=${permit.coachId}` : `/coach/messages?athlete=${permit.athleteId}`;
    await notifyUser(permit.recipientId, "message", `New message from ${senderName}`, notificationPreview(body), link);
  } catch (err) {
    console.error("[coach-messages] notification failed", err);
  }
}

/** A reply to a Team Board post must answer a post this coach wrote on a board this athlete reads. */
async function teamPostIsAnswerable(teamPostId: number, coachId: number, athleteId: number): Promise<boolean> {
  const [post] = await db.select({ coachId: teamPosts.coachId, authorId: teamPosts.authorId }).from(teamPosts).where(eq(teamPosts.id, teamPostId));
  if (!post || post.authorId !== coachId) return false;
  const boards = await storage.getCoachesForAthlete(athleteId);
  return boards.some((b) => b.id === post.coachId);
}

function refuse(res: Response, rel: CoachingRelationship) {
  const status = rel.state === "none" ? HTTP.notFound : HTTP.forbidden;
  return res.status(status).json({ message: sendRefusal(rel.state), state: rel.state });
}

export function registerCoachMessageRoutes(app: Express) {
  // ---------------- the coach's side ----------------
  app.get("/api/coach/messages", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const inScope = (await storage.athleteIdsInCoachScope(user.id)).filter((id) => id !== user.id);
    const summaries = await threadSummaries(user.id, "coach");
    const ids = Array.from(new Set([...inScope, ...summaries.lastAt.keys()]));
    const rels = await Promise.all(ids.map((id) => coachingRelationship(user.id, id)));
    const names = await namesFor(ids);
    const threads = rels
      .filter((r) => threadIsReadable(r.state))
      .map((r) => ({
        athleteId: r.athleteId,
        name: names.get(r.athleteId) ?? "Athlete",
        state: r.state,
        unread: summaries.unread.get(r.athleteId) ?? 0,
        lastMessageAt: summaries.lastAt.get(r.athleteId) ?? null,
      }))
      .sort((a, b) => (b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0) - (a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0) || a.name.localeCompare(b.name));
    res.json({ threads });
  });

  app.get("/api/coach/messages/:athleteId", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = idParam(req.params.athleteId);
    const rel = athleteId ? await coachingRelationship(user.id, athleteId) : null;
    if (!rel || !threadIsReadable(rel.state)) return res.status(HTTP.notFound).json({ message: "No conversation with this athlete." });
    const facts = await athleteFacts(rel.athleteId);
    await markRead(user.id, rel.coachId, rel.athleteId);
    res.json({
      with: { id: rel.athleteId, name: facts.athlete?.name ?? "Athlete" },
      state: rel.state,
      heldUntil: rel.heldUntil,
      canSend: rel.state === "active",
      readOnlyReason: rel.state === "active" ? null : sendRefusal(rel.state),
      parentCanSee: facts.parentCanSee,
      messages: await threadMessages(rel.coachId, rel.athleteId, { id: user.id }),
    });
  });

  app.post("/api/coach/messages/:athleteId", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = idParam(req.params.athleteId);
    if (!athleteId) return res.status(HTTP.notFound).json({ message: sendRefusal("none") });
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const rel = await coachingRelationship(user.id, athleteId);
    const permit = sendPermitFor(rel, user.id);
    if (!permit) return refuse(res, rel);
    // A coach does not reply privately to a board post; only an athlete answers one.
    const row = await insertCoachMessage(permit, parsed.data.body, null);
    await notifyRecipient(permit, user.name, parsed.data.body);
    res.status(HTTP.created).json(row);
  });

  // ---------------- the athlete's side ----------------
  app.get("/api/athlete/messages", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const rels = await Promise.all((await candidateCoachesFor(user.id)).map((c) => coachingRelationship(c, user.id)));
    const readable = rels.filter((r) => threadIsReadable(r.state));
    const summaries = await threadSummaries(user.id, "athlete");
    const names = await namesFor(readable.map((r) => r.coachId));
    const threads = readable
      .map((r) => ({
        coachId: r.coachId,
        name: names.get(r.coachId) ?? "Coach",
        state: r.state,
        unread: summaries.unread.get(r.coachId) ?? 0,
        lastMessageAt: summaries.lastAt.get(r.coachId) ?? null,
      }))
      .sort((a, b) => (b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0) - (a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0) || a.name.localeCompare(b.name));
    res.json({ threads });
  });

  app.get("/api/athlete/messages/:coachId", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coachId = idParam(req.params.coachId);
    const rel = coachId ? await coachingRelationship(coachId, user.id) : null;
    if (!rel || !threadIsReadable(rel.state)) return res.status(HTTP.notFound).json({ message: "No conversation with this coach." });
    const [facts, coach] = await Promise.all([athleteFacts(user.id), storage.getUser(rel.coachId)]);
    await markRead(user.id, rel.coachId, rel.athleteId);
    res.json({
      with: { id: rel.coachId, name: coach?.name ?? "Coach" },
      state: rel.state,
      heldUntil: rel.heldUntil,
      canSend: rel.state === "active",
      readOnlyReason: rel.state === "active" ? null : sendRefusal(rel.state),
      parentCanSee: facts.parentCanSee,
      messages: await threadMessages(rel.coachId, rel.athleteId, { id: user.id }),
    });
  });

  app.post("/api/athlete/messages/:coachId", requireRole("athlete"), async (req, res) => {
    const user = currentUser(req);
    const coachId = idParam(req.params.coachId);
    if (!coachId) return res.status(HTTP.notFound).json({ message: sendRefusal("none") });
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const rel = await coachingRelationship(coachId, user.id);
    const permit = sendPermitFor(rel, user.id);
    if (!permit) return refuse(res, rel);
    const teamPostId = parsed.data.teamPostId ?? null;
    if (teamPostId && !(await teamPostIsAnswerable(teamPostId, coachId, user.id))) {
      return res.status(HTTP.badRequest).json({ message: "That post isn't one this coach wrote on your team board." });
    }
    const row = await insertCoachMessage(permit, parsed.data.body, teamPostId);
    await notifyRecipient(permit, user.name, parsed.data.body);
    res.status(HTTP.created).json(row);
  });

  // ---------------- both parties ----------------
  app.get("/api/messages/unread", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "coach" && user.role !== "athlete") return res.json({ unread: 0 });
    const { unread } = await threadSummaries(user.id, user.role);
    res.json({ unread: Array.from(unread.values()).reduce((a, b) => a + b, 0) });
  });

  /** The sender removes their own message: hidden from the other party, kept for the audit. */
  app.post("/api/messages/:messageId/remove", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const messageId = idParam(req.params.messageId);
    if (!messageId || !(await removeOwnMessage(user.id, messageId))) return res.status(HTTP.notFound).json({ message: "Message not found" });
    res.status(HTTP.noContent).end();
  });

  // ---------------- a minor's guardian: read-only ----------------
  app.get("/api/guardian/athletes/:athleteId/messages", requireGuardianAccess, async (req, res) => {
    const user = currentUser(req);
    const athlete = await storage.getAthleteForGuardianScoped(user.id, Number(req.params.athleteId));
    if (!athlete) return res.status(HTTP.notFound).json({ message: "No athlete linked to this account." });
    const adult = !!athlete.dateOfBirth && derivePrivacyTier(athlete.dateOfBirth) === "tier3_adult_18plus";
    if (adult) return res.status(HTTP.forbidden).json({ message: `${athlete.name} is 18 or over, so their messages with their coaches are their own.` });
    const coachIds = (
      await db.selectDistinct({ coachId: coachAthleteMessages.coachId }).from(coachAthleteMessages).where(eq(coachAthleteMessages.athleteId, athlete.id))
    ).map((r) => r.coachId);
    const names = await namesFor(coachIds);
    const threads = await Promise.all(
      coachIds.map(async (coachId) => ({
        coachId,
        coachName: names.get(coachId) ?? "Coach",
        messages: await threadMessages(coachId, athlete.id, "guardian"),
      })),
    );
    res.json({ athlete: { id: athlete.id, name: athlete.name }, threads });
  });

  // ---------------- admin audit: the whole thread, removed messages included ----------------
  // Ids and roles only (no names): an admin may not learn an athlete's identity (admin-identity.ts).
  app.get("/api/admin/coach-messages/:coachId/:athleteId", requireRole("admin"), async (req, res) => {
    const user = currentUser(req);
    const coachId = idParam(req.params.coachId);
    const athleteId = idParam(req.params.athleteId);
    if (!coachId || !athleteId) return res.status(HTTP.notFound).json({ message: "Not found" });
    await storage.logRecordAccess({
      userId: user.id,
      targetAthleteId: athleteId,
      actionType: "viewed",
      resourceType: "admin:coach-messages",
      resourceId: `${coachId}:${athleteId}`,
      detail: "read a coach-athlete message thread for an audit",
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.json({ coachId, athleteId, messages: await threadMessages(coachId, athleteId, "admin") });
  });
}
