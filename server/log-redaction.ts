// What gets stripped out of a response body before it reaches the request
// log. Split out of index.ts so it can be tested directly -- importing
// that file boots the server.
//
// Two classes of thing, for two different reasons.
//
// CREDENTIALS, which must never be logged because holding one is being the
// user. This list came first and was the whole list.
//
// IDENTITY, which must not be logged because of who this platform is for.
// Roughly three in five accounts here belong to someone under eighteen, and
// a request log is a plain-text file that gets copied to laptops, shipped to
// collectors, and read by whoever is debugging that afternoon -- a place a
// child's name, email address and date of birth should never have been. They
// were, on every logged response that carried them, because this list only
// ever asked "is this a secret" and a name is not a secret, it is just
// somebody's name.
//
// The rest of the platform spent considerable effort making admin surfaces
// stop returning these exact four fields. A response body that reached the
// log carried them anyway, which made that effort partial in a way nobody
// would have noticed from reading either piece of code on its own.
const SENSITIVE_LOG_KEYS = new Set([
  // Credentials.
  "secret",
  "otpauthUri",
  "mfaToken",
  "nativeToken",
  "token",
  "passwordHash",
  "backupCodes",
  "calendarToken",
  "staffInviteCode",
  // Identity. Keyed by name, so a nested athlete object is covered the same
  // as a top-level one -- redactForLog recurses.
  "name",
  "email",
  "phone",
  "dateOfBirth",
  // The same facts under the other names this codebase gives them.
  "athleteName",
  "guardianName",
  "userName",
  "coachName",
  "inviteEmail",
  "guardianEmail",
  "brandContactEmail",
]);

// Recurses, and descends into arrays. It used to do neither: it walked the
// top-level keys of a plain object and returned anything else untouched, so
// a list response was never redacted at all and a secret one level down
// ({ session: { nativeToken } }) went to the log in full. signMediaUrlsDeep
// in this same request pipeline already sweeps responses depth-first for
// exactly this reason -- a guard that only holds for one of the three
// shapes a response takes is not a guard.
export function redactForLog(body: unknown, depth = 0): unknown {
  // Bounded so a cyclic or pathologically nested body can't turn a log line
  // into a stack overflow. Nothing this app returns is anywhere near this
  // deep, and the line is truncated to 200 characters regardless.
  if (depth > 8) return body;
  if (Array.isArray(body)) return body.map((item) => redactForLog(item, depth + 1));
  if (!body || typeof body !== "object") return body;
  const source = body as Record<string, unknown>;
  const cloned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    cloned[key] = SENSITIVE_LOG_KEYS.has(key) ? "[redacted]" : redactForLog(value, depth + 1);
  }
  return cloned;
}
