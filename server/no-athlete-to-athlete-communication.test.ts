import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { sendPermitFor, relationshipStateFrom, type CoachingRelationship } from "@shared/coach-messaging";

/* ZERO COMMUNICATION BETWEEN USERS WHO ARE NOT BEING COACHED (Scott, 2026-10-15).
 *
 * On the competitor list's social layer: "keep the social layer all the way out, we will have
 * underage athletes and i want 0, absolute 0 communication between users when they aren't
 * being coached." The peer discussion board was deleted on 2026-10-11 for the same reason.
 *
 * THE RULE, AS OF COACH MESSAGING (2026-11-21). One person writing something another person reads
 * is allowed in exactly one shape: a coach and ONE athlete that coach currently coaches. So:
 *
 *   1. A table carrying a message from one person to another (a sender or recipient column beside
 *      a body) must be keyed on the coaching relationship itself -- a `coachId` AND an `athleteId`,
 *      both people -- never two arbitrary users. A second table of any other shape reds here.
 *   2. Every insert into such a table must sit inside a function that takes a `SendPermit`, and a
 *      `SendPermit` is minted only by `sendPermitFor` (shared/coach-messaging.ts), which answers
 *      null for anything but an ACTIVE coaching relationship. No other file may cast to the type.
 *   3. Every route that reaches one of those writers must, in its own handler, ask
 *      `coachingRelationship(` and then `sendPermitFor(` before the write. A route that writes
 *      without the guard, or a write reached from outside a route, reds here.
 *   4. The old protection still holds for every OTHER table: a social-named table carrying a body
 *      is a person talking to a MODEL (a role enum with "assistant"), and an athlete write route
 *      named like a message is one of the guarded ones.
 *
 * It DISCOVERS from the schema and the server source rather than holding a list, which is the
 * assertion direction CLAUDE.md keeps relearning: a list cannot fail for a table nobody added to it.
 * Comments are stripped line-aware first (a block comment only where its opener starts a line, a
 * `//` only where the quotes before it balance): the two-regex strip deletes most of routes.ts,
 * and prose about the rule is exactly where the forbidden forms get quoted.
 */
const ROOT = join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

export function stripComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) {
        out.push("");
        continue;
      }
      inBlock = false;
      out.push(" ".repeat(end + 2) + cutLineComment(line.slice(end + 2)));
      continue;
    }
    const trimmed = line.trimStart();
    if (trimmed.startsWith("/*")) {
      const end = line.indexOf("*/", line.indexOf("/*") + 2);
      if (end === -1) {
        inBlock = true;
        out.push("");
        continue;
      }
      out.push(cutLineComment(line.slice(end + 2)));
      continue;
    }
    out.push(cutLineComment(line));
  }
  return out.join("\n");
}

/** Cut a `//` comment only where the quotes before it are balanced (so a URL in a string stays). */
function cutLineComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

/** Index of the bracket that closes the one at `open`, skipping string literals. -1 if none. */
export function matchBracket(src: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const want = pairs[src[open]];
  if (!want) return -1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === src[open]) depth++;
    else if (c === want) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ---------------- the schema ----------------

export type Table = { varName: string; name: string; body: string; columns: Array<{ key: string; text: string }> };

