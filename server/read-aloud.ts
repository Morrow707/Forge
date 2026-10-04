import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { UPLOADS_ROOT } from "./uploaded-files";
import { speakableText, splitForNarration } from "@shared/read-aloud-text";

/** READ-ALOUD WITH A REAL VOICE (2026-10-04). Scott, on item 13: "can you give it like a real
 * voice? ... make it sound like a podcast with a 'real' voice". The phone's own speech engine
 * is the fallback the client always has; a natural voice needs a cloud text-to-speech
 * provider, which is a second API key on Render and Scott's to supply. Nothing here runs
 * until it is set.
 *
 * - READ_ALOUD_PROVIDER=openai and OPENAI_API_KEY turn it on. READ_ALOUD_VOICE (default
 *   "alloy") and READ_ALOUD_MODEL (default "gpt-4o-mini-tts") pick the narrator; one voice
 *   for every lesson, so the whole library sounds like one person.
 * - A page is narrated ONCE and cached as a file under STORAGE_PATH/narration, keyed by the
 *   provider, the voice, the model and the text, so a changed page is re-read and an
 *   unchanged one never is. A thousand athletes pressing play cost one request.
 * - The file is public by URL, like a lesson video: it is the lesson's own words, read.
 * - The provider is given the speakable text (shared/read-aloud-text.ts), in pieces the
 *   provider's request size allows, and the pieces are joined into one MP3. */
const NARRATION_DIR = path.join(UPLOADS_ROOT, "narration");

export function readAloudProvider(): "openai" | null {
  return process.env.READ_ALOUD_PROVIDER === "openai" && !!process.env.OPENAI_API_KEY ? "openai" : null;
}

function voice(): string {
  return process.env.READ_ALOUD_VOICE || "alloy";
}
function model(): string {
  return process.env.READ_ALOUD_MODEL || "gpt-4o-mini-tts";
}

export function narrationCacheKey(text: string, provider = readAloudProvider() ?? "none"): string {
  return crypto.createHash("sha256").update(`${provider}|${voice()}|${model()}|${text}`).digest("hex").slice(0, 40);
}

async function synthesizeOpenAi(piece: string): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: model(), voice: voice(), input: piece, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`read-aloud provider answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The URL of this text's narration, making it if it does not exist yet. Null when no
 * provider is configured (the client then uses the device voice). Throws when the provider
 * fails, which the route turns into a 503 and the client into the same fallback. */
export async function getOrCreateNarration(body: string): Promise<string | null> {
  const provider = readAloudProvider();
  if (!provider) return null;
  const text = speakableText(body);
  if (!text) return null;
  const key = narrationCacheKey(text, provider);
  const file = path.join(NARRATION_DIR, `${key}.mp3`);
  const url = `/uploads/narration/${key}.mp3`;
  if (fs.existsSync(file)) return url;
  fs.mkdirSync(NARRATION_DIR, { recursive: true });
  const parts: Buffer[] = [];
  for (const piece of splitForNarration(text)) parts.push(await synthesizeOpenAi(piece));
  // Written whole under a temporary name, then renamed, so a reader never streams a half file.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, Buffer.concat(parts));
  fs.renameSync(tmp, file);
  console.log(`[read-aloud] narrated ${text.length} chars into ${url}`);
  return url;
}
