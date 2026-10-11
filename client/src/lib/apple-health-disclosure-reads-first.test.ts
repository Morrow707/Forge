import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { APPLE_HEALTH_DISCLOSURE } from "@shared/apple-health-disclosure";

// Counsel's Apple Health disclosure has to be on screen BEFORE the phone's
// Health permission sheet opens, on every surface that can open it. The
// Settings switch had the sentence beside its checkbox from the day it was
// written (build 597); the daily check-in did not -- it opened the OS sheet
// by itself on an athlete's first visit, through promptHealthSyncOnce, and
// its Sync button did the same -- so two of the three ways into the sheet
// showed the permission first and the disclosure never. The sheet lists what
// Forge READS; the disclosure says where it GOES, and the second is the one
// Apple reads a health app for.
//
// This scans rather than lists: every file under client/src that can reach
// the permission sheet must render the one shared constant, and the constant
// must be the Privacy Policy's own sentence, verbatim.
const root = join(__dirname, "..", "..", "..");
const clientSrc = join(root, "client", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(clientSrc).map((f) => ({ path: relative(root, f), source: readFileSync(f, "utf8") }));
const nativeHealth = files.find((f) => f.path.endsWith("client/src/lib/native-health.ts"))!;
const policy = readFileSync(join(root, "server", "seed-data", "legal-documents-draft.ts"), "utf8");

describe("the Apple Health disclosure reads before the permission sheet", () => {
  it("is the Privacy Policy's sentence, verbatim", () => {
    expect(policy).toContain(APPLE_HEALTH_DISCLOSURE);
    expect(APPLE_HEALTH_DISCLOSURE).toMatch(/third-party AI provider/);
    expect(APPLE_HEALTH_DISCLOSURE).toMatch(/never retained to train/);
  });

  it("opens the permission sheet from exactly one place, enableHealthSync", () => {
    const askers = files.filter((f) => /Health\.requestAuthorization\(/.test(f.source));
    expect(askers.map((f) => f.path)).toEqual(["client/src/lib/native-health.ts"]);
    const fn = nativeHealth.source.slice(
      nativeHealth.source.indexOf("export async function enableHealthSync("),
      nativeHealth.source.indexOf("export function markHealthSyncPrompted("),
    );
    expect(fn).toMatch(/Health\.requestAuthorization\(/);
    expect(nativeHealth.source.match(/Health\.requestAuthorization\(/g)).toHaveLength(1);
  });

  it("has no disclosure-free first ask left anywhere", () => {
    // promptHealthSyncOnce was the helper that opened the sheet on the
    // check-in's first visit with nothing read first. Its replacement,
    // markHealthSyncPrompted, records a "Not now" without touching the sheet.
    for (const f of files) {
      expect(f.source, f.path).not.toMatch(/promptHealthSyncOnce/);
    }
    expect(nativeHealth.source).toMatch(/export function markHealthSyncPrompted\(userId: number\)/);
  });

  it("renders the disclosure in every component that can turn sync on", () => {
    const surfaces = files.filter(
      (f) => f.path !== nativeHealth.path && /\benableHealthSync\(/.test(f.source),
    );
    // Both known surfaces are named so a rename cannot quietly shrink the scan.
    expect(surfaces.map((f) => f.path).sort()).toEqual([
      "client/src/components/notification-settings-dialog.tsx",
      "client/src/components/wellness-gate.tsx",
    ]);
    for (const f of surfaces) {
      expect(f.source, f.path).toMatch(/import \{ APPLE_HEALTH_DISCLOSURE \} from "@shared\/apple-health-disclosure"/);
      expect(f.source, f.path).toMatch(/\{APPLE_HEALTH_DISCLOSURE\}/);
    }
  });

  it("on the check-in, the sheet opens only from the card's Turn on, and Not now is remembered", () => {
    const gate = files.find((f) => f.path.endsWith("wellness-gate.tsx"))!.source;
    // enableHealthSync is called once, inside acceptHealthAsk -- not from the
    // mount effect and not from the Sync button.
    expect(gate.match(/\benableHealthSync\(/g)).toHaveLength(1);
    const accept = gate.slice(
      gate.indexOf("async function acceptHealthAsk()"),
      gate.indexOf("function declineHealthAsk()"),
    );
    expect(accept).toMatch(/enableHealthSync\(healthUserId\)/);
    const decline = gate.slice(gate.indexOf("function declineHealthAsk()"), gate.indexOf("const [manualSyncing"));
    expect(decline).toMatch(/markHealthSyncPrompted\(healthUserId\)/);
    // The mount effect raises the card, and only when nothing has been asked yet.
    const effect = gate.slice(gate.indexOf("if (data || isLoading || !editable || !isNativeHealthSupported()) return;"));
    const effectBody = effect.slice(0, effect.indexOf("const interval = setInterval"));
    expect(effectBody).toMatch(/!hasPromptedHealthSync\(healthUserId\)/);
    expect(effectBody).toMatch(/setHealthAsk\(true\)/);
    expect(effectBody).not.toMatch(/enableHealthSync/);
    // The Sync button opens the card instead of the sheet while sync is off.
    const manual = gate.slice(gate.indexOf("async function handleManualSync()"), gate.indexOf("// Nothing on file yet for today"));
    expect(manual).toMatch(/if \(!isHealthSyncEnabled\(healthUserId\)\) \{\s*setHealthAsk\(true\);\s*return;/);
    expect(manual).not.toMatch(/enableHealthSync/);
    // The card renders the constant with a Turn on and a Not now.
    expect(gate).toMatch(/data-testid="health-disclosure"/);
    expect(gate).toMatch(/Turn on/);
    expect(gate).toMatch(/Not now/);
  });
});
