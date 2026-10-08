// A QUEUED CLIP SAYS WHERE IT WENT, AND GOES BACK WHERE IT CAME FROM.
//
// Two bugs off Scott's build 643 console, both in video-offline-store.ts, both the kind that
// only a debug console on the phone can show because nothing else is watching.
//
// 1. THE FLUSH WAS SILENT. At 34:27 an 11MB clip failed with "NetworkError: Can't reach Forge"
//    and logged `queued for retry (offline)`. The app relaunched on Wi-Fi at 51:27 and the
//    console never mentioned that clip again. Uploaded, still queued and dropped were
//    indistinguishable. This is the hole the LOG queue had, found the same way and closed in
//    build 620; the video half was never done, so the same lesson had to be learned twice.
//
// 2. A FAILED SKILL CLIP WAS QUEUED AGAINST THE WRONG ENDPOINT. uploadOrQueueVideo takes an
//    `endpoint` (the four skill dialogs post to /api/athlete/skill-video), the Wi-Fi gate at
//    the top queues to it correctly, and the catch at the bottom passed the form-check literal
//    instead. So a sprint or mechanics clip that failed WHILE ON Wi-Fi was retried to the
//    form-video route and landed against the wrong record, while the same clip failing OFF
//    Wi-Fi queued correctly. Whether a skill video survived depended on which radio was up.
//
// Source-sliced rather than driven, like every other test over this file: the module reaches
// Capacitor Filesystem, Network and App listeners at import, and a mock deep enough to drive
// it would be asserting against the mock.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const src = read("client/src/lib/video-offline-store.ts");

const slice = (from: string, to: string) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  expect(a, `could not find ${from}`).toBeGreaterThan(-1);
  expect(b, `could not find ${to}`).toBeGreaterThan(a);
  return src.slice(a, b);
};

const uploadOrQueue = () => slice("export async function uploadOrQueueVideo", "async function uploadPendingEntry");
const flush = () => slice("async function runVideoFlush()", "export function startOfflineVideoSync");

describe("a failed clip is queued to the endpoint its caller asked for", () => {
  it("passes `endpoint` on BOTH queue paths, not a hardcoded route", () => {
    const fn = uploadOrQueue();
    // Every persist in this function hands over the caller's endpoint. Two of them: the Wi-Fi
    // gate and the catch. Before the fix the second was the form-check literal.
    const persists = fn.match(/persistVideoForUpload\([\s\S]*?\)/g) ?? [];
    expect(persists.length).toBeGreaterThanOrEqual(2);
    for (const call of persists) {
      expect(call, `a queue path hardcodes its route: ${call}`).not.toContain('"/api/athlete/form-video"');
    }
  });

  it("names the form-check route ONCE, as the parameter default and nowhere else", () => {
    // The default is the whole reason eleven of the fifteen dialogs need pass nothing. A
    // SECOND occurrence inside the body is the bug: a route that ignores what it was handed.
    const fn = uploadOrQueue();
    expect(fn.match(/"\/api\/athlete\/form-video"/g) ?? []).toHaveLength(1);
    expect(fn).toContain('endpoint: string = "/api/athlete/form-video"');
  });

  it("keeps the skill route reachable, so the fix has something to be right about", () => {
    // If no caller passes an endpoint, the parameter is decoration and the bug is invisible.
    const dialogs = read("client/src/components/av-sprint-tracker-dialog.tsx");
    expect(dialogs).toContain("/api/athlete/skill-video");
  });
});

describe("every exit of the video flush writes a line", () => {
  it("logs the hold, and says it is a hold rather than a failure", () => {
    // Not on Wi-Fi is the commonest reason nothing happens, and it is not an error. It used
    // to share one silent `return` with "this platform has no persistence at all", which are
    // different facts and read identically: nothing.
    const fn = flush();
    expect(fn).toContain("waiting for Wi-Fi");
    expect(fn).not.toMatch(/if \(!isVideoOfflinePersistenceSupported\(\) \|\| !\(await isOnWifi\(\)\)\) return;/);
  });

  it("logs the count, every skip, every success, every drop and every retry", () => {
    const fn = flush();
    for (const line of ["flush: ", "flush SKIPPED", "flush ok", "flush DROPPED", "flush retry"]) {
      expect(fn, `the flush has no "${line}" line`).toContain(line);
    }
  });

  it("THE RETRY BRANCH IS AN else, NOT A COMMENT -- this was the 51:27 silence", () => {
    // The transient case (still offline, server having a moment, a bad file read) was handled
    // entirely by a comment saying "leave it queued". That branch is the one Scott's clip took
    // and the one that wrote nothing. A bare fallthrough here is the bug coming back.
    const fn = flush();
    const dropIdx = fn.indexOf("isPermanentUploadRejection(status, code)");
    expect(dropIdx).toBeGreaterThan(-1);
    const after = fn.slice(dropIdx);
    expect(after).toContain("} else {");
    expect(after.indexOf("flush retry")).toBeGreaterThan(after.indexOf("} else {"));
  });

  it("no `continue` in the flush is silent", () => {
    // The build-620 shape exactly: a legitimate skip and a crash look the same when nothing is
    // written down. The log must be the statement IMMEDIATELY before the continue.
    //
    // This started as a four-line lookback and mutation-testing showed it passing on a silent
    // skip, because the window reached back past the enclosing `if` and found the flush
    // HEADER's log line. A guard that can be satisfied by an unrelated log two statements up
    // is not watching the thing it names.
    const lines = flush().split("\n");
    let checked = 0;
    lines.forEach((line, i) => {
      if (!/^\s*continue;\s*$/.test(line)) return;
      checked++;
      const prev = lines
        .slice(0, i)
        .reverse()
        .find((l) => l.trim() !== "" && !l.trim().startsWith("//"));
      expect(prev ?? "", `a silent continue at flush line ${i}: ${line}`).toContain("logDebug");
    });
    // A test that found no `continue` at all would pass vacuously after a refactor.
    expect(checked, "the flush has no continue to check -- did the loop change shape?").toBeGreaterThan(0);
  });

  it("shares the log queue's vocabulary, so one console reads as one instrument", () => {
    // offline-queue.ts settled these four words in build 620. Two queues on one phone using
    // different manners for the same four outcomes is a console nobody can skim.
    const logQueue = read("client/src/lib/offline-queue.ts");
    for (const word of ["flush ok", "flush DROPPED", "flush SKIPPED", "flush retry"]) {
      expect(logQueue, `the log queue lost "${word}"`).toContain(word);
      expect(flush(), `the video queue lost "${word}"`).toContain(word);
    }
  });

  it("changes nothing about which entries are attempted, dropped or kept", () => {
    // Rule #1's reading for the save path applies to the clip: this commit is an instrument,
    // not a policy. The drop is still gated on the one shared classifier and nothing else.
    const fn = flush();
    expect(fn).toContain("isPermanentUploadRejection(status, code)");
    expect(fn).toContain("clearPersistedVideo(entry.id)");
    // Exactly one place a clip is deleted, and it is behind that classifier.
    expect(fn.match(/clearPersistedVideo/g) ?? []).toHaveLength(1);
  });
});
