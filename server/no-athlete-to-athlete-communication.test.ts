import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/* ZERO COMMUNICATION BETWEEN USERS WHO ARE NOT BEING COACHED (Scott, 2026-10-15).
 *
 * On the competitor list's social layer: "keep the social layer all the way out, we will have
 * underage athletes and i want 0, absolute 0 communication between users when they aren't
 * being coached." The peer discussion board was deleted on 2026-10-11 for the same reason.
 *
 * Today nothing lets one athlete write something another athlete reads: no messages table, no
 * thread, no post, no reply, no athlete-to-athlete comment. This file is the ratchet that keeps
 * it so. It DISCOVERS from the schema and the routes rather than holding a list, which is the
 * assertion direction CLAUDE.md keeps relearning: a list cannot fail for a table nobody added to
 * it. A coach writing to their own athlete (video comments, program notes) is coaching and is
 * not what this refuses; what it refuses is a surface two athletes could meet on.
 */
const ROOT = join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const schema = read("shared/schema.ts");
const routes = read("server/routes.ts");
const auth = read("server/auth.ts");

const SOCIAL = /message|messaging|thread|\bpost\b|\bposts\b|reply|replies|\bdm\b|direct_message|feed|follow|friend|chat_room|inbox/i;

describe("the schema has no table two athletes could meet on", () => {
  const tables = [...schema.matchAll(/pgTable\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);

  it("discovers the tables and finds a real number of them", () => {
    expect(tables.length).toBeGreaterThan(100);
  });

  it("every table named like a message is a person talking to a MODEL, never to a person", () => {
    // The eight *_messages tables are AI transcripts: each row carries a role enum
    // (user / assistant) and exactly one person. A table two people could meet on would carry
    // a second person -- a recipient, a receiver, a sender beside an owner -- and that is what
    // is refused here, by shape rather than by name, so a transcript table added tomorrow
    // passes and a messaging table added tomorrow fails.
    const social = tables.filter((t) => SOCIAL.test(t));
    expect(social.length).toBeGreaterThan(0);
    for (const t of social) {
      const at = schema.indexOf(`"${t}"`);
      const body = schema.slice(at, schema.indexOf("\n});", at));
      expect(body, t).toMatch(/Role[A-Za-z]*Enum\("role"\)/);
      // authorId on a program chat is the ONE person who typed the turn, so it is allowed; a
      // second person is what makes a message.
      expect(body, t).not.toMatch(/recipient|receiver|toUser|senderId|fromUser/i);
      // And the enum it uses has a model on the other side.
      const enumName = body.match(/(\w+RoleEnum)\("role"\)/)![1];
      const enumAt = schema.indexOf(`export const ${enumName} = pgEnum(`);
      expect(enumAt, enumName).toBeGreaterThan(-1);
      expect(schema.slice(enumAt, schema.indexOf("]", enumAt))).toContain('"assistant"');
    }
  });

  it("no table carries a message from one person to another", () => {
    // Any table at all, social-named or not: two person columns plus a text body is a message.
    const twoPeople = [...schema.matchAll(/pgTable\(\s*"([a-z0-9_]+)"[\s\S]*?\n\}\);/g)]
      .filter((m) => /recipientId|receiverId|toUserId|fromUserId/.test(m[0]))
      .map((m) => m[1]);
    expect(twoPeople).toEqual([]);
  });
});

describe("no athlete route writes something another athlete reads", () => {
  // Every route an athlete can call. A coach's or admin's route to an AI "chat" is a person
  // talking to a model, not to another user, and is not under /api/athlete anyway.
  const athleteWrites = [...(routes + auth).matchAll(/app\.(post|put|patch)\(\s*"(\/api\/athlete[^"]*)"/g)].map(
    (m) => m[2],
  );

  it("finds the athlete's write routes", () => {
    expect(athleteWrites.length).toBeGreaterThan(10);
  });

  it("none of them is a message, post, reply, thread, feed, follow or friend", () => {
    const offenders = athleteWrites.filter((p) => SOCIAL.test(p));
    expect(offenders).toEqual([]);
  });

  it("the Free Agent's AI chat talks to a model, never to a person", () => {
    // The one athlete-facing "chat" is the AI Training Chat, behind requirePaidAiAccess; it
    // stays, because the other side of it is Claude.
    const aiChat = [...routes.matchAll(/app\.post\(\s*"(\/api\/athlete[^"]*chat[^"]*)"/g)].map((m) => m[1]);
    for (const p of aiChat) {
      const at = routes.indexOf(`"${p}"`);
      expect(routes.slice(at, at + 400)).toMatch(/requirePaidAiAccess|requireFreeAgent/);
    }
  });
});
