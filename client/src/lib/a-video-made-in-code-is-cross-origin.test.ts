import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A VIDEO MADE IN CODE AND READ INTO A CANVAS ASKS FOR CORS TOO (2026-11-20). Scott, after a
// deadlift set on build 797: "The operation is insecure." The AI form check loads the uploaded
// clip into an offscreen document.createElement("video") and reads frames back with toDataURL;
// the clip is served from the API host, which in the native app's capacitor:// page is another
// origin, so the canvas was tainted and the read threw. a-video-read-into-a-canvas-is-cross-origin
// covers <video> written in JSX; this covers the ones made in code. FORBIDDEN: a file that makes a
// video, reads a canvas, and never sets crossOrigin -- unless every video it loads is a phone-local
// blob (URL.createObjectURL), which is same-origin.

const CLIENT = join(__dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(n) && !n.includes(".test.") ? [p] : [];
  });
}
/** Comments removed, so a sentence about crossOrigin never counts as setting it. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");

const MAKES_VIDEO = /document\.createElement\(\s*["']video["']\s*\)/;
const READS_CANVAS = /\b(toDataURL|getImageData|toBlob|drawImage)\s*\(/;
const SETS_CORS = /\.crossOrigin\s*=\s*["']anonymous["']/;
const LOCAL_ONLY = /URL\.createObjectURL\(/;

describe("a video made in code and drawn into a canvas", () => {
  const subjects = files(CLIENT).filter((f) => {
    const src = code(readFileSync(f, "utf8"));
    return MAKES_VIDEO.test(src) && READS_CANVAS.test(src);
  });

  it("finds the frame grabbers it is about", () => {
    const names = subjects.map((f) => f.slice(CLIENT.length));
    expect(names).toEqual(expect.arrayContaining(["/lib/video-frames.ts", "/lib/video-watermark.ts", "/lib/extract-video-frames.ts"]));
  });

  it("asks for CORS unless it only ever loads a phone-local blob", () => {
    const offenders = subjects.filter((f) => {
      const src = code(readFileSync(f, "utf8"));
      return !SETS_CORS.test(src) && !LOCAL_ONLY.test(src);
    });
    expect(offenders.map((f) => f.slice(CLIENT.length))).toEqual([]);
  });

  it("does not count a comment as the setting", () => {
    expect(SETS_CORS.test(code('// video.crossOrigin = "anonymous";\nvideo.src = url;'))).toBe(false);
  });
});
