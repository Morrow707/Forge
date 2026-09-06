// What gets stripped out of a response body before it reaches the request
// log. Split out of index.ts so it can be tested directly -- importing
// that file boots the server.
const SENSITIVE_LOG_KEYS = new Set([
  "secret",
  "otpauthUri",
  "mfaToken",
  "nativeToken",
  "token",
  "passwordHash",
  "backupCodes",
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
