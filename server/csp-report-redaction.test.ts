import { describe, it, expect } from "vitest";
import { summarizeCspReport } from "./csp-report";

/**
 * /api/csp-report is unauthenticated, because a browser posts a violation
 * report with no session context and there is nowhere to get one from. That
 * makes its body the one piece of wholly attacker-chosen data this server
 * writes to its log, and it used to write all of it.
 *
 * Three properties follow, and all three are about the log rather than the
 * report: a report cannot forge log lines, cannot flood the log, and cannot
 * copy a signed media URL into it.
 */
describe("CSP violation reports are summarized before they reach the log", () => {
  it("keeps the fields that make a report worth reading", () => {
    const summary = summarizeCspReport({
      "csp-report": {
        "effective-directive": "script-src",
        "blocked-uri": "https://evil.test/x.js",
        "document-uri": "https://forge.test/athlete/dashboard",
        disposition: "report",
      },
    });
    expect(summary["effective-directive"]).toBe("script-src");
    expect(summary["blocked-uri"]).toBe("https://evil.test/x.js");
    expect(summary["document-uri"]).toBe("https://forge.test/athlete/dashboard");
    expect(summary.disposition).toBe("report");
  });

  it("reads a report posted without the csp-report envelope", () => {
    // Browsers disagree about the wrapper; the newer Reporting API does not
    // use one. A report that arrives unwrapped should still be legible rather
    // than silently logged as nothing.
    expect(summarizeCspReport({ "effective-directive": "img-src" })["effective-directive"]).toBe(
      "img-src",
    );
  });

  it("drops fields nobody asked for", () => {
    // The whitelist is the point: a report can carry any key at all, and an
    // unknown key is an unknown quantity of attacker text.
    const summary = summarizeCspReport({
      "csp-report": { "effective-directive": "script-src", "script-sample": "a".repeat(5000) },
    });
    expect(summary).not.toHaveProperty("script-sample");
    expect(Object.keys(summary)).toEqual(["effective-directive"]);
  });

  it("cannot forge a second log line", () => {
    // A newline in a logged value makes the next line look like its own log
    // entry, which is how a report gets to write whatever it likes into the
    // record an operator reads. U+2028 and U+2029 count: a viewer rendering
    // the text breaks on them too.
    const summary = summarizeCspReport({
      "csp-report": { "blocked-uri": "https://x.test/a\nWARN everything is fine\u2028really" },
    });
    expect(summary["blocked-uri"]).not.toMatch(/[\r\n\u2028\u2029]/);
    expect(summary["blocked-uri"]).toBe("https://x.test/a WARN everything is fine really");
  });

  it("caps how much of the log one report can occupy", () => {
    const summary = summarizeCspReport({
      "csp-report": { "document-uri": `https://forge.test/${"a".repeat(9000)}` },
    });
    expect(summary["document-uri"]!.length).toBe(200);
  });

  it("never copies a signed media URL into the log", () => {
    // A page in this app can be showing a signed /uploads URL, and
    // document-uri is whatever page the browser was on. The signature is a
    // bearer credential for its whole TTL; a log file outlives that by a lot.
    const summary = summarizeCspReport({
      "csp-report": {
        "document-uri": "https://forge.test/review?exp=9999999999999&sig=deadbeefdeadbeef",
        "blocked-uri": "https://forge.test/uploads/form-videos/a.mp4?exp=1&sig=abc123",
      },
    });
    expect(summary["document-uri"]).toBe("https://forge.test/review");
    expect(summary["blocked-uri"]).toBe("https://forge.test/uploads/form-videos/a.mp4");
    for (const value of Object.values(summary)) {
      expect(value).not.toContain("sig=");
      expect(value).not.toContain("exp=");
    }
  });

  it("survives a body that is not a report at all", () => {
    // Unauthenticated endpoint: the body is whatever anyone sends.
    expect(summarizeCspReport(null)).toEqual({});
    expect(summarizeCspReport("not json")).toEqual({});
    expect(summarizeCspReport({ "csp-report": "nope" })).toEqual({});
    expect(summarizeCspReport({ "csp-report": { "blocked-uri": { nested: true } } })).toEqual({});
  });
});
