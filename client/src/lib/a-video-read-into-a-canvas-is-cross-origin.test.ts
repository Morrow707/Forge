import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* A <video> WHOSE FRAMES ARE READ BACK INTO A CANVAS MUST DECLARE crossOrigin.
 *
 * Found 2026-10-24, in the THIRD file to have it. The native app's page origin is
 * `capacitor://localhost` (queryClient.ts says so outright) and every upload is served from the
 * API host, so a `<video src={resolveApiUrl(...)}>` is cross-origin there. Plain playback does
 * not care. The moment a canvas `drawImage`s that element, the canvas is TAINTED, and
 * `toDataURL` / `toBlob` / `getImageData` throw "the operation is insecure" rather than
 * returning anything.
 *
 * `video-analysis-dialog.tsx` and `video-pose-analysis.ts` both carry `crossOrigin="anonymous"`
 * with a comment explaining exactly this. `video-annotation-dialog.tsx` did not -- so a coach on
 * the iPhone app tapping **"Capture This Frame"** got NOTHING: no toast, no error, no state
 * change, forever. The throw left an onClick handler, which React logs to a console that does
 * not exist on a phone, and the web build is same-origin so it worked in every browser. A
 * correction wired to two of three paths, invisible because the paths that WERE taken worked.
 *
 * WHY THE ATTRIBUTE IS SAFE HERE, since withholding credentials usually breaks a gated fetch:
 * the `/uploads` gate is `verifyMediaUrl(path, exp, sig)` -- a SIGNED URL, not a cookie -- and
 * its own comment in routes.ts says signed media URLs exist "precisely because the session
 * cookie doesn't reliably travel with a bare <video src> fetch on iOS native". So
 * `crossOrigin="anonymous"` withholds a credential the request never sent, and the app-wide
 * `cors()` already allows `capacitor://localhost`.
 *
 * Stated as what is FORBIDDEN and discovered from the directory, so the fourth file fails here
 * the day it is written rather than shipping a button that does nothing.
 */

const SRC = join(process.cwd(), "client", "src");

/** Comments first: the paragraph above and the one in the fixed file quote every pattern this
 *  scan looks for, and prose about what the code no longer does is indistinguishable from the
 *  code still doing it. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ").replace(/\/\/[^\n]*/g, " ");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

/** Every JSX `<video ... />` element in the source, bounded by its own angle bracket rather than
 *  a character window -- a fixed slice would both miss a long element and run into the next one.
 *  Self-closing and paired forms both end at the first `>` that is not inside a brace. */
function videoElements(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<video\b/g)) {
    let depth = 0;
    for (let i = m.index! + 6; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        out.push(src.slice(m.index!, i + 1));
        break;
      }
    }
  }
  return out;
}

const files = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f));

/** A file is in scope when it renders a `<video>` pointed at a SERVER url and also reads a canvas
 *  back. A video built in JS from a freshly recorded blob is same-origin and not this class, which
 *  is why the scope is the JSX element with resolveApiUrl rather than every drawImage in the app. */
const inScope = files
  .map((f) => ({ file: f, src: strip(readFileSync(f, "utf8")) }))
  .filter(
    ({ src }) =>
      /<video\b/.test(src) &&
      /resolveApiUrl\s*\(/.test(src) &&
      /\.(toDataURL|toBlob|getImageData)\s*\(/.test(src),
  );

describe("a video read back into a canvas declares crossOrigin", () => {
  it("finds the files that do this at all", () => {
    // A floor: if this stops matching, the rule below passes for nothing.
    expect(
      inScope.length,
      "no file renders a <video src={resolveApiUrl(...)}> and reads a canvas back. Either that " +
        "stopped being true (delete this file) or the scan has gone blind.",
    ).toBeGreaterThanOrEqual(1);
  });

  it.each(inScope.map((x) => [x.file.slice(x.file.indexOf("client/")), x.src]))(
    "%s sets crossOrigin on every such video",
    (label, src) => {
      const serverVideos = videoElements(src).filter((v) => /resolveApiUrl/.test(v));
      expect(
        serverVideos.length,
        `${label} matched the scope but no <video> in it points at resolveApiUrl -- the element ` +
          `scanner has gone blind.`,
      ).toBeGreaterThanOrEqual(1);
      for (const v of serverVideos) {
        expect(
          /crossOrigin\s*=/.test(v),
          `${label} renders a <video> from resolveApiUrl and reads a canvas back, without ` +
            `crossOrigin. On the native app the page is capacitor://localhost and the video is ` +
            `on the API host, so drawImage taints the canvas and toDataURL/toBlob/getImageData ` +
            `THROWS -- which, out of an onClick handler, is a control that silently does ` +
            `nothing on a phone and works in every browser. The uploads gate is a signed URL, ` +
            `not a cookie, so the attribute cannot break playback.`,
        ).toBe(true);
      }
    },
  );

  it("and the annotation dialog's capture says something rather than nothing if it still fails", () => {
    /* The attribute is the fix; this is the part that makes the next failure legible. A throw out
     * of an onClick reaches no error boundary and no console anybody can read on a phone. */
    const src = strip(
      readFileSync(join(SRC, "components", "video-annotation-dialog.tsx"), "utf8"),
    );
    const at = src.indexOf("function captureFrame");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toMatch(/try\s*\{/);
    expect(
      body,
      "captureFrame reads the canvas back outside a try, so a taint (or any other failure) is a " +
        "button that does nothing with no way for the coach to know why.",
    ).toMatch(/catch\s*\{[\s\S]*toast\.error/);
  });
});
