/**
 * THE EXPORT NAMES THE LENS THE TAKE WAS FILMED ON, NOT THE ONE THE CAMERA OPENED ON.
 *
 * 2026-11-24: Scott asked whether filming at 0.5x reads as accurately as 1x, and every capture in
 * the export said "wide" -- because extractCaptureDeviceInfo read only the session's opening
 * "using lens:" line, and a 0.5x tapped after the camera opened logs "switched lens to ultraWide"
 * and nothing else. So the one question the field exists to answer could not be answered.
 */
import { describe, expect, it } from "vitest";
import { extractCaptureDeviceInfo } from "./native-av-preview";

describe("the lens a take was filmed on", () => {
  it("is the last lens the session moved to", () => {
    const info = extractCaptureDeviceInfo([
      "device model=iPhone systemVersion=27.2",
      "using lens: wide",
      "switched lens to ultraWide",
      "cam: lens=0.80 iso=100 exp=8.0ms zoom=1.00 adjustingFocus=false",
    ]);
    expect(info.lens).toBe("ultraWide");
    expect(info.lensSwitches).toBe(1);
    expect(info.zoomFactor).toBe(1);
  });

  it("is the opening lens when nothing was switched", () => {
    const info = extractCaptureDeviceInfo(["using lens: wide", "cam: zoom=2.00"]);
    expect(info.lens).toBe("wide");
    expect(info.lensSwitches).toBe(0);
    expect(info.zoomFactor).toBe(2);
  });
});
