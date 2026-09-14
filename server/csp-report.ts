/**
 * Turns a browser's CSP violation report into the handful of fields worth
 * logging.
 *
 * /api/csp-report is unauthenticated by necessity -- a browser posts it with
 * no session context -- so its body is whatever anyone chooses to send, and it
 * used to be stringified into a log line whole. Two things follow from that. A
 * body can carry newlines, so a forged report can write what look like
 * additional log lines and make the log say things that never happened; and a
 * body can be arbitrarily large and repeated, so the log is a free write
 * amplifier for anyone who wants to bury something in it.
 *
 * Lives here rather than in routes.ts so it can be tested without importing
 * that file, which reaches the database on import -- the same reason
 * log-redaction.ts is its own module.
 */

const CSP_REPORT_FIELDS = [
  "effective-directive",
  "violated-directive",
  "blocked-uri",
  "document-uri",
  "disposition",
  "status-code",
] as const;

/**
 * One field, made safe to put in a log line.
 *
 * The query string goes first. A document-uri is whatever page the browser was
 * on, and a page in this app can be showing a signed media URL; a report is
 * the last place that should copy an exp/sig pair into a log file, where it
 * stays readable for the rest of its lifetime. Then anything that could break
 * the line onto a new one -- U+2028 and U+2029 included, because a log viewer
 * rendering the text treats them as line breaks too. Then a length cap.
 */
function safeCspValue(raw: unknown): string | undefined {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return undefined;
  const withoutQuery = raw.split("?")[0];
  return withoutQuery.replace(/[\r\n\u2028\u2029]/g, " ").slice(0, 200);
}

export function summarizeCspReport(body: unknown): Record<string, string> {
  // Browsers disagree about the envelope: most still post {"csp-report": {...}}
  // while the newer Reporting API does not wrap it at all.
  const report =
    body && typeof body === "object" && "csp-report" in body
      ? (body as Record<string, unknown>)["csp-report"]
      : body;
  const summary: Record<string, string> = {};
  if (!report || typeof report !== "object") return summary;
  for (const field of CSP_REPORT_FIELDS) {
    const value = safeCspValue((report as Record<string, unknown>)[field]);
    if (value !== undefined) summary[field] = value;
  }
  return summary;
}
