import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { refusalSentence } from "@/components/read-failed";
import { ApiError, NetworkError } from "@/lib/queryClient";

/* A REFUSAL IS NOT A FAILED READ (2026-11-12). The scale test found "We couldn't load ... That
 * isn't the same as there being none", with a Try again button, on screens whose real answer was
 * permanent. ReadFailed now says the server's sentence for a 403/404/409/410 and offers no retry;
 * a dropped connection and a 500 read as before. The seven screens the crawl hit pass the error. */

const ROOT = join(__dirname, "..", "..", "..");
const NOT_FOUND = 404;
const FORBIDDEN = 403;
const CONFLICT = 409;
const SERVER_ERROR = 500;
const RATE_LIMITED = 429;

describe("what a refused read says", () => {
  it("uses the server's own sentence for a permanent refusal", () => {
    expect(refusalSentence(new ApiError(CONFLICT, "Finish every lesson in this class first."))).toBe(
      "Finish every lesson in this class first.",
    );
  });

  it("falls back to a plain sentence when the server sent only a status word", () => {
    expect(refusalSentence(new ApiError(NOT_FOUND, "Not found"))).toBe("This doesn't exist, or it isn't yours to see.");
    expect(refusalSentence(new ApiError(FORBIDDEN, "Forbidden."))).toBe("This isn't available to your account.");
  });

  it("leaves a failure worth retrying alone", () => {
    expect(refusalSentence(new ApiError(SERVER_ERROR, "Something broke"))).toBeNull();
    expect(refusalSentence(new ApiError(RATE_LIMITED, "Slow down"))).toBeNull();
    expect(refusalSentence(new NetworkError("Can't reach Forge"))).toBeNull();
    expect(refusalSentence(undefined)).toBeNull();
  });
});

describe("the screens the crawl hit hand the error to ReadFailed", () => {
  const sites: [string, string][] = [
    ["client/src/pages/coach/coaches-corner-certificate.tsx", 'what="the certificate"'],
    ["client/src/pages/athlete/class-certificate.tsx", 'what="the certificate"'],
    ["client/src/pages/athlete/class-detail.tsx", 'what="this class"'],
    ["client/src/pages/workout.tsx", 'what="this workout"'],
    ["client/src/pages/coach/athlete-detail.tsx", "what=\"this athlete's profile\""],
    ["client/src/pages/documents.tsx", 'what={forSomeoneElse ? "these forms" : "your documents"}'],
  ];
  it.each(sites)("%s", (file, what) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    const at = src.indexOf(what);
    expect(at).toBeGreaterThan(-1);
    const element = src.slice(at, src.indexOf("/>", at));
    expect(element).toContain("error={error}");
  });
});
