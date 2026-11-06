import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A TRACKER NAMES THE OBJECT IT EXPECTS (CLAUDE.md Rule #4), AND A DUMBBELL ROW EXPECTS A DUMBBELL.
 *
 * Until 2026-11-06 the bar dialog resolved its CoreML class posture-first: any lift whose height
 * ruler is unreliable (lying, seated, supported, bent_over) asked for a PLATE, whatever it was
 * performed with. For a barbell that is the right class anyway, so the order never showed -- until
 * the first dumbbell lift was filmed beside the sensor. The Single-Arm Dumbbell Row (bent_over)
 * asked for a plate: 14 frames at 0.37 confidence, a lock held on 0 of 963 frames, the object
 * system looking for an object that was not in the scene while the detector has a dumbbell class
 * trained on 430 boxes. The equipment's own class comes first now; "plate" is the fallback for an
 * implement with no class of its own.
 *
 * Stated as the ORDER of the two terms inside the one statement that resolves the class, bounded
 * by matching the statement's own semicolon, comments stripped. Mutations: swapping the terms back
 * reds the order case; dropping the equipment map entirely reds it too; a comment quoting the old
 * form is removed by the strip (proven directly below). */

const DIALOG = join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx");

function stripComments(text: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of text.split("\n")) {
    const t = line.trimStart();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//")) continue;
    out.push(line);
  }
  return out.join("\n");
}

describe("the bar dialog's object class", () => {
  const src = stripComments(readFileSync(DIALOG, "utf8"));
  const start = src.indexOf("const coreMlTrackingMode");
  const stmt = src.slice(start, src.indexOf(";", start));

  it("is the equipment's own class first, and a plate only for an implement with none", () => {
    expect(start, "the dialog no longer resolves coreMlTrackingMode").toBeGreaterThan(0);
    const equipmentAt = stmt.indexOf("COREML_TRACKING_MODE_BY_EQUIPMENT[equipment]");
    const postureAt = stmt.indexOf("heightCalibrationUnreliable(");
    expect(equipmentAt, "the equipment map is not consulted").toBeGreaterThan(0);
    expect(postureAt, "the posture fallback is gone -- a lying barbell lift with no equipment row loses its plate").toBeGreaterThan(0);
    expect(equipmentAt, "the posture branch runs before the equipment map: a dumbbell row asks for a plate again").toBeLessThan(postureAt);
    // The fallback joins the two with `??`, so a mapped class is never overruled by the posture.
    expect(stmt).toMatch(/\?\?\s*\(heightCalibrationUnreliable\(/);
  });

  it("the map still names a dumbbell and a kettlebell as their own classes", () => {
    const mapAt = src.indexOf("const COREML_TRACKING_MODE_BY_EQUIPMENT");
    const map = src.slice(mapAt, src.indexOf("};", mapAt));
    expect(map).toMatch(/Dumbbell: "dumbbell"/);
    expect(map).toMatch(/Kettlebell: "kettlebell"/);
    expect(map).toMatch(/Barbell: "plate"/);
  });

  it("the comment strip removes a quoted old form", () => {
    const prose = `// const coreMlTrackingMode = heightCalibrationUnreliable(exerciseName, movementType) ? "plate" : ...\nconst y = 2;`;
    expect(stripComments(prose)).not.toMatch(/heightCalibrationUnreliable/);
  });
});
