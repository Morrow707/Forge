import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* THE 3D POSE IS TOLD WHICH LENS FILMED THE FRAME (2026-11-24, round twenty-seven).
 *
 * VNDetectHumanBodyPose3DRequest was performed on a handler built with `options: [:]`, so Vision
 * had to assume a lens. The camera opens on 0.5x since build 836 (106 degrees), and on the first
 * 0.5x takes the depth ruler -- the wrist depth Vision returned, times 2 tan(fov / 2) -- read
 * 1.94x the sensor's scale on the bench and 1.90x on the press, where the 3D bone lengths, which
 * do not depend on depth, stayed within 3%. The fix hands the 3D request camera intrinsics built
 * from the format's own field of view, on the live path AND the file path.
 *
 * Swift has no test target, so this reads the source with comments stripped and whitespace
 * collapsed, then asks for exact statements. */
const raw = readFileSync(join(process.cwd(), "ios/App/App/AvBodyTrackingPlugin.swift"), "utf8");

const BLOCK_OPEN = "/*";
const BLOCK_CLOSE = "*/";
const LINE_COMMENT = "//";

/** Drop block comments (cut at the next close marker), then end-of-line comments, then collapse
 *  every run of whitespace to one space. */
function stripped(src: string): string {
  const withoutBlocks = src
    .split(BLOCK_OPEN)
    .map((piece, index) => (index === 0 ? piece : piece.slice(piece.indexOf(BLOCK_CLOSE) + BLOCK_CLOSE.length)))
    .join(" ");
  return withoutBlocks
    .split("\n")
    .map((line) => (line.includes(LINE_COMMENT) ? line.slice(0, line.indexOf(LINE_COMMENT)) : line))
    .join(" ")
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .join(" ");
}
const swift = stripped(raw);

describe("the 3D pose request carries camera intrinsics", () => {
  it("builds a handler with .cameraIntrinsics from the field of view and the frame size", () => {
    expect(swift).toContain("options: [.cameraIntrinsics: data]");
    expect(swift).toContain("let focal = (max(width, height) / 2) / Float(tan(fov * Double.pi / 360))");
    expect(swift).toContain("SIMD3<Float>(width / 2, height / 2, 1)");
  });

  it("performs the 3D request on that handler, never on the 2D one", () => {
    expect(swift).toContain(
      "try Self.body3DHandler(pixelBuffer: pixelBuffer, orientation: ctx.orientation, fieldOfViewDeg: ctx.fieldOfViewDeg, fallback: handler) .perform([body3DRequest])",
    );
    expect(swift).not.toContain("try handler.perform([body3DRequest])");
  });

  it("gives both the live and the file context the lens's field of view", () => {
    expect(swift).toContain("liveContext?.fieldOfViewDeg = activeFieldOfViewDeg");
    expect(swift).toContain("ctx.fieldOfViewDeg = Self.recordedFieldOfView(forPath: url.path) ?? activeFieldOfViewDeg");
    expect(swift).toContain("Self.rememberFieldOfView(activeFieldOfViewDeg, forPath: outputURL.path)");
    expect(swift).toContain("activeFormat.videoFieldOfView");
  });

  it("falls back to the old handler when no field of view is known, so nothing is refused", () => {
    expect(swift).toContain("guard let fov = fieldOfViewDeg, fov > 1, fov < 179 else { return fallback }");
  });
});
