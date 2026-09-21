import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// A MISSING PURPOSE STRING IS AN UPLOAD REJECTION, AND NOTHING BEFORE THE UPLOAD SAYS SO.
//
// iOS refuses a binary that calls a privacy-gated API without the matching Info.plist key --
// error 90683. It archives cleanly, it signs cleanly, the app runs fine in the simulator, and it
// bounces at App Store Connect. This repo has already paid for that once: a Health string was
// removed on the reasoning that the app never writes to Health, the old verify_build went green,
// and the upload failed (see Info.plist's own comment and CLAUDE.md).
//
// verify_build now catches it by asking altool, which is the right backstop. This is the cheaper
// front stop: if the client asks for a capability, the string has to exist, and a developer
// finds out in `npm test` rather than twenty minutes into a build.
//
// Scans rather than holding a list, for the reason every other scan in this repo does: the next
// getUserMedia call will not be on anybody's list.
const CLIENT = join(__dirname, "..");
const INFO_PLIST = readFileSync(
  join(__dirname, "..", "..", "..", "ios", "App", "App", "Info.plist"),
  "utf8",
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const SOURCES = walk(CLIENT).map((f) => ({ file: f, src: readFileSync(f, "utf8") }));
const ALL = SOURCES.map((s) => s.src).join("\n");

/** What the client asks for, and the Info.plist key iOS demands in return. */
const CAPABILITIES: { pattern: RegExp; key: string; what: string }[] = [
  { pattern: /getUserMedia\(\s*\{[^}]*\baudio\b\s*:\s*(?!false)/s, key: "NSMicrophoneUsageDescription", what: "microphone capture" },
  { pattern: /getUserMedia\(\s*\{[^}]*\bvideo\b\s*:\s*(?!false)/s, key: "NSCameraUsageDescription", what: "camera capture" },
];

describe("every media capability the client asks for has an iOS purpose string", () => {
  it("is reading the sources it thinks it is", () => {
    // The failure mode of a scan is matching nothing and passing forever.
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(ALL).toContain("getUserMedia");
  });

  it.each(CAPABILITIES.map((c) => [c.what, c] as const))(
    "%s has its Info.plist key",
    (_what, capability) => {
      if (!capability.pattern.test(ALL)) return; // not used -- nothing to require
      expect(
        INFO_PLIST,
        `the client requests ${capability.what} but Info.plist has no ${capability.key}. ` +
          "iOS rejects the upload with error 90683.",
      ).toContain(capability.key);
    },
  );

  it("gives every declared purpose string a non-empty explanation", () => {
    // An empty string satisfies the key check and still reads as a blank permission prompt to
    // the person being asked, which is its own kind of failure.
    for (const m of INFO_PLIST.matchAll(/<key>(NS\w*UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)) {
      expect(m[2].trim().length, `${m[1]} is empty`).toBeGreaterThan(20);
    }
  });

  it("explains the microphone in terms of what the coach is doing", () => {
    // Apple rejects a vague purpose string as readily as a missing one, and a coach reading it
    // deserves to know recording is opt-in rather than always-on.
    const mic = INFO_PLIST.match(
      /<key>NSMicrophoneUsageDescription<\/key>\s*<string>([^<]*)<\/string>/,
    );
    expect(mic).toBeTruthy();
    expect(mic![1].toLowerCase()).toContain("voice-over");
  });
});
