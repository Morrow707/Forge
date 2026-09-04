import { describe, it, expect, vi, afterEach } from "vitest";
import crypto from "crypto";
import { isGatedUploadPath, signMediaUrl, verifyMediaUrl, signMediaUrlsDeep } from "./media-url-signing";

// Same fallback chain the module resolves at import time. Neither
// MEDIA_URL_SECRET nor SESSION_SECRET is set in a plain test run, so this is
// the dev placeholder -- computed the same way here rather than hardcoded so
// the tests still hold if the environment does set one.
const SECRET = process.env.MEDIA_URL_SECRET || process.env.SESSION_SECRET || "forge-dev-secret";
const TTL_MS = 6 * 60 * 60 * 1000;

function signFor(pathname: string, exp: number): string {
  return crypto.createHmac("sha256", SECRET).update(`${pathname}.${exp}`).digest("hex");
}

function parse(signed: string): { pathname: string; exp: string; sig: string } {
  const [pathname, query] = signed.split("?");
  const params = new URLSearchParams(query);
  return { pathname, exp: params.get("exp")!, sig: params.get("sig")! };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isGatedUploadPath", () => {
  const gated = [
    "/uploads/form-videos/abc.mp4",
    "/uploads/skill-videos/abc.mp4",
    "/uploads/annotations/abc.png",
    "/uploads/problem-reports/abc.png",
  ];
  for (const p of gated) {
    it(`gates ${p}`, () => expect(isGatedUploadPath(p)).toBe(true));
  }

  const ungated = [
    "/uploads/lesson-videos/abc.mp4",
    "/uploads/team-logos/abc.png",
    "/uploads/attachments/abc.pdf",
    "/uploads/images/abc.png",
    // No directory segment at all -- a bare file directly under /uploads.
    "/uploads/abc.mp4",
    // A directory deeper than the one-level shape these paths actually have.
    "/uploads/form-videos/nested/abc.mp4",
    // Not an uploads path at all.
    "/api/videos/form-videos/abc.mp4",
    "form-videos/abc.mp4",
    "",
  ];
  for (const p of ungated) {
    it(`does not gate ${p || "(empty string)"}`, () => expect(isGatedUploadPath(p)).toBe(false));
  }

  it("does not gate a traversal segment dressed up as a gated directory", () => {
    expect(isGatedUploadPath("/uploads/form-videos/../../etc/passwd")).toBe(false);
    expect(isGatedUploadPath("/uploads/../form-videos/abc.mp4")).toBe(false);
  });

  it("is case sensitive, matching how the directories are actually named on disk", () => {
    expect(isGatedUploadPath("/uploads/Form-Videos/abc.mp4")).toBe(false);
  });
});

describe("signMediaUrl", () => {
  it("leaves a public upload path untouched", () => {
    expect(signMediaUrl("/uploads/lesson-videos/a.mp4")).toBe("/uploads/lesson-videos/a.mp4");
  });

  it("appends an expiry and a signature to a gated path", () => {
    const signed = signMediaUrl("/uploads/form-videos/a.mp4");
    const { pathname, exp, sig } = parse(signed);
    expect(pathname).toBe("/uploads/form-videos/a.mp4");
    expect(sig).toBe(signFor(pathname, Number(exp)));
  });

  it("sets the expiry one TTL ahead", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { exp } = parse(signMediaUrl("/uploads/form-videos/a.mp4"));
    expect(Number(exp)).toBe(Date.now() + TTL_MS);
  });

  it("replaces an existing signature rather than declining to touch it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = signMediaUrl("/uploads/form-videos/a.mp4");
    vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));
    const second = signMediaUrl(first);
    expect(second).not.toBe(first);
    expect(parse(second).pathname).toBe("/uploads/form-videos/a.mp4");
    expect(Number(parse(second).exp)).toBeGreaterThan(Number(parse(first).exp));
    expect(verifyMediaUrl("/uploads/form-videos/a.mp4", parse(second).exp, parse(second).sig)).toBe(true);
  });

  it("signs the path only, so a query string on the input never leaks into the signature", () => {
    const signed = signMediaUrl("/uploads/form-videos/a.mp4?foo=bar");
    expect(signed.startsWith("/uploads/form-videos/a.mp4?exp=")).toBe(true);
    expect(signed).not.toContain("foo=bar");
  });
});