export function tablesIn(schemaSrc: string): Table[] {
  const src = stripComments(schemaSrc);
  return [...src.matchAll(/export const (\w+) = pgTable\(\s*"([a-z0-9_]+)"/g)].map((m) => {
    const open = src.indexOf("(", m.index! + m[0].indexOf("pgTable"));
    const body = src.slice(open, matchBracket(src, open) + 1);
    const cols = [...body.matchAll(/\n\s+(\w+):\s*\w+\(\s*"[a-z0-9_]+"/g)];
    const columns = cols.map((c, i) => ({ key: c[1], text: body.slice(c.index!, i + 1 < cols.length ? cols[i + 1].index : body.length) }));
    return { varName: m[1], name: m[2], body, columns };
  });
}

const refersToAUser = (text: string) => /references\(\(\)\s*=>\s*users\.id/.test(text);
const personColumns = (t: Table) => t.columns.filter((c) => refersToAUser(c.text)).map((c) => c.key);
/** A column that says who a message is FROM or TO -- what makes a row a message between people. */
const PERSON_TO_PERSON = /^(sender|recipient|receiver|toUser|fromUser)\w*$/i;
const hasBody = (t: Table) => t.columns.some((c) => /^(body|message|content|text)$/.test(c.key) && /:\s*text\(/.test(c.text));

/** A message from one person to another: a body, and a column naming the sender or the recipient. */
export function carriesAMessageBetweenPeople(t: Table): boolean {
  const people = personColumns(t);
  return hasBody(t) && (people.some((k) => PERSON_TO_PERSON.test(k)) || /recipientId|receiverId|toUserId|fromUserId/.test(t.body));
}

/** The only shape such a table may take: keyed on the coaching relationship, two people, a sender. */
export function isKeyedOnTheCoachingRelationship(t: Table): boolean {
  const people = personColumns(t);
  return people.includes("coachId") && people.includes("athleteId") && people.includes("senderId");
}

// ---------------- the server ----------------

const serverFiles = readdirSync(join(ROOT, "server"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".itest.ts"))
  .map((f) => ({ file: `server/${f}`, src: stripComments(read(`server/${f}`)) }));

type Fn = { name: string; params: string; start: number; end: number };
function functionsIn(src: string): Fn[] {
  return [...src.matchAll(/function\s+(\w+)\s*\(/g)].flatMap((m) => {
    const paramsOpen = m.index! + m[0].length - 1;
    const paramsClose = matchBracket(src, paramsOpen);
    if (paramsClose < 0) return [];
    // The body is the first `{` after the signature at angle depth zero (a return type is not a body).
    let i = paramsClose + 1;
    let angle = 0;
    for (; i < src.length; i++) {
      if (src[i] === "<") angle++;
      else if (src[i] === ">") angle--;
      else if (src[i] === "{" && angle <= 0) {
        // A `: Promise<{ ... }>` return type would be skipped by the angle count above.
        break;
      }
    }
    const end = matchBracket(src, i);
    return end < 0 ? [] : [{ name: m[1], params: src.slice(paramsOpen, paramsClose + 1), start: m.index!, end }];
  });
}

type Route = { method: string; path: string; start: number; end: number; span: string };
export function routesIn(src: string): Route[] {
  return [...src.matchAll(/app\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)].map((m) => {
    const open = m.index! + m[0].indexOf("(");
    const end = matchBracket(src, open);
    return { method: m[1], path: m[2], start: m.index!, end, span: src.slice(m.index!, end + 1) };
  });
}

/** Every `.insert(<table>)` and the writer function holding it. A writer must take a SendPermit. */
export function writersOf(varName: string, files: Array<{ file: string; src: string }>) {
  const insert = new RegExp(`\\.insert\\(\\s*${varName}\\s*\\)`, "g");
  return files.flatMap(({ file, src }) =>
    [...src.matchAll(insert)].map((m) => {
      const holder = functionsIn(src)
        .filter((f) => f.start < m.index! && m.index! < f.end)
        .sort((a, b) => b.start - a.start)[0];
      return { file, writer: holder?.name ?? null, takesAPermit: !!holder && /:\s*SendPermit\b/.test(holder.params) };
    }),
  );
}

/** Every call of a writer, and whether the route around it asked the guard first. */
export function guardedCallsOf(writer: string, files: Array<{ file: string; src: string }>) {
  const call = new RegExp(`(?<![\\w.])${writer}\\(`, "g");
  return files.flatMap(({ file, src }) =>
    [...src.matchAll(call)]
      .filter((m) => !/function\s+$/.test(src.slice(Math.max(0, m.index! - 20), m.index!)))
      .map((m) => {
        const route = routesIn(src).find((r) => r.start < m.index! && m.index! < r.end);
        const before = route ? src.slice(route.start, m.index!) : "";
        const guarded =
          !!route &&
          ["post", "put", "patch"].includes(route.method) &&
          /coachingRelationship\(/.test(before) &&
          /sendPermitFor\(/.test(before) &&
          before.lastIndexOf("coachingRelationship(") < before.lastIndexOf("sendPermitFor(");
        return { file, route: route ? `${route.method.toUpperCase()} ${route.path}` : null, guarded };
      }),
  );
}

const SOCIAL = /message|messaging|thread|\bpost\b|\bposts\b|reply|replies|\bdm\b|direct_message|feed|follow|friend|chat_room|inbox/i;

const schemaSrc = read("shared/schema.ts");
const tables = tablesIn(schemaSrc);
const coachingTables = tables.filter(carriesAMessageBetweenPeople);

describe("a message between two people exists only inside a coaching relationship", () => {
  it("discovers the tables and finds a real number of them", () => {
    expect(tables.length).toBeGreaterThan(100);
  });

  it("finds the coach-athlete messaging table by its shape, not its name", () => {
    expect(coachingTables.map((t) => t.name)).toContain("coach_athlete_messages");
  });

  it("every table carrying a message between people is keyed on a coach AND an athlete", () => {
    const offenders = coachingTables.filter((t) => !isKeyedOnTheCoachingRelationship(t)).map((t) => t.name);
    expect(offenders).toEqual([]);
  });

  it("every insert into such a table sits in a writer that takes a SendPermit", () => {
    for (const t of coachingTables) {
      const writers = writersOf(t.varName, serverFiles);
      expect(writers.length, `${t.name} has a writer`).toBeGreaterThan(0);
      expect(writers.filter((w) => !w.takesAPermit), t.name).toEqual([]);
    }
  });

  it("every call of a writer is inside a route that asked coachingRelationship then sendPermitFor", () => {
    for (const t of coachingTables) {
      const names = Array.from(new Set(writersOf(t.varName, serverFiles).map((w) => w.writer!)));
      for (const name of names) {
        const calls = guardedCallsOf(name, serverFiles);
        expect(calls.length, `${name} is called somewhere`).toBeGreaterThan(0);
        expect(calls.filter((c) => !c.guarded), name).toEqual([]);
      }
    }
  });

  it("a SendPermit is minted in sendPermitFor and nowhere else", () => {
    const sources = [...serverFiles, ...["shared"].flatMap((dir) =>
      readdirSync(join(ROOT, dir))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => ({ file: `${dir}/${f}`, src: stripComments(read(`${dir}/${f}`)) })),
    )];
    const casts = sources.flatMap(({ file, src }) => [...src.matchAll(/as SendPermit\b/g)].map((m) => ({ file, at: m.index! })));
    expect(casts.map((c) => c.file)).toEqual(["shared/coach-messaging.ts"]);
    const shared = sources.find((s) => s.file === "shared/coach-messaging.ts")!.src;
    const minter = functionsIn(shared).find((f) => f.name === "sendPermitFor")!;
    expect(casts.every((c) => c.at > minter.start && c.at < minter.end)).toBe(true);
  });

  it("sendPermitFor answers null for anything but an ACTIVE relationship, and for a third person", () => {
    const rel = (state: CoachingRelationship["state"]): CoachingRelationship => ({ coachId: 1, athleteId: 2, state, heldUntil: null });
    expect(sendPermitFor(rel("active"), 1)).toMatchObject({ senderId: 1, recipientId: 2 });
    expect(sendPermitFor(rel("active"), 2)).toMatchObject({ senderId: 2, recipientId: 1 });
    for (const state of ["held", "ended", "none"] as const) expect(sendPermitFor(rel(state), 1), state).toBeNull();
    expect(sendPermitFor(rel("active"), 3), "a third person, an athlete's teammate say").toBeNull();
    expect(sendPermitFor({ coachId: 4, athleteId: 4, state: "active", heldUntil: null }, 4)).toBeNull();
  });

  it("the relationship is active only with a live seat in scope; parked is held; gone is ended or none", () => {
    const base = { rolesAreCoachAndAthlete: true, inScope: true, hasHistory: false };
    expect(relationshipStateFrom({ ...base, seats: [{ heldAt: null }] })).toBe("active");
    expect(relationshipStateFrom({ ...base, seats: [{ heldAt: new Date() }] })).toBe("held");
    expect(relationshipStateFrom({ ...base, seats: [{ heldAt: new Date() }, { heldAt: null }] })).toBe("active");
    expect(relationshipStateFrom({ ...base, inScope: false, seats: [], hasHistory: true })).toBe("ended");
    expect(relationshipStateFrom({ ...base, inScope: false, seats: [] })).toBe("none");
    expect(relationshipStateFrom({ ...base, rolesAreCoachAndAthlete: false, seats: [{ heldAt: null }] }), "two athletes").toBe("none");
  });
});

describe("the scanners catch what they exist to catch (driven on synthetic source)", () => {
  const schemaWith = (extra: string) => `${schemaSrc}\n${extra}`;
  const SECOND_TABLE = `
export const athleteNotes = pgTable(
  "athlete_notes",
  {
    id: serial("id").primaryKey(),
    senderId: integer("sender_id").notNull().references(() => users.id),
    recipientId: integer("recipient_id").notNull().references(() => users.id),
    body: text("body").notNull(),
  },
);`;

  it("a second two-person table with a body is found, and is not keyed on a coaching relationship", () => {
    const found = tablesIn(schemaWith(SECOND_TABLE)).filter(carriesAMessageBetweenPeople);
    const offender = found.find((t) => t.name === "athlete_notes")!;
    expect(offender).toBeTruthy();
    expect(isKeyedOnTheCoachingRelationship(offender)).toBe(false);
  });

  it("an insert outside a permit-taking writer is flagged", () => {
    const src = `async function sneaky(a: number) { await db.insert(coachAthleteMessages).values({}); }`;
    expect(writersOf("coachAthleteMessages", [{ file: "x.ts", src }])).toEqual([{ file: "x.ts", writer: "sneaky", takesAPermit: false }]);
  });

  it("a route calling the writer without the guard is flagged, and with it is not", () => {
    const bare = `app.post("/api/athlete/messages/:id", requireAuth, async (req, res) => { await insertCoachMessage(p, "hi", null); });`;
    const guarded = `app.post("/api/athlete/messages/:id", requireAuth, async (req, res) => { const rel = await coachingRelationship(1, 2); const p = sendPermitFor(rel, 2); await insertCoachMessage(p, "hi", null); });`;
    const backwards = `app.post("/x", async (req, res) => { const p = sendPermitFor(rel, 2); const rel = await coachingRelationship(1, 2); await insertCoachMessage(p, "hi", null); });`;
    const outside = `async function job() { await insertCoachMessage(p, "hi", null); }`;
    expect(guardedCallsOf("insertCoachMessage", [{ file: "a.ts", src: bare }])[0].guarded).toBe(false);
    expect(guardedCallsOf("insertCoachMessage", [{ file: "a.ts", src: guarded }])[0].guarded).toBe(true);
    expect(guardedCallsOf("insertCoachMessage", [{ file: "a.ts", src: backwards }])[0].guarded).toBe(false);
    expect(guardedCallsOf("insertCoachMessage", [{ file: "a.ts", src: outside }])[0]).toMatchObject({ route: null, guarded: false });
  });

  it("the comment strip is load-bearing: a guard quoted in a comment does not guard", () => {
    const src = `app.post("/x", async (req, res) => {\n  // coachingRelationship() then sendPermitFor() would go here\n  await insertCoachMessage(p, "hi", null);\n});`;
    expect(guardedCallsOf("insertCoachMessage", [{ file: "a.ts", src }])[0].guarded, "raw text reads as guarded").toBe(true);
    expect(guardedCallsOf("insertCoachMessage", [{ file: "a.ts", src: stripComments(src) }])[0].guarded).toBe(false);
  });
});

describe("every other table is still a person talking to a model, never to a person", () => {
  it("a social-named table carrying a body is an AI transcript or a guarded coaching table", () => {
    // The *_messages AI transcripts carry a role enum (user / assistant) and exactly one person.
    // A social-named table with no body (the coach-messaging read markers) carries nothing anybody
    // wrote. Anything else named like a message is refused, by shape rather than by name.
    const social = tables.filter((t) => SOCIAL.test(t.name) && hasBody(t));
    expect(social.length).toBeGreaterThan(0);
    for (const t of social) {
      if (coachingTables.includes(t)) continue;
      expect(t.body, t.name).toMatch(/Role[A-Za-z]*Enum\("role"\)/);
      expect(t.body, t.name).not.toMatch(/recipient|receiver|toUser|senderId|fromUser/i);
      const enumName = t.body.match(/(\w+RoleEnum)\("role"\)/)![1];
      const enumAt = schemaSrc.indexOf(`export const ${enumName} = pgEnum(`);
      expect(enumAt, enumName).toBeGreaterThan(-1);
      expect(schemaSrc.slice(enumAt, schemaSrc.indexOf("]", enumAt))).toContain('"assistant"');
    }
  });
});

describe("no athlete route writes something another athlete reads", () => {
  // Every athlete write route in every server file, not only routes.ts: a module registering its
  // own routes (velocity zones, coach messaging) is exactly where a new one would land.
  const athleteWrites = serverFiles.flatMap(({ file, src }) =>
    routesIn(src).filter((r) => ["post", "put", "patch"].includes(r.method) && r.path.startsWith("/api/athlete")).map((r) => ({ ...r, file })),
  );

  it("finds the athlete's write routes", () => {
    expect(athleteWrites.length).toBeGreaterThan(10);
  });

  it("an athlete write named like a message, post, reply or thread is a guarded coach-message route", () => {
    const social = athleteWrites.filter((r) => SOCIAL.test(r.path));
    expect(social.map((r) => r.path), "the coach-messaging send route is discovered").toContain("/api/athlete/messages/:coachId");
    const unguarded = social.filter((r) => !(/coachingRelationship\(/.test(r.span) && /sendPermitFor\(/.test(r.span))).map((r) => `${r.file} ${r.path}`);
    expect(unguarded).toEqual([]);
  });

  it("the Free Agent's AI chat talks to a model, never to a person", () => {
    // The one athlete-facing "chat" is the AI Training Chat, behind requirePaidAiAccess; it
    // stays, because the other side of it is Claude.
    const aiChat = athleteWrites.filter((r) => r.method === "post" && /chat/.test(r.path));
    for (const r of aiChat) expect(r.span.slice(0, 400), r.path).toMatch(/requirePaidAiAccess|requireFreeAgent/);
  });
});
