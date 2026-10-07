import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  OBJECT_SYSTEM_BY_TRACKER,
  declareObjectSystem,
  type TrackerKey,
} from "@shared/capture-object-system";

// RULE #4's QUIETER HALF. "Every capture mode names the object it expects, and if the scene
// genuinely has no implement (jump, sprint, mechanics, horizontal_load) it names what it DOES
// have -- a box, a ground plane -- or records explicitly that it has none, so overwatch's
// silence is a recorded fact and not an absence."
//
// Four trackers answered by silence for as long as they existed: they pass no `trackingMode`, the
// CoreML detector is inert, and an export cannot tell that from a detector that broke. The
// 2026-10-04 box jump is what that costs -- the box detector DID run and nothing said so.
//
// A scan, never a list, for the reason refused-capture-survives.test.ts gives: that file began as
// a hand-written list of eight dialogs and, rerun as a scan, found six more.
const DIALOGS = join(process.cwd(), "client/src/components");
const dialogFiles = () => readdirSync(DIALOGS).filter((f) => f.endsWith("tracker-dialog.tsx"));

describe("every capture mode declares its object system", () => {
  it("no tracker dialog writes diagnostics without declaring one", () => {
    const offenders: string[] = [];
    for (const file of dialogFiles()) {
      const src = readFileSync(join(DIALOGS, file), "utf8");
      if (!/trackingDiagnostics|buildTrackingDiagnostics/.test(src)) continue;
      if (!/declareObjectSystem\(/.test(src)) offenders.push(file);
    }
    expect(offenders, `these write diagnostics and declare no object system: ${offenders.join(", ")}`)
      .toEqual([]);
  });

  it("every buildTrackingDiagnostics call carries one, not just the file", () => {
    // A dialog with six call sites and a declaration on five is the bug this catches: the file
    // greps clean and one take in six still ships silent.
    const offenders: string[] = [];
    for (const file of dialogFiles()) {
      const src = readFileSync(join(DIALOGS, file), "utf8");
      const calls = src.split("buildTrackingDiagnostics({").slice(1);
      for (const [i, body] of calls.entries()) {
        if (!/objectSystem:/.test(body.slice(0, 400))) offenders.push(`${file}#${i + 1}`);
      }
    }
    expect(offenders, `these call sites declare nothing: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the four implement-less modes declare EXPLICITLY, which is the whole point", () => {
    // Named rather than scanned: these four are the ones that were silent, and a scan would go
    // quiet again if one were deleted. "none" is a correct answer; absence is not.
    for (const key of ["av_jump", "av_sprint", "av_mechanics", "av_horizontal_load"] as TrackerKey[]) {
      const d = OBJECT_SYSTEM_BY_TRACKER[key];
      expect(d, `${key} has no declaration`).toBeTruthy();
      expect(d.reason.length, `${key} declares nothing a reader can act on`).toBeGreaterThan(20);
    }
    // And the jump is not "none": it has the rectangle box detector, which is the fact the
    // 2026-10-04 take could not report.
    expect(OBJECT_SYSTEM_BY_TRACKER.av_jump.declared).toBe("box");
    expect(OBJECT_SYSTEM_BY_TRACKER.av_jump.boxDetector).toBe(true);
    expect(OBJECT_SYSTEM_BY_TRACKER.av_sprint.declared).toBe("none");
  });

  it("every tracker dialog on disk has a key in the registry", () => {
    const keys = new Set(Object.keys(OBJECT_SYSTEM_BY_TRACKER));
    const missing = dialogFiles()
      .map((f) => f.replace("-tracker-dialog.tsx", "").replace(/-/g, "_"))
      .filter((k) => !keys.has(k));
    expect(missing, `no declaration for: ${missing.join(", ")}`).toEqual([]);
  });

  it("hands out a fresh record, so one take cannot move another's", () => {
    const a = declareObjectSystem("av_bar", { coreMlClass: "plate" });
    const b = declareObjectSystem("av_bar", { coreMlClass: "dumbbell" });
    expect(a).not.toBe(b);
    expect(a.coreMlClass).toBe("plate");
    expect(b.coreMlClass).toBe("dumbbell");
    a.reason = "scribbled";
    expect(OBJECT_SYSTEM_BY_TRACKER.av_bar.reason).not.toBe("scribbled");
    expect(declareObjectSystem("av_bar").reason).not.toBe("scribbled");
  });

  it("is declared in the zod schema, which strips what it does not declare", () => {
    const schema = readFileSync(join(process.cwd(), "shared/schema.ts"), "utf8");
    expect(schema).toMatch(/objectSystem: z\s*\n?\s*\.object\(\{/);
    for (const f of ["declared", "coreMlClass", "secondaryCoreMlClass", "boxDetector", "reason"]) {
      expect(schema, `objectSystem.${f} is not declared`).toContain(f);
    }
  });

  it("gates nothing (Rule #1): nothing anywhere branches on the declaration", () => {
    // declareObjectSystem's own body may read it; no tracker, arbiter or summariser may.
    const offenders: string[] = [];
    for (const file of dialogFiles()) {
      const src = readFileSync(join(DIALOGS, file), "utf8");
      if (/(if|\?|&&|\|\|)[^\n]*\.declared\b/.test(src)) offenders.push(file);
    }
    expect(offenders, `these branch on the declaration: ${offenders.join(", ")}`).toEqual([]);
  });
});