describe("verifyMediaUrl", () => {
  const path = "/uploads/form-videos/a.mp4";

  it("accepts a freshly signed URL", () => {
    const { exp, sig } = parse(signMediaUrl(path));
    expect(verifyMediaUrl(path, exp, sig)).toBe(true);
  });

  it("accepts any public path without a signature at all", () => {
    expect(verifyMediaUrl("/uploads/lesson-videos/a.mp4", undefined, undefined)).toBe(true);
  });

  it("refuses a gated path with no signature", () => {
    expect(verifyMediaUrl(path, undefined, undefined)).toBe(false);
  });

  it("refuses non-string exp or sig, including arrays a repeated query param produces", () => {
    const { exp, sig } = parse(signMediaUrl(path));
    expect(verifyMediaUrl(path, [exp], sig)).toBe(false);
    expect(verifyMediaUrl(path, exp, [sig])).toBe(false);
    expect(verifyMediaUrl(path, 1, sig)).toBe(false);
    expect(verifyMediaUrl(path, exp, null)).toBe(false);
  });

  it("refuses an expiry that is not a finite number", () => {
    const exp = String(Date.now() + TTL_MS);
    expect(verifyMediaUrl(path, "abc", signFor(path, Number("abc")))).toBe(false);
    expect(verifyMediaUrl(path, "Infinity", signFor(path, Infinity))).toBe(false);
    expect(verifyMediaUrl(path, exp, signFor(path, Number(exp)))).toBe(true);
  });

  it("refuses an expired signature even when the signature itself is valid", () => {
    const exp = Date.now() - 1000;
    expect(verifyMediaUrl(path, String(exp), signFor(path, exp))).toBe(false);
  });

  it("refuses a signature whose expiry was pushed out after signing", () => {
    const { exp, sig } = parse(signMediaUrl(path));
    const later = String(Number(exp) + 10 * 365 * 24 * 60 * 60 * 1000);
    expect(verifyMediaUrl(path, later, sig)).toBe(false);
  });

  it("refuses a signature minted for a different file", () => {
    const { exp, sig } = parse(signMediaUrl(path));
    expect(verifyMediaUrl("/uploads/form-videos/someone-elses.mp4", exp, sig)).toBe(false);
  });

  it("refuses a signature minted for the same filename in a different gated directory", () => {
    const { exp, sig } = parse(signMediaUrl(path));
    expect(verifyMediaUrl("/uploads/skill-videos/a.mp4", exp, sig)).toBe(false);
  });

  it("refuses a flipped character in the signature", () => {
    const { exp, sig } = parse(signMediaUrl(path));
    const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyMediaUrl(path, exp, flipped)).toBe(false);
  });

  it("refuses a truncated signature without throwing on the length mismatch", () => {
    const { exp, sig } = parse(signMediaUrl(path));
    expect(verifyMediaUrl(path, exp, sig.slice(0, 32))).toBe(false);
    expect(verifyMediaUrl(path, exp, "")).toBe(false);
  });

  it("refuses a signature that is not hex at all", () => {
    const { exp } = parse(signMediaUrl(path));
    expect(verifyMediaUrl(path, exp, "z".repeat(64))).toBe(false);
    expect(verifyMediaUrl(path, exp, "not a signature")).toBe(false);
  });

  // Was skipped when this test was written, against the defect it describes:
  // an unrecognized path under /uploads/ was treated as public, so one with
  // an extra segment -- including a traversal resolving back into a gated
  // directory -- was served without a signature. Such paths are now denied
  // rather than waved through; see isWalkedUploadPath.
  it("refuses a signed path walked out of its gated directory", () => {
    const { exp, sig } = parse(signMediaUrl(path));
    expect(verifyMediaUrl("/uploads/form-videos/../../../etc/passwd", exp, sig)).toBe(false);
    expect(verifyMediaUrl("/uploads/lesson-videos/../form-videos/a.mp4", undefined, undefined)).toBe(false);
  });
});

describe("signMediaUrlsDeep", () => {
  it("signs gated URLs nested anywhere in a response body", () => {
    const body = {
      id: 1,
      video: "/uploads/form-videos/a.mp4",
      sets: [{ url: "/uploads/skill-videos/b.mp4" }, { url: "/uploads/lesson-videos/c.mp4" }],
      nested: { deep: { shot: "/uploads/problem-reports/d.png" } },
    };
    const out = signMediaUrlsDeep(body);
    expect(out.video).toMatch(/^\/uploads\/form-videos\/a\.mp4\?exp=\d+&sig=[0-9a-f]{64}$/);
    expect(out.sets[0].url).toContain("sig=");
    expect(out.sets[1].url).toBe("/uploads/lesson-videos/c.mp4");
    expect(out.nested.deep.shot).toContain("sig=");
  });

  it("leaves non-uploads strings and non-string values alone", () => {
    const body = { a: "hello", b: 3, c: null, d: true, e: "https://example.com/x" };
    expect(signMediaUrlsDeep({ ...body })).toEqual(body);
  });

  it("mutates in place so a route can sweep a body it already built", () => {
    const body = { video: "/uploads/form-videos/a.mp4" };
    expect(signMediaUrlsDeep(body)).toBe(body);
    expect(body.video).toContain("sig=");
  });

  it("handles an empty array and an empty object without touching them", () => {
    expect(signMediaUrlsDeep([])).toEqual([]);
    expect(signMediaUrlsDeep({})).toEqual({});
  });

  it("produces URLs that verify with the exp and sig it wrote", () => {
    const out = signMediaUrlsDeep({ video: "/uploads/annotations/a.png" });
    const { pathname, exp, sig } = parse(out.video);
    expect(verifyMediaUrl(pathname, exp, sig)).toBe(true);
  });
});
