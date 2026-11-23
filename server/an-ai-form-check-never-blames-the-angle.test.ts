/**
 * RULE #1: NO SURFACE EVER TELLS THE ATHLETE WHERE TO STAND (2026-11-23). The AI form check said
 * "Couldn't get a read on that video -- try again with a clearer angle." when the AI had not looked
 * at the video at all (the API account had hit its spending limit), and its prompts invited the
 * model to report a "bad angle". Comments stripped first, so this note cannot satisfy or fail it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const storage = strip(readFileSync("server/storage.ts", "utf8"));

describe("the AI form check never blames the camera angle", () => {
  it("no fallback or prompt asks for a clearer or better angle", () => {
    expect(storage).not.toMatch(/clearer angle|bad angle/i);
  });

  it("each form-check prompt tells the model not to say where to film from", () => {
    expect((storage.match(/Never tell them where to film from/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("an unanswered form check says the AI did not look, and that the clip is kept", () => {
    expect((storage.match(/The AI coach couldn't look at this video right now\. Your clip and your numbers are saved\./g) ?? []).length).toBe(2);
  });
});
