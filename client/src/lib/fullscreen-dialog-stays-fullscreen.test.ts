import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fullBleedStyle } from "@/components/ui/dialog";

// An inline style beats every Tailwind class. DialogContent centres itself in the safe area
// with an inline top/maxHeight, which on 2026-09-22 silently overrode the `top-0 max-h-none`
// that every full-screen camera dialog sets -- the viewfinder started halfway down the screen
// with black above it. These assertions are the ratchet on that.
describe("a full-bleed dialog keeps its own geometry", () => {
  it("leaves top alone when the caller sets top-0", () => {
    const style = fullBleedStyle("inset-0 top-0 left-0 h-screen w-screen", undefined);
    expect(style?.top).toBeUndefined();
  });

  it("leaves maxHeight alone when the caller sets max-h-none", () => {
    const style = fullBleedStyle("max-w-none max-h-none", undefined);
    expect(style?.maxHeight).toBeUndefined();
  });

  it("still centres an ordinary dialog in the safe area", () => {
    const style = fullBleedStyle("sm:max-w-lg", undefined);
    expect(style?.top).toContain("safe-area-inset-top");
    expect(style?.maxHeight).toContain("100dvh");
  });

  it("never matches a longer class that merely contains the name", () => {
    const style = fullBleedStyle("lg:top-0.5 group-data-[x]:max-h-none-ish", undefined);
    expect(style?.top).toContain("safe-area-inset-top");
  });

  it("lets the caller's own style win", () => {
    const style = fullBleedStyle("sm:max-w-lg", { top: "1rem" });
    expect(style?.top).toBe("1rem");
  });

  // The full-screen dialogs all declare BOTH classes. One that drops either would be centred
  // and clamped again, which is the bug, so hold the pairing rather than a list of files.
  it("every full-screen DialogContent declares top-0 AND max-h-none", () => {
    const dir = join(process.cwd(), "client/src/components");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
      const src = readFileSync(join(dir, file), "utf8");
      for (const line of src.split("\n")) {
        if (!line.includes("h-screen w-screen")) continue;
        if (!/(^|\s|")top-0(\s|")/.test(line) || !/(^|\s|")max-h-none(\s|")/.test(line)) {
          offenders.push(`${file}: ${line.trim().slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
