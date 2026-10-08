import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isGatedUploadPath } from "./media-url-signing";

/* EVERY UPLOAD DIRECTORY IS GATED OR PUBLIC BY A STATED DECISION, NEVER BY OMISSION.
 *
 * media-url-signing.test.ts is thorough about the signing scheme and lists FOUR of the gated
 * directories by hand. A hand-written list cannot fail for a directory nobody put on it, and on
 * 2026-10-08 the launch audit's signed-out sweep found what that costs:
 *
 *   POST /api/coach/reference-clips/from-athlete calls
 *   copyUploadedFile(athleteClipUrl, "reference-clips")
 *
 * The source is in form-videos and gated. "reference-clips" was in neither GATED_UPLOAD_DIRS nor
 * anybody's list, so the COPY was served with no session, no signature and no expiry -- a coach
 * tapping "save as reference" on a minor's bench press turned that footage into a file anyone
 * holding the URL could fetch, forever. knowledge-sources, which holds the purchased textbook,
 * was unclassified the same way.
 *
 * So this file holds no list of what is gated. It DISCOVERS every directory the server writes to
 * and requires each to be one or the other, with the public ones carrying a reason here. The
 * same shape as camera-columns-are-classified.test.ts, and for the same reason: the next
 * directory will not be on anybody's list either.
 */

const SERVER = join(import.meta.dirname);

function serverSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "uploads" || entry === "test-support") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      serverSources(full, out);
    } else if (entry.endsWith(".ts") && !entry.includes(".test.") && !entry.includes(".itest.")) {
      out.push(full);
    }
  }
  return out;
}

/** Every directory under /uploads/ that server code writes to or names.
 *
 * Two spellings, because the code uses both and a scan that knew only one would have missed
 * reference-clips in exactly the place it mattered: `path.join(UPLOADS_ROOT, "x")` builds the
 * destination, and `/uploads/x/...` builds the stored URL. */
function discoverUploadDirs(): Set<string> {
  const found = new Set<string>();
  for (const file of serverSources(SERVER)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/path\.join\(\s*UPLOADS_ROOT\s*,\s*"([a-z][a-z-]*)"/g)) found.add(m[1]);
    for (const m of src.matchAll(/\/uploads\/([a-z][a-z-]*)\//g)) found.add(m[1]);
  }
  return found;
}

/* PUBLIC BY DECISION. Every entry needs a reason that says why no reader is harmed by the file
 * being fetchable with no credential -- never "it seemed fine". A directory holding anything
 * about a named person does not belong on this list. */
const PUBLIC_UPLOAD_DIRS: Record<string, string> = {
  "lesson-videos":
    "A class or track lesson's video. Lesson media is content Forge publishes, not a record of " +
    "anybody, and is deliberately served public by URL (see media-url-signing.ts's own note).",
  "lesson-images":
    "Illustrations inside a lesson page. Same standing as lesson-videos: authored content, no person in it.",
  "lesson-attachments":
    "A handout attached to a lesson. Authored content again. If one ever carries an athlete's " +
    "name or result, it belongs in the gated set instead and this entry has to change.",
  narration:
    "Read-aloud audio of a lesson, cached under STORAGE_PATH/narration and served public by URL " +
    "like the lesson video it narrates. It is a synthetic voice reading published text.",
  "team-logos":
    "A program's logo. It is drawn on /team/:slug and on the login screen BEFORE there is a " +
    "session, so it cannot require one -- a signature here would break the branded login page.",
  "team-branding":
    "The rest of a program's brand assets, drawn on the same pre-session screens as team-logos.",
  attachments:
    "Legacy path, no writer left in server code; kept classified so a future writer under this " +
    "name is a decision rather than a default.",
  images:
    "Legacy path, no writer left in server code either; classified for the same reason as " +
    "attachments, so a future writer under this name has to make the choice deliberately.",
};

describe("every upload directory", () => {
  const discovered = [...discoverUploadDirs()].sort();

  it("is discovered by the scan at all, so this file cannot pass vacuously", () => {
    // If a refactor renames UPLOADS_ROOT or moves these paths, the scan finds nothing and every
    // assertion below passes while checking nothing. The two named here are the ones this file
    // exists because of.
    expect(discovered.length).toBeGreaterThanOrEqual(12);
    expect(discovered).toContain("reference-clips");
    expect(discovered).toContain("knowledge-sources");
    expect(discovered).toContain("form-videos");
  });

  it("is either gated or listed as public with a reason", () => {
    const unclassified = discovered.filter(
      (dir) => !isGatedUploadPath(`/uploads/${dir}/file.bin`) && !(dir in PUBLIC_UPLOAD_DIRS),
    );
    expect(
      unclassified,
      `Unclassified upload director${unclassified.length === 1 ? "y" : "ies"}: ${unclassified.join(", ")}. ` +
        "Add it to GATED_UPLOAD_DIRS in server/media-url-signing.ts, or to PUBLIC_UPLOAD_DIRS in " +
        "this file with a reason saying why no reader is harmed by it being fetchable with no " +
        "credential. Defaulting to public is what made a minor's form-check clip public by URL.",
    ).toEqual([]);
  });

  it("is never both", () => {
    for (const dir of Object.keys(PUBLIC_UPLOAD_DIRS)) {
      expect(isGatedUploadPath(`/uploads/${dir}/file.bin`), `${dir} is listed public AND gated`).toBe(false);
    }
  });

  it("carries a real reason on every public entry, not a word", () => {
    for (const [dir, why] of Object.entries(PUBLIC_UPLOAD_DIRS)) {
      expect(why.length, `${dir}'s reason is too short to be one`).toBeGreaterThan(60);
    }
  });
});

/* THE SPECIFIC SHAPE THAT WENT WRONG, generalised so it cannot recur in another directory.
 *
 * A file copied OUT of a gated directory is the same file it was. If copyUploadedFile's
 * destination is public, the copy is public, and the gate on the original is decorative. */
describe("copyUploadedFile", () => {
  const callSites: { file: string; dest: string }[] = [];
  for (const file of serverSources(SERVER)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/copyUploadedFile\(\s*[^,]+,\s*"([a-z][a-z-]*)"/g)) {
      callSites.push({ file: file.replace(`${SERVER}/`, ""), dest: m[1] });
    }
  }

  it("has call sites the scan can see", () => {
    // The whole bug was one call site. A scan that finds zero proves nothing.
    expect(callSites.length).toBeGreaterThan(0);
  });

  it("only ever copies into a GATED directory", () => {
    // Deliberately stricter than "gated if the source was gated": the source is a
    // client-supplied URL resolved at runtime, so it cannot be known from the source text, and a
    // destination that is gated regardless is correct for every source. The cost of gating a
    // copy that did not need it is one signature, applied automatically by the res.json sweep in
    // server/index.ts. The cost of the other mistake was a child's video.
    const leaky = callSites.filter((c) => !isGatedUploadPath(`/uploads/${c.dest}/file.bin`));
    expect(
      leaky,
      `copyUploadedFile writes into an ungated directory: ${leaky
        .map((c) => `${c.dest} (${c.file})`)
        .join(", ")}. A copy of a gated file is still that file.`,
    ).toEqual([]);
  });
});
